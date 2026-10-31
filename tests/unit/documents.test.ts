import { describe, it, expect } from "vitest";
import { validateDocument } from "../../src/domain/documents";
const doc = (content: unknown[]) => ({ type: "doc", content });
describe("Локальные изображения в конспекте", () => {
  it("не допускает hotlink или ссылку на отсутствующее изображение", () => {
    expect(() =>
      validateDocument(
        doc([
          { type: "image", attrs: { src: "https://example.com/image.png" } },
        ]),
        () => true,
      ),
    ).toThrow(/локальной медиатеке/);
    expect(() =>
      validateDocument(
        doc([
          {
            type: "image",
            attrs: {
              src: "history-media://asset/00000000-0000-4000-8000-000000000000",
            },
          },
        ]),
        () => false,
      ),
    ).toThrow(/локальной медиатеке/);
  });
  it("принимает настоящий локальный ID и обычный текст", () =>
    expect(() =>
      validateDocument(
        doc([
          { type: "paragraph", content: [{ type: "text", text: "Текст" }] },
          {
            type: "image",
            attrs: {
              src: "history-media://asset/00000000-0000-4000-8000-000000000000",
            },
          },
        ]),
        () => true,
      ),
    ).not.toThrow());
  it("отклоняет исполняемые ссылки и неизвестные узлы", () => {
    expect(() =>
      validateDocument(
        doc([
          {
            type: "text",
            text: "Ссылка",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ]),
        () => true,
      ),
    ).toThrow(/HTTP/);
    expect(() =>
      validateDocument(doc([{ type: "script" }]), () => true),
    ).toThrow();
  });
});
