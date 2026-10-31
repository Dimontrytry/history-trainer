import { describe, expect, it } from "vitest";
import { parseDate, sameDate } from "../../src/domain/dates";
import { knowledge, level, mean } from "../../src/domain/progress";
import { gradeAnswer, normalize } from "../../src/domain/validation";
import { previewText } from "../../src/domain/import";
import { templateSchema } from "../../src/shared/models";

describe("Исторические даты", () => {
  it.each([
    "08.09.1380",
    "8 сентября 1380",
    "08/09/1380",
    "8 сентября 1380 года",
  ])("распознаёт полную дату %s", (text) => {
    const d = parseDate(text);
    expect(d.start).toEqual({ year: 1380, month: 9, day: 8 });
    expect(d.kind).toBe("day");
  });
  it.each(["1380", "1380 год", "1380 г."])("распознаёт год %s", (text) =>
    expect(parseDate(text).start.year).toBe(1380),
  );
  it.each([
    "0",
    "32.01.1380",
    "29.02.1381",
    "13.13.1200",
    "IIII век",
    "третья половина XV века",
    "1241–1237",
    "40–44 до н. э.",
  ])("отклоняет неверное значение %s", (text) =>
    expect(() => parseDate(text)).toThrow(),
  );
  it("различает календари для високосного дня", () => {
    expect(() => parseDate("29.02.1700", "gregorian")).toThrow();
    expect(parseDate("29.02.1700", "julian").start.day).toBe(29);
  });
  it("сохраняет эру и направление диапазона BCE", () => {
    const d = parseDate("44–40 до н. э.");
    expect(d.start.year).toBe(-44);
    expect(d.end!.year).toBe(-40);
    expect(d.lower).toBeLessThan(d.upper);
    expect(parseDate("1 до н. э.").lower).toBeLessThan(parseDate("1").lower);
  });
  it.each([
    ["XIII век", 1201, 1300],
    ["вторая половина XV века", 1451, 1500],
    ["3-я четверть XVII века", 1651, 1675],
  ])("структурирует %s", (text, start, end) => {
    const d = parseDate(text);
    expect(d.start.year).toBe(start);
    expect(d.end!.year).toBe(end);
  });
  it("структурирует часть века до нашей эры в хронологическом порядке", () => {
    const d = parseDate("первая половина I века до н. э.");
    expect(d.start.year).toBe(-100);
    expect(d.end!.year).toBe(-51);
  });
  it("не приравнивает точность и приблизительность", () => {
    expect(sameDate(parseDate("1380"), parseDate("08.09.1380"))).toBe(false);
    expect(sameDate(parseDate("около 980 года"), parseDate("980"))).toBe(false);
  });
});
describe("Проверка ответа", () => {
  const date = templateSchema.parse({
    direction: "date",
    kind: "date",
    prompt: "Дата?",
    expected: "08.09.1380",
  });
  it("принимает текстовую запись дня", () =>
    expect(gradeAnswer(date, "8 сентября 1380").units).toBe(2));
  it("даёт частичный балл только за верный год без дня", () => {
    expect(gradeAnswer(date, "1380").units).toBe(1);
    expect(gradeAnswer(date, "09.09.1380").units).toBe(0);
    expect(gradeAnswer(date, "1381").units).toBe(0);
  });
  it("не принимает приблизительную дату за точную", () =>
    expect(gradeAnswer(date, "около 1380").units).toBe(0));
  const text = templateSchema.parse({
    direction: "text",
    kind: "short",
    prompt: "Тест",
    expected: "Синтетический термин",
    alternatives: ["Учебное определение"],
  });
  it("нормализует регистр, пробелы и Ё/Е", () => {
    expect(normalize("  ЁЛКА   и Ель  ")).toBe("елка и ель");
    expect(gradeAnswer(text, "  СИНТЕТИЧЕСКИЙ   ТЕРМИН ").units).toBe(2);
  });
  it("принимает явно указанный синоним", () =>
    expect(gradeAnswer(text, "учебное определение").units).toBe(2));
  it("не признаёт похожую фамилию правильной автоматически", () => {
    const t = { ...text, expected: "Иванов", alternatives: [] };
    expect(gradeAnswer(t, "Иванова").outcome).toBe("needs_review");
    expect(gradeAnswer(t, "Петров").units).toBe(0);
  });
  it("не удаляет смысл отрицания или чисел", () => {
    expect(
      gradeAnswer(
        { ...text, expected: "не принимать", alternatives: [] },
        "принимать",
      ).units,
    ).toBe(0);
    expect(
      gradeAnswer({ ...text, expected: "Пётр I", alternatives: [] }, "Пётр II")
        .outcome,
    ).not.toBe("correct");
  });
  it("самопроверка не выдаёт фиктивного балла", () =>
    expect(
      gradeAnswer({ ...text, checking: "manual" }, text.expected).units,
    ).toBeNull());
  it("критерии не подменяются подсчётом совпавших слов", () =>
    expect(
      gradeAnswer(
        { ...text, checking: "rubric", criteria: ["Первый смысловой пункт"] },
        "Первый смысловой пункт, но неверный вывод",
      ).outcome,
    ).toBe("needs_review"));
  it("проверяет явные смысловые пункты в другом порядке без неизвестных утверждений", () => {
    const t = {
      ...text,
      checking: "rubric" as const,
      criteria: ["Первый факт", "Второй факт"],
    };
    expect(gradeAnswer(t, "Второй факт. Первый факт.").units).toBe(2);
    expect(gradeAnswer(t, "Не первый факт. Второй факт.").outcome).toBe(
      "needs_review",
    );
    expect(
      gradeAnswer(t, "Первый факт. Второй факт. Ложный вывод.").outcome,
    ).toBe("needs_review");
  });
});
describe("Знание", () => {
  it("использует фиксированный знаменатель 20", () => {
    expect(knowledge([2])).toBe(5);
    expect(knowledge([1])).toBe(2.5);
    expect(knowledge([])).toBe(0);
  });
  it("сохраняет частичные баллы", () =>
    expect(knowledge([...Array(19).fill(2), 1])).toBe(97.5));
  it("учитывает только последнее окно", () => {
    expect(knowledge([...Array(20).fill(2), 0])).toBe(95);
    expect(knowledge([...Array(30).fill(0), ...Array(20).fill(2)])).toBe(100);
  });
  it("применяет пороги до округления", () => {
    expect(level(96.999, 20)).toBe("Отлично");
    expect(level(97, 20)).toBe("Элитно");
    expect(level(50, 20)).toBe("Нормально");
    expect(level(70, 20)).toBe("Хорошо");
    expect(level(90, 20)).toBe("Отлично");
  });
  it("отделяет неизученное от нуля после ошибок", () => {
    expect(level(0, 0)).toBe("Не изучено");
    expect(level(0, 1)).toBe("Слабо");
    expect(mean([])).toBeNull();
    expect(mean([0, 100])).toBe(50);
  });
});
describe("Массовый ввод", () => {
  it("не путает интервал и разделитель записи", () => {
    const rows = previewText(
      "1237–1241 — Синтетическая запись\n\n1380 — Вторая запись",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].dateText).toBe("1237–1241");
    expect(rows.every((r) => r.error === null)).toBe(true);
  });
  it("помечает непонятные строки", () => {
    expect(previewText("непонятная строка")[0].error).not.toBeNull();
    expect(previewText("32.01.1380 — Пример")[0].error).not.toBeNull();
  });
  it("не угадывает неоднозначный разделитель", () =>
    expect(previewText("1380 — Один — Другой")[0].error).not.toBeNull());
});
