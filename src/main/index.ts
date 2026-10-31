import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  utilityProcess,
} from "electron";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { publicCommands } from "../shared/commands";

app.setName("HistoryTrainer");
if (process.env.HISTORY_TRAINER_DATA_DIR)
  app.setPath("userData", process.env.HISTORY_TRAINER_DATA_DIR);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "history-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let worker: Electron.UtilityProcess,
  window: BrowserWindow | null = null;
let workerFailure: Error | null = null;
function request(command: string, payload?: unknown): Promise<any> {
  if (workerFailure) return Promise.reject(workerFailure);
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, command, payload });
  });
}
async function startWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    worker = utilityProcess.fork(
      join(__dirname, "worker.js"),
      [app.getPath("userData")],
      { serviceName: "History Trainer — данные", stdio: "pipe" },
    );
    worker.on("message", (message: any) => {
      if (message.ready) {
        resolve();
        return;
      }
      if (message.fatal) {
        workerFailure = new Error(message.fatal);
        reject(workerFailure);
        return;
      }
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      message.ok
        ? callback.resolve(message.value)
        : callback.reject(new Error(message.error));
    });
    worker.on("exit", () => {
      workerFailure = new Error(
        "Процесс данных остановлен. Перезапустите приложение; сохранённые данные остаются на диске.",
      );
      for (const item of pending.values()) item.reject(workerFailure);
      pending.clear();
      reject(workerFailure);
    });
    worker.stderr?.on("data", (data) => console.error(String(data)));
  });
}
async function importFiles(): Promise<unknown[]> {
  const selected = await dialog.showOpenDialog(window!, {
    title: "Добавить локальные изображения",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Изображения", extensions: ["png", "jpg", "jpeg", "webp"] },
    ],
  });
  if (selected.canceled) return [];
  const result = [];
  for (const path of selected.filePaths) {
    if ((await stat(path)).size > 50 * 1024 * 1024)
      throw new Error("Изображение больше 50 МБ");
    const bytes = await readFile(path);
    result.push(
      await request("media.import", {
        name: path.split(/[\\/]/).at(-1),
        base64: bytes.toString("base64"),
      }),
    );
  }
  return result;
}
function registerApi(): void {
  ipcMain.handle(
    "history:request",
    async (event, command: unknown, payload: unknown) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error("Недопустимый источник команды");
      const cmd = z.string().parse(command);
      if ((publicCommands as readonly string[]).includes(cmd))
        return request(cmd, payload);
      if (cmd === "desktop.importImages") return importFiles();
      if (cmd === "desktop.importImageBytes")
        return request("media.import", payload);
      if (cmd === "desktop.openDataDirectory") {
        const { shell } = await import("electron");
        const error = await shell.openPath(app.getPath("userData"));
        if (error) throw new Error(error);
        return;
      }
      if (cmd === "desktop.export") {
        const format = z.enum(["json", "csv", "backup"]).parse(payload),
          ext = format === "backup" ? "zip" : format;
        const chosen = await dialog.showSaveDialog(window!, {
          title:
            format === "backup"
              ? "Полная резервная копия"
              : "Экспорт материалов",
          defaultPath: `history-trainer-${new Date().toISOString().slice(0, 10)}.${ext}`,
          filters: [{ name: format.toUpperCase(), extensions: [ext] }],
        });
        if (chosen.canceled || !chosen.filePath) return null;
        return request("file.export", { format, path: chosen.filePath });
      }
      if (cmd === "desktop.import") {
        const format = z.enum(["json", "csv", "backup"]).parse(payload),
          ext = format === "backup" ? "zip" : format;
        const chosen = await dialog.showOpenDialog(window!, {
          title:
            format === "backup"
              ? "Восстановить полную копию"
              : "Импорт с предварительным просмотром",
          properties: ["openFile"],
          filters: [{ name: format.toUpperCase(), extensions: [ext] }],
        });
        if (chosen.canceled) return null;
        if (format === "backup") {
          const confirm = await dialog.showMessageBox(window!, {
            type: "warning",
            title: "Заменить текущую базу?",
            message:
              "Восстановление заменит материал, настройки и историю текущей базой из архива.",
            detail:
              "Сначала архив будет проверен и создана полная предварительная копия текущей базы. При ошибке рабочая база не заменяется.",
            buttons: ["Отмена", "Проверить и восстановить"],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          });
          if (confirm.response !== 1) return null;
        }
        return request("file.import", { format, path: chosen.filePaths[0] });
      }
      throw new Error("Команда недоступна");
    },
  );
  protocol.handle("history-media", async (req) => {
    try {
      const url = new URL(req.url);
      if (url.hostname !== "asset" || !/^\/[a-f0-9-]{36}$/.test(url.pathname))
        return new Response("Not found", { status: 404 });
      const path = await request("media.path", url.pathname.slice(1));
      return net.fetch(pathToFileURL(path).toString());
    } catch {
      return new Response("Image unavailable", { status: 404 });
    }
  });
}
async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#101315",
    title: "History Trainer",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.removeMenu();
  window.once("ready-to-show", () => window?.show());
  const dev = process.env.ELECTRON_RENDERER_URL;
  window.webContents.session.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          dev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' history-media: data:; connect-src 'self' ws: http://localhost:*"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' history-media: data:; connect-src 'self' history-media:",
        ],
      },
    }),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (
      url !==
      (dev ??
        pathToFileURL(join(__dirname, "../renderer/index.html")).toString())
    )
      event.preventDefault();
  });
  window.on("closed", () => {
    window = null;
  });
  if (dev) await window.loadURL(dev);
  else await window.loadFile(join(__dirname, "../renderer/index.html"));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    try {
      await startWorker();
      registerApi();
      await createWindow();
    } catch (e) {
      console.error(e);
      dialog.showErrorBox(
        "Не удалось открыть History Trainer",
        (e as Error).message,
      );
      app.exit(1);
    }
  });
  app.on("window-all-closed", () => {
    worker?.kill();
    app.quit();
  });
}
