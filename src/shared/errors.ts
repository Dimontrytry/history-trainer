import { ZodError } from "zod";
export function userMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const names: Record<string, string> = {
      title: "название",
      topicId: "тема",
      dateText: "дата",
      templates: "вопросы",
      expected: "эталон",
      prompt: "текст вопроса",
      alternatives: "допустимые ответы",
      mediaIds: "изображения",
      tags: "теги",
      criteria: "критерии",
      count: "количество вопросов",
      document: "конспект",
      version: "версия формата",
      format: "формат файла",
    };
    const fields = [
      ...new Set(
        error.issues.map((i) => names[String(i.path[0])] ?? "данные записи"),
      ),
    ];
    return (
      "Проверьте формат и обязательные значения: " +
      fields.join(", ") +
      ". Пустые варианты ответа нужно удалить или заполнить."
    );
  }
  const e = error as { code?: string; message?: string };
  if (
    /Input (buffer|file)|unsupported image|corrupt|Vips.*Error/i.test(
      e.message ?? "",
    )
  )
    return "Изображение не удалось прочитать: файл повреждён или формат не поддерживается. Используйте JPEG, PNG или WebP.";
  if (error instanceof SyntaxError)
    return "Не удалось прочитать структуру JSON. Проверьте файл; данные не должны подменяться пустой базой.";
  if (e.code === "ENOENT")
    return "Не найден файл или каталог. Проверьте расположение данных и медиатеку.";
  if (e.code === "ENOSPC")
    return "Недостаточно места на диске. Освободите место и повторите операцию.";
  if (e.code === "EACCES" || e.code === "EPERM")
    return "Нет доступа к выбранному файлу или каталогу. Выберите доступное расположение.";
  if (e.code?.startsWith("SQLITE_CONSTRAINT"))
    return "Изменение не сохранено: проверьте связанные записи и отсутствие повторяющихся значений.";
  if (e.code?.startsWith("CSV_"))
    return "Не удалось прочитать CSV. Проверьте заголовки, кавычки и разделители строк.";
  if (
    /end of central directory|invalid zip|unexpected end|invalid signature|invalid relative path/i.test(
      e.message ?? "",
    )
  )
    return "Архив повреждён или имеет неподдерживаемую структуру. Рабочая база не заменена.";
  return e.message ?? "Не удалось выполнить операцию";
}
