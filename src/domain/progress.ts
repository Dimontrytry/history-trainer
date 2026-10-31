export type Level =
  "Не изучено" | "Слабо" | "Нормально" | "Хорошо" | "Отлично" | "Элитно";
export function knowledge(units: readonly number[]): number {
  return units.slice(-20).reduce((a, b) => a + b, 0) * 2.5;
}
export function level(percent: number, attempts: number): Level {
  if (!attempts) return "Не изучено";
  return percent >= 97
    ? "Элитно"
    : percent >= 90
      ? "Отлично"
      : percent >= 70
        ? "Хорошо"
        : percent >= 50
          ? "Нормально"
          : "Слабо";
}
export function mean(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}
export const ranks = [
  { key: "ford", name: "Холден Форд", actor: "Джонатан Грофф", min: 0 },
  { key: "loki", name: "Детектив Локи", actor: "Джейк Джилленхол", min: 50 },
  { key: "graham", name: "Уилл Грэм", actor: "Хью Дэнси", min: 70 },
  { key: "jane", name: "Патрик Джейн", actor: "Саймон Бейкер", min: 90 },
  { key: "lecter", name: "Ганнибал Лектер", actor: "Мадс Миккельсен", min: 97 },
];
