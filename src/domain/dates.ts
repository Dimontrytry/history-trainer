import type { HistoricalDate } from "../shared/models";

const months = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const romanValues: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};
function roman(s: string): number {
  if (/^\d+$/.test(s)) return +s;
  if (
    !/^(?=[MDCLXVI]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(
      s,
    )
  )
    throw new Error("Некорректный римский номер века");
  return [...s].reduce(
    (n, c, i) =>
      n +
      (romanValues[c] < (romanValues[s[i + 1]] ?? 0) ? -1 : 1) * romanValues[c],
    0,
  );
}
function key(p: HistoricalDate["start"], end = false): number {
  const y = p.year < 0 ? p.year + 1 : p.year;
  return (
    y * 10000 + (p.month ?? (end ? 12 : 1)) * 100 + (p.day ?? (end ? 31 : 1))
  );
}
export function parseDate(
  input: string,
  calendar: HistoricalDate["calendar"] = "source_unspecified",
): HistoricalDate {
  const label = input.trim();
  let s = label.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  if (!s) throw new Error("Укажите историческую дату");
  const bce = /до\s*н\.?\s*э\.?|\bbce\b/.test(s);
  s = s
    .replace(/до\s*н\.?\s*э\.?/g, "")
    .replace(/н\.?\s*э\.?/g, "")
    .replace(/\b(ce|bce)\b/g, "")
    .trim();
  const approximate = /^(около|ок\.|примерно)\s/.test(s);
  s = s
    .replace(/^(около|ок\.|примерно)\s+/, "")
    .replace(/\s*(года|год|г\.)\s*$/, "")
    .trim();
  const era = (y: number) => {
    if (!Number.isInteger(y) || y < 1 || y > 999999)
      throw new Error("Год должен быть положительным, без нулевого года");
    return bce ? -y : y;
  };
  const make = (
    kind: HistoricalDate["kind"],
    start: HistoricalDate["start"],
    end?: HistoricalDate["start"],
    extra = {},
  ): HistoricalDate => {
    if (end && key(start) > key(end, true))
      throw new Error("Начало интервала позже конца");
    return {
      kind,
      calendar,
      approximate,
      label,
      start,
      end,
      lower: key(start),
      upper: key(end ?? start, true),
      ...extra,
    };
  };
  const century = s.match(
    /^(?:(первая|вторая|третья|четвертая|[1-4](?:-я)?)\s+(половина|четверть)\s+)?([ivxlcdm]+|\d+)\s*(?:век(?:а)?|в\.)$/i,
  );
  if (century) {
    const c = roman(century[3].toUpperCase());
    if (c < 1 || c > 10000) throw new Error("Некорректный век");
    const count = century[2] === "половина" ? 2 : 4;
    const names = ["первая", "вторая", "третья", "четвертая"];
    const index = century[1]
      ? parseInt(century[1]) || names.indexOf(century[1]) + 1
      : 0;
    if (index > count) throw new Error("Некорректная часть века");
    let lo = (c - 1) * 100 + 1,
      hi = c * 100;
    if (index) {
      if (bce) {
        hi -= (index - 1) * (100 / count);
        lo = hi - 100 / count + 1;
      } else {
        lo += (index - 1) * (100 / count);
        hi = lo + 100 / count - 1;
      }
    }
    const start = { year: era(bce ? hi : lo) },
      end = { year: era(bce ? lo : hi) };
    return make(index ? "century_part" : "century", start, end, {
      century: c,
      ...(index ? { part: { count, index } } : {}),
    });
  }
  const range = s.match(/^(.+?)\s*[–—−-]\s*(.+)$/);
  if (range) {
    const suffix = bce ? " до н. э." : "";
    const start = parseDate(range[1] + suffix, calendar),
      end = parseDate(range[2] + suffix, calendar);
    if (
      !["year", "day"].includes(start.kind) ||
      !["year", "day"].includes(end.kind)
    )
      throw new Error("Границы интервала должны быть годами или датами");
    return make("range", start.start, end.start);
  }
  const numeric = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d+)$/),
    text = s.match(/^(\d{1,2})\s+([а-я]+)\s+(\d+)$/);
  if (numeric || text) {
    const m = numeric ?? text!;
    const day = +m[1],
      month = numeric ? +m[2] : months.indexOf(m[2]) + 1,
      year = era(+m[3]);
    const y = Math.abs(year);
    const leap =
      calendar === "gregorian"
        ? y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
        : y % 4 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1])
      throw new Error("Такой календарной даты не существует");
    return make("day", { year, month, day });
  }
  if (/^\d+$/.test(s)) return make("year", { year: era(+s) });
  throw new Error(
    "Дата не распознана. Используйте год, день, интервал, век или часть века",
  );
}
export function sameDate(a: HistoricalDate, b: HistoricalDate): boolean {
  return (
    a.kind === b.kind &&
    a.approximate === b.approximate &&
    a.lower === b.lower &&
    a.upper === b.upper
  );
}
