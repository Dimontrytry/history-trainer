import { contextBridge, ipcRenderer } from "electron";

const request = (command: string, payload?: unknown) =>
  ipcRenderer.invoke("history:request", command, payload);
contextBridge.exposeInMainWorld("historyTrainer", {
  request,
  importImages: () => request("desktop.importImages"),
  importDroppedImages: async (files: { name: string; base64: string }[]) => {
    const result = [];
    for (const file of files)
      result.push(await request("desktop.importImageBytes", file));
    return result;
  },
  exportFile: (format: string) => request("desktop.export", format),
  importFile: (format: string) => request("desktop.import", format),
  assetUrl: (id: string) => `history-media://asset/${encodeURIComponent(id)}`,
});
