const nodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
  "image",
]);
const marks = new Set([
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
  "link",
]);
export function validateDocument(
  document: Record<string, unknown>,
  assetExists: (id: string) => boolean,
): void {
  if (JSON.stringify(document).length > 2_000_000)
    throw new Error("Конспект превышает допустимый размер");
  let count = 0;
  function visit(raw: unknown, depth: number) {
    if (++count > 10000 || depth > 50)
      throw new Error("Конспект содержит слишком сложную структуру");
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Некорректный элемент конспекта");
    const node = raw as {
      type?: unknown;
      attrs?: Record<string, unknown>;
      marks?: unknown[];
      content?: unknown[];
    };
    if (typeof node.type !== "string" || !nodes.has(node.type))
      throw new Error("Неподдерживаемый элемент конспекта");
    if (node.type === "image") {
      const src = node.attrs?.src;
      if (
        typeof src !== "string" ||
        !/^history-media:\/\/asset\/[a-f0-9-]{36}$/.test(src) ||
        !assetExists(src.split("/").at(-1)!)
      )
        throw new Error(
          "Изображение конспекта должно существовать в локальной медиатеке. Сначала импортируйте файл.",
        );
    }
    for (const rawMark of node.marks ?? []) {
      const mark = rawMark as { type: string; attrs?: Record<string, unknown> };
      if (!mark || !marks.has(mark.type))
        throw new Error("Неподдерживаемое форматирование конспекта");
      if (mark.type === "link") {
        const href = mark.attrs?.href;
        if (typeof href !== "string" || !/^https?:\/\//i.test(href))
          throw new Error("В конспекте допустимы ссылки HTTP/HTTPS");
      }
    }
    if (node.content !== undefined && !Array.isArray(node.content))
      throw new Error("Некорректная структура конспекта");
    for (const child of node.content ?? []) visit(child, depth + 1);
  }
  if (document.type !== "doc") throw new Error("Ожидается документ конспекта");
  visit(document, 0);
}
