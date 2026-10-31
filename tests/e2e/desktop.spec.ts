import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import sharp from "sharp";
const require = createRequire(join(process.cwd(), "package.json"));

test("Создание материала, два Enter, сохранение после перезапуска и реальные экраны", async () => {
  const profile = mkdtempSync(join(tmpdir(), "history-trainer-e2e-"));
  let desktop: ElectronApplication | undefined;
  const errors: string[] = [];
  async function launch() {
    desktop = await electron.launch({
      executablePath:
        process.env.HISTORY_TRAINER_E2E_BINARY || require("electron"),
      args: [
        ...(process.env.HISTORY_TRAINER_TEST_NO_SANDBOX === "1"
          ? ["--no-sandbox"]
          : []),
        ".",
      ],
      env: { ...process.env, HISTORY_TRAINER_DATA_DIR: profile },
    });
    const page = await desktop.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await expect(
      page.getByRole("heading", { name: "Ваше знание. В деталях." }),
    ).toBeVisible();
    return page;
  }
  try {
    let page = await launch();
    await expect(
      page.getByText("Библиотека начинается с вашего материала"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Библиотека", exact: false })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Добавить материал", exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: "Новый материал" });
    await expect(modal).toBeVisible();
    await modal
      .getByLabel("Название / вопрос")
      .fill("Синтетический объект E2E");
    await modal.getByLabel("Дата или период").fill("08.09.1380");
    await modal.getByRole("button", { name: "Сохранить материал" }).click();
    await expect(modal).not.toBeVisible();
    await expect(
      page
        .locator("button.item-title")
        .filter({ hasText: "Синтетический объект E2E" }),
    ).toBeVisible();
    await page
      .locator(".library-tree .tree-item")
      .filter({ hasText: "История России" })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Главная", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Продолжить: История России" })
      .click();
    await expect(
      page.locator(".library-tree .tree-item.selected"),
    ).toContainText("История России");
    await page
      .getByRole("button", { name: "Тестирование", exact: true })
      .click();
    await page.getByLabel("Количество вопросов").fill("1");
    await page.getByLabel("Событие → дата", { exact: true }).check();
    await page
      .getByRole("button", { name: "Начать тест", exact: true })
      .click();
    const answer = page.getByRole("textbox", { name: "Ваш ответ" });
    await expect(answer).toBeVisible();
    await answer.fill("неокончательный ответ");
    await answer.press("Enter");
    await expect(page.getByText("Вы уверены?", { exact: true })).toBeVisible();
    const pending = await page.evaluate(() =>
      window.historyTrainer.request<any>("bootstrap"),
    );
    expect(pending.stats.correct).toBe(0);
    expect(pending.stats.partial).toBe(0);
    expect(pending.sessions[0].answered).toBe(0);
    await answer.fill("1380");
    await answer.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Результаты теста" }),
    ).toBeVisible();
    await expect(
      page.getByText("Частичный ответ", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("08.09.1380", { exact: true })).toBeVisible();
    const stored = await page.evaluate(() =>
      window.historyTrainer.request<any>("bootstrap"),
    );
    expect(stored.items[0].progress).toBe(1.25);
    expect(stored.stats.partial).toBe(1);
    expect(stored.sessions[0].answered).toBe(1);
    await desktop!.close();
    desktop = undefined;
    page = await launch();
    const reopened = await page.evaluate(() =>
      window.historyTrainer.request<any>("bootstrap"),
    );
    expect(reopened.items[0].title).toBe("Синтетический объект E2E");
    expect(reopened.items[0].progress).toBe(1.25);
    expect(reopened.stats.partial).toBe(1);
    for (const nav of [
      "Библиотека",
      "Тестирование",
      "Конспекты",
      "Ошибки",
      "Статистика",
      "Медиатека",
      "Настройки",
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: nav, exact: false })
        .click();
      await expect(page.locator("main h1")).toBeVisible();
    }
    await page.screenshot({
      path: "test-results/desktop-settings.png",
      fullPage: true,
    });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Главная", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/desktop-dashboard.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await desktop?.close();
    rmSync(profile, { recursive: true, force: true });
  }
});

test("Массовый ввод с исправлением, drag & drop настоящего изображения и конспект", async () => {
  const profile = mkdtempSync(join(tmpdir(), "history-trainer-e2e-media-"));
  const desktop = await electron.launch({
    executablePath:
      process.env.HISTORY_TRAINER_E2E_BINARY || require("electron"),
    args: ["."],
    env: { ...process.env, HISTORY_TRAINER_DATA_DIR: profile },
  });
  const errors: string[] = [];
  try {
    const page = await desktop.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("heading", { name: "Ваше знание. В деталях." }),
    ).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Библиотека", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Массовый ввод", exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: "Массовый ввод материала" });
    await modal
      .getByLabel("Текст", { exact: true })
      .fill("1200 — Синтетическая запись A\nнепонятная строка");
    await modal.getByRole("button", { name: "Распознать и проверить" }).click();
    await expect(
      modal.getByRole("button", { name: "Подтвердить сохранение (2)" }),
    ).toBeDisabled();
    const before = await page.evaluate(() =>
      window.historyTrainer.request<any>("bootstrap"),
    );
    expect(before.items).toHaveLength(0);
    await modal.getByRole("textbox", { name: "Дата строки 2" }).fill("1201");
    await modal
      .getByRole("textbox", { name: "Название строки 2" })
      .fill("Синтетическая запись B");
    await modal
      .getByRole("button", { name: "Подтвердить сохранение (2)" })
      .click();
    await expect(modal).not.toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Медиатека", exact: true })
      .click();
    const bytes = await sharp({
      create: { width: 30, height: 20, channels: 3, background: "#a1c4aa" },
    })
      .png()
      .toBuffer();
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        file = new File([bytes], "synthetic-drag.png", { type: "image/png" }),
        transfer = new DataTransfer();
      transfer.items.add(file);
      document.querySelector(".dropzone")!.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    }, bytes.toString("base64"));
    const img = page.getByRole("img", { name: "synthetic-drag.png" });
    await expect(img).toBeVisible();
    await expect
      .poll(() =>
        img.evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBe(30);
    await page.getByRole("button", { name: "Проверить медиатеку" }).click();
    await expect(
      page.getByText("Проверено файлов: 1. Проблем: 0."),
    ).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Конспекты", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Новый конспект", exact: true })
      .click();
    const note = page.getByRole("dialog", { name: "Новый конспект" });
    await note
      .getByLabel("Название", { exact: true })
      .fill("Синтетический конспект E2E");
    await note.locator(".tiptap").fill("Сохранённый текст конспекта");
    await note
      .getByRole("checkbox", { name: "Синтетическая запись A" })
      .check();
    await note.getByRole("button", { name: "Сохранить конспект" }).click();
    await expect(note).not.toBeVisible();
    await page
      .getByRole("button", { name: "Синтетический конспект E2E", exact: true })
      .click();
    const reopened = page.getByRole("dialog", {
      name: "Конспект",
      exact: true,
    });
    await expect(reopened.locator(".tiptap")).toHaveText(
      "Сохранённый текст конспекта",
    );
    await expect(
      reopened.getByRole("checkbox", { name: "Синтетическая запись A" }),
    ).toBeChecked();
    expect(errors).toEqual([]);
  } finally {
    await desktop.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
