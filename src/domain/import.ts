import type { ImportRow } from "../shared/models";
import { parseDate } from "./dates";

export function previewText(text: string): ImportRow[] {
  return text
    .split(/\r?\n/)
    .map((text, index) => ({ text: text.trim(), index: index + 1 }))
    .filter((r) => r.text)
    .map((row) => {
      // An explicit spaced delimiter distinguishes an event separator from a year range.
      const parts = row.text.split(/\s+[—–-]\s+/);
      if (parts.length !== 2)
        return {
          ...row,
          title: "",
          dateText: "",
          error:
            "Нужен разделитель « — » между датой и названием; неоднозначные строки исправьте вручную",
        };
      try {
        parseDate(parts[0]);
        if (!parts[1].trim()) throw new Error("Нет названия");
        return {
          ...row,
          dateText: parts[0].trim(),
          title: parts[1].trim(),
          error: null,
        };
      } catch (e) {
        return {
          ...row,
          dateText: parts[0].trim(),
          title: parts[1].trim(),
          error: (e as Error).message,
        };
      }
    });
}
