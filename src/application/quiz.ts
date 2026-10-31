import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { type Storage } from "../infrastructure/storage/database";
import { Library } from "./library";
import { gradeAnswer, normalize } from "../domain/validation";
import { parseDate } from "../domain/dates";
import {
  quizConfigSchema,
  type Session,
  type Template,
  type PublicQuestion,
  type Review,
  type Grade,
} from "../shared/models";

type Snapshot = {
  template: Template;
  itemTitle: string;
  topicTitle: string;
  choices: string[];
};
function shuffled<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export class Quiz {
  constructor(
    readonly store: Storage,
    readonly library: Library,
    readonly assertMediaAvailable: (id: string) => void,
  ) {}
  start(input: unknown): string {
    const config = quizConfigSchema.parse(input),
      nodes = this.library.nodes();
    const descendants = new Set<string>(
      config.topicId ? [config.topicId] : nodes.map((n) => n.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes)
        if (
          n.parentId &&
          descendants.has(n.parentId) &&
          !descendants.has(n.id)
        ) {
          descendants.add(n.id);
          changed = true;
        }
    }
    const set = config.setId
      ? this.library.sets().find((s) => s.id === config.setId)
      : null;
    const note = config.noteId
      ? this.library.notes().find((s) => s.id === config.noteId)
      : null;
    if (config.setId && !set) throw new Error("Набор не найден");
    if (config.noteId && !note) throw new Error("Конспект не найден");
    const items = this.library
      .items()
      .filter(
        (i) =>
          descendants.has(i.topicId) &&
          (!config.itemIds || config.itemIds.includes(i.id)) &&
          (!set || set.itemIds.includes(i.id)) &&
          (!note || note.itemIds.includes(i.id)) &&
          (config.selection !== "errors" || i.errors > 0) &&
          (config.selection !== "weak" || i.progress < 50),
      );
    const pool = items.flatMap((item) =>
      item.templates
        .filter(
          (t) =>
            t.enabled &&
            (!config.directions.length ||
              config.directions.includes(t.direction)),
        )
        .map((template) => ({ template, item })),
    );
    if (!pool.length)
      throw new Error(
        "Для выбранных условий нет доступных вопросов. Добавьте материал или измените фильтры.",
      );
    if (config.count > pool.length)
      throw new Error(
        `Доступно ${pool.length} вопросов. Уменьшите количество или расширьте выборку.`,
      );
    let picked = shuffled(pool).slice(0, config.count);
    if (config.mode === "mixed") {
      const directions = shuffled([
        ...new Set(pool.map((p) => p.template.direction)),
      ]);
      if (config.count < 2 || directions.length < 2)
        throw new Error(
          "Для смешанного теста нужны минимум два вопроса разных направлений",
        );
      const groups = directions.map((direction) =>
        shuffled(pool.filter((p) => p.template.direction === direction)),
      );
      picked = [];
      while (picked.length < config.count)
        for (const group of groups) {
          if (group.length && picked.length < config.count)
            picked.push(group.pop()!);
        }
    }
    const chosen = picked.map(({ template, item }) => {
      let choices: string[] = [];
      if (config.choice || template.kind === "choice") {
        const candidateMap = new Map<string, string>();
        for (const p of pool) {
          const value = p.template.expected;
          if (
            p.template.direction !== template.direction ||
            gradeAnswer({ ...template, checking: "automatic" }, value)
              .outcome !== "incorrect"
          )
            continue;
          let key = normalize(value);
          if (template.kind === "date") {
            const date = parseDate(value);
            key = JSON.stringify([
              date.kind,
              date.lower,
              date.upper,
              date.approximate,
            ]);
          }
          candidateMap.set(key, value);
        }
        const candidates = [...candidateMap.values()];
        if (candidates.length < 3)
          throw new Error(
            "Для четырёх вариантов ответа нужны ещё три разных ответа того же направления. Выберите открытый ввод или добавьте материал.",
          );
        choices = shuffled([
          template.expected,
          ...shuffled(candidates).slice(0, 3),
        ]);
      }
      if (
        (template.kind === "image" || template.kind === "map") &&
        !template.mediaIds.length
      )
        throw new Error("Вопрос с изображением не содержит локального ассета");
      for (const mediaId of template.mediaIds)
        this.assertMediaAvailable(mediaId);
      return {
        template,
        itemTitle: item.title,
        topicTitle: nodes.find((n) => n.id === item.topicId)?.title ?? "",
        choices,
      } satisfies Snapshot;
    });
    const id = randomUUID();
    this.store.db.transaction(() => {
      this.store.run(
        "INSERT INTO sessions VALUES(?,?,?,?,?,NULL)",
        id,
        config.mode,
        JSON.stringify(config),
        "active",
        new Date().toISOString(),
      );
      chosen.forEach((snapshot, ordinal) => {
        const qid = randomUUID();
        this.store.run(
          "INSERT INTO questions VALUES(?,?,?,?,?,?)",
          qid,
          id,
          ordinal,
          snapshot.template.itemId,
          snapshot.template.direction,
          JSON.stringify(snapshot),
        );
        for (const asset of new Set(snapshot.template.mediaIds))
          this.store.run("INSERT INTO question_media VALUES(?,?)", qid, asset);
      });
    })();
    return id;
  }
  get(id: string): Session {
    const s = this.store.one<any>("SELECT * FROM sessions WHERE id=?", id);
    if (!s) throw new Error("Тест не найден");
    const rows = this.store.rows<any>(
      "SELECT q.*,a.id AS attempt_id,a.answer FROM questions q LEFT JOIN attempts a ON a.question_id=q.id WHERE session_id=? ORDER BY ordinal",
      id,
    );
    const questions: PublicQuestion[] = rows.map((q) => {
      const snapshot = JSON.parse(q.snapshot) as Snapshot;
      return {
        id: q.id,
        ordinal: q.ordinal,
        kind: snapshot.choices.length ? "choice" : snapshot.template.kind,
        prompt: snapshot.template.prompt,
        mediaIds: snapshot.template.mediaIds,
        choices: snapshot.choices,
        answered: !!q.attempt_id,
        ...(q.attempt_id ? { finalAnswer: q.answer } : {}),
      };
    });
    const result: Session = {
      id: s.id,
      mode: s.mode,
      status: s.status,
      createdAt: s.created_at,
      total: rows.length,
      answered: rows.filter((q) => q.attempt_id).length,
      questions,
    };
    if (s.status !== "active")
      result.reviews = rows.map((q, i) => {
        const snapshot = JSON.parse(q.snapshot) as Snapshot;
        const e = this.store.one<any>(
          "SELECT * FROM evaluations WHERE attempt_id=? ORDER BY id DESC LIMIT 1",
          q.attempt_id,
        );
        return {
          question: questions[i],
          expected: snapshot.template.expected,
          alternatives: snapshot.template.alternatives,
          criteria: snapshot.template.criteria,
          answer: q.answer,
          grade: { outcome: e.outcome, units: e.units, reason: e.reason },
          attemptId: q.attempt_id,
          before: e.before_percent,
          after: e.after_percent,
          itemTitle: snapshot.itemTitle,
        } satisfies Review;
      });
    return result;
  }
  list(): Session[] {
    return this.store
      .rows<{ id: string }>(
        "SELECT id FROM sessions ORDER BY created_at DESC LIMIT 100",
      )
      .map((s) => {
        const result = this.get(s.id);
        delete result.reviews;
        return result;
      });
  }
  private applyEvaluation(id: number, itemId: string): void {
    const before = this.library.itemProgress(itemId);
    const sequence =
      (this.store.one<any>("SELECT MAX(sequence) AS n FROM evaluations")?.n ??
        0) + 1;
    this.store.run(
      "UPDATE evaluations SET sequence=? WHERE id=?",
      sequence,
      id,
    );
    this.store.run(
      "UPDATE evaluations SET before_percent=?,after_percent=? WHERE id=?",
      before,
      this.library.itemProgress(itemId),
      id,
    );
  }
  submit(input: unknown): Session {
    const v = z
      .object({
        questionId: z.string(),
        commandId: z.string().uuid(),
        answer: z.string().trim().min(1).max(20000),
      })
      .parse(input);
    const q = this.store.one<any>(
      "SELECT q.*,s.status FROM questions q JOIN sessions s ON s.id=q.session_id WHERE q.id=?",
      v.questionId,
    );
    if (!q) throw new Error("Вопрос не найден");
    const duplicate = this.store.one<any>(
      "SELECT question_id FROM attempts WHERE command_id=?",
      v.commandId,
    );
    if (duplicate && duplicate.question_id !== v.questionId)
      throw new Error("Команда уже относится к другому вопросу");
    if (
      duplicate ||
      this.store.one(
        "SELECT id FROM attempts WHERE question_id=?",
        v.questionId,
      )
    )
      return this.get(q.session_id);
    if (q.status !== "active") throw new Error("Тест уже завершён");
    const snapshot = JSON.parse(q.snapshot) as Snapshot;
    if (snapshot.choices.length && !snapshot.choices.includes(v.answer))
      throw new Error("Выберите один из предложенных вариантов");
    const grade: Grade = snapshot.choices.length
      ? v.answer === snapshot.template.expected
        ? { outcome: "correct", units: 2, reason: "Выбран правильный вариант" }
        : { outcome: "incorrect", units: 0, reason: "Выбран неверный вариант" }
      : gradeAnswer(snapshot.template, v.answer);
    this.store.db.transaction(() => {
      const attempt = randomUUID(),
        time = new Date().toISOString();
      this.store.run(
        "INSERT INTO attempts VALUES(?,?,?,?,?)",
        attempt,
        q.id,
        v.commandId,
        v.answer,
        time,
      );
      this.store.run(
        "INSERT INTO evaluations(attempt_id,outcome,units,reason,method,created_at) VALUES(?,?,?,?,?,?)",
        attempt,
        grade.outcome,
        grade.units,
        grade.reason,
        "automatic",
        time,
      );
      const remaining = this.store.one<any>(
        "SELECT COUNT(*) AS n FROM questions q LEFT JOIN attempts a ON a.question_id=q.id WHERE q.session_id=? AND a.id IS NULL",
        q.session_id,
      )!.n;
      if (!remaining) {
        this.store.run(
          "UPDATE sessions SET status=?,finished_at=? WHERE id=?",
          "review",
          time,
          q.session_id,
        );
        const graded = this.store.rows<any>(
          "SELECT e.id,q.item_id FROM evaluations e JOIN attempts a ON a.id=e.attempt_id JOIN questions q ON q.id=a.question_id WHERE q.session_id=? AND e.units IS NOT NULL AND e.sequence IS NULL ORDER BY q.ordinal",
          q.session_id,
        );
        for (const e of graded) this.applyEvaluation(e.id, e.item_id);
        this.completeIfReviewed(q.session_id);
        this.library.recordSnapshot();
      }
    })();
    return this.get(q.session_id);
  }
  private completeIfReviewed(sessionId: string): void {
    const pending = this.store.one<any>(
      `SELECT COUNT(*) AS n FROM evaluations e JOIN attempts a ON a.id=e.attempt_id JOIN questions q ON q.id=a.question_id WHERE q.session_id=? AND e.id=(SELECT MAX(x.id) FROM evaluations x WHERE x.attempt_id=a.id) AND e.units IS NULL`,
      sessionId,
    )!.n;
    if (!pending)
      this.store.run(
        "UPDATE sessions SET status=? WHERE id=?",
        "completed",
        sessionId,
      );
  }
  review(input: unknown): Session {
    const v = z
      .object({
        attemptId: z.string(),
        units: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      })
      .parse(input);
    const row = this.store.one<any>(
      "SELECT a.*,q.session_id,q.item_id FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.id=?",
      v.attemptId,
    );
    if (!row) throw new Error("Ответ не найден");
    if (this.get(row.session_id).status === "active")
      throw new Error("Сначала завершите тест");
    const existing = this.store.one<any>(
      "SELECT * FROM evaluations WHERE attempt_id=? ORDER BY id DESC LIMIT 1",
      v.attemptId,
    );
    if (existing.units !== null) throw new Error("Ответ уже оценён");
    this.store.db.transaction(() => {
      const grade: Grade = {
        outcome:
          v.units === 2 ? "correct" : v.units === 1 ? "partial" : "incorrect",
        units: v.units,
        reason: "Оценено пользователем по эталону",
      };
      const result = this.store.run(
        "INSERT INTO evaluations(attempt_id,outcome,units,reason,method,created_at) VALUES(?,?,?,?,?,?)",
        v.attemptId,
        grade.outcome,
        grade.units,
        grade.reason,
        "self",
        new Date().toISOString(),
      );
      this.applyEvaluation(Number(result.lastInsertRowid), row.item_id);
      this.completeIfReviewed(row.session_id);
      this.library.recordSnapshot();
    })();
    return this.get(row.session_id);
  }
  history(itemId: string): unknown[] {
    return this.store
      .rows<any>(
        `SELECT a.answer,a.created_at,q.snapshot,e.outcome,e.units,e.reason,e.before_percent,e.after_percent FROM attempts a JOIN questions q ON q.id=a.question_id JOIN sessions s ON s.id=q.session_id JOIN evaluations e ON e.attempt_id=a.id WHERE q.item_id=? AND s.status!='active' AND e.id=(SELECT MAX(x.id) FROM evaluations x WHERE x.attempt_id=a.id) ORDER BY a.created_at DESC`,
        itemId,
      )
      .map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) }));
  }
}
