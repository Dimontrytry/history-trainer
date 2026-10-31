import type { Grade, TemplateInput } from "../shared/models";
import { parseDate, sameDate } from "./dates";

export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[«»“”".,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const n = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = n;
    }
  }
  return row[b.length];
}
export function gradeAnswer(template: TemplateInput, answer: string): Grade {
  const review = (reason: string): Grade => ({
    outcome: "needs_review",
    units: null,
    reason,
  });
  if (template.checking === "manual") return review("Самопроверка по эталону");
  const variants = [template.expected, ...template.alternatives];
  if (template.kind === "date") {
    try {
      const got = parseDate(answer);
      for (const candidate of variants)
        if (sameDate(got, parseDate(candidate)))
          return {
            outcome: "correct",
            units: 2,
            reason: "Историческая дата совпадает",
          };
      const expected = parseDate(template.expected);
      if (
        expected.kind === "day" &&
        got.kind === "year" &&
        !got.approximate &&
        got.start.year === expected.start.year
      )
        return {
          outcome: "partial",
          units: 1,
          reason: "Указан верный год; день и месяц отсутствуют",
        };
      return {
        outcome: "incorrect",
        units: 0,
        reason: "Дата, точность или интервал не совпадают",
      };
    } catch {
      return {
        outcome: "incorrect",
        units: 0,
        reason: "Ответ не распознан как допустимая историческая дата",
      };
    }
  }
  const n = normalize(answer);
  if (variants.some((v) => normalize(v) === n))
    return {
      outcome: "correct",
      units: 2,
      reason: "Совпадает с допустимым ответом",
    };
  if (template.checking === "rubric") {
    if (!template.criteria.length)
      return review("Не заданы обязательные смысловые пункты");
    const clauses = (value: string) =>
      value
        .split(/[.!?;\n]+/)
        .map(normalize)
        .filter(Boolean);
    const required = template.criteria.map(normalize),
      answered = clauses(answer);
    if (
      answered.length &&
      required.every((c) => answered.includes(c)) &&
      answered.every((c) => required.includes(c))
    )
      return {
        outcome: "correct",
        units: 2,
        reason:
          "Все явно заданные смысловые пункты воспроизведены без неизвестных утверждений",
      };
    return review(
      "Проверьте все критерии: неполное совпадение или дополнительные утверждения требуют решения пользователя",
    );
  }
  // A near spelling is a suggestion, never proof of an identity or historical fact.
  if (
    n.length >= 5 &&
    n.length <= 500 &&
    variants.some(
      (v) =>
        Math.abs(normalize(v).length - n.length) <= 1 &&
        distance(normalize(v), n) <= 1,
    )
  )
    return review(
      "Возможная опечатка. Подтвердите по эталону, что смысл не изменился",
    );
  return {
    outcome: "incorrect",
    units: 0,
    reason: "Не совпадает с допустимыми формулировками",
  };
}
