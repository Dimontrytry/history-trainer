import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Storage } from "../infrastructure/storage/database";
import {
  itemInputSchema,
  templateSchema,
  type Item,
  type ItemInput,
  type LibraryNode,
  type Note,
  type StudySet,
  type Template,
  type TemplateInput,
} from "../shared/models";
import { parseDate } from "../domain/dates";
import { knowledge, mean } from "../domain/progress";
import { validateDocument } from "../domain/documents";

export function defaultTemplates(input: ItemInput): TemplateInput[] {
  const templates: TemplateInput[] = [];
  const add = (
    direction: string,
    kind: TemplateInput["kind"],
    prompt: string,
    expected: string,
    checking: TemplateInput["checking"] = "automatic",
  ) =>
    templates.push({
      direction,
      kind,
      prompt,
      expected,
      checking,
      alternatives: [],
      criteria: [],
      mediaIds: [],
      enabled: true,
    });
  if (input.dateText) {
    add(
      input.type === "ruler" ? "ruler_to_reign" : "event_to_date",
      "date",
      input.type === "ruler"
        ? `Укажите годы правления: ${input.title}`
        : `Укажите дату: ${input.title}`,
      input.dateText,
    );
    add(
      input.type === "ruler" ? "reign_to_ruler" : "date_to_event",
      "short",
      input.type === "ruler"
        ? `Кто правил в ${input.dateText}?`
        : `Какое событие относится к дате ${input.dateText}?`,
      input.title,
    );
  }
  if (input.answer) {
    add(
      input.type === "term" ? "term_to_definition" : "open_question",
      input.type === "term" ? "short" : "long",
      input.title,
      input.answer,
      input.type === "term" ? "automatic" : "manual",
    );
    if (input.type === "term")
      add("definition_to_term", "short", input.answer, input.title);
  }
  if (input.mediaIds.length) {
    add(
      input.type === "map" ? "map_to_object" : "image_to_object",
      input.type === "map" ? "map" : "image",
      input.type === "map"
        ? "Какой объект или сюжет показан на карте?"
        : "Назовите изображённый объект",
      input.title,
    );
    templates.at(-1)!.mediaIds = [...input.mediaIds];
    if (input.author) {
      add(
        "image_to_author",
        "image",
        "Назовите автора изображённого произведения",
        input.author,
      );
      templates.at(-1)!.mediaIds = [...input.mediaIds];
    }
  }
  return templates;
}
export class Library {
  constructor(readonly store: Storage) {}
  nodes(): LibraryNode[] {
    return this.store
      .rows<any>("SELECT * FROM nodes ORDER BY rowid")
      .map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        kind: r.kind,
        title: r.title,
      }));
  }
  templates(itemId: string): Template[] {
    return this.store
      .rows<any>(
        "SELECT * FROM templates WHERE item_id=? ORDER BY rowid",
        itemId,
      )
      .map((r) => ({
        ...JSON.parse(r.spec),
        id: r.id,
        itemId,
        enabled: !!r.enabled,
      }));
  }
  directionProgress(itemId: string, direction: string): number {
    const rows = this.store.rows<{ units: number }>(
      `SELECT e.units FROM attempts a JOIN questions q ON q.id=a.question_id JOIN evaluations e ON e.attempt_id=a.id WHERE q.item_id=? AND q.direction=? AND e.id=(SELECT MAX(e2.id) FROM evaluations e2 WHERE e2.attempt_id=a.id) AND e.units IS NOT NULL AND e.sequence IS NOT NULL ORDER BY e.sequence DESC LIMIT 20`,
      itemId,
      direction,
    );
    return knowledge(rows.map((r) => r.units));
  }
  itemProgress(itemId: string): number {
    const directions = [
      ...new Set(
        this.templates(itemId)
          .filter((t) => t.enabled)
          .map((t) => t.direction),
      ),
    ];
    return mean(directions.map((d) => this.directionProgress(itemId, d))) ?? 0;
  }
  items(): Item[] {
    return this.store
      .rows<any>(
        "SELECT * FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC",
      )
      .map((row) => {
        const facts = Object.fromEntries(
          this.store
            .rows<any>("SELECT key,value FROM facts WHERE item_id=?", row.id)
            .map((r) => [r.key, JSON.parse(r.value)]),
        );
        const tags = this.store
          .rows<{ name: string }>(
            "SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id=t.id WHERE it.item_id=? ORDER BY t.name",
            row.id,
          )
          .map((r) => r.name);
        const mediaIds = this.store
          .rows<{ asset_id: string }>(
            "SELECT asset_id FROM item_media WHERE item_id=? ORDER BY position",
            row.id,
          )
          .map((r) => r.asset_id);
        const counts = this.store.one<any>(
          `SELECT COUNT(e.units) AS count,SUM(CASE WHEN e.units=0 THEN 1 ELSE 0 END) AS errors,MAX(e.created_at) AS last FROM attempts a JOIN questions q ON q.id=a.question_id LEFT JOIN evaluations e ON e.attempt_id=a.id AND e.sequence IS NOT NULL AND e.id=(SELECT MAX(e2.id) FROM evaluations e2 WHERE e2.attempt_id=a.id) WHERE q.item_id=?`,
          row.id,
        )!;
        return {
          id: row.id,
          type: row.type,
          title: row.title,
          topicId: row.topic_id,
          description: row.description,
          source: row.source,
          updatedAt: row.updated_at,
          dateText: facts.date?.label ?? "",
          calendar: facts.date?.calendar ?? "source_unspecified",
          date: facts.date ?? null,
          answer: facts.answer ?? "",
          author: facts.author ?? "",
          tags,
          mediaIds,
          relatedIds: this.store
            .rows<any>(
              "SELECT to_id FROM item_relations WHERE from_id=?",
              row.id,
            )
            .map((r) => r.to_id),
          templates: this.templates(row.id),
          progress: this.itemProgress(row.id),
          gradedCount: counts.count,
          errors: counts.errors ?? 0,
          lastChecked: counts.last,
        };
      });
  }
  save(input: unknown, recordSnapshot = true): string {
    const value = itemInputSchema.parse(input);
    const id = value.id ?? randomUUID();
    const date = value.dateText
      ? parseDate(value.dateText, value.calendar)
      : null;
    if (
      value.id &&
      !this.store.one(
        "SELECT id FROM items WHERE id=? AND deleted_at IS NULL",
        id,
      )
    )
      throw new Error("Материал не найден");
    const topic = this.store.one<any>(
      "SELECT kind FROM nodes WHERE id=?",
      value.topicId,
    );
    if (!topic || topic.kind !== "topic")
      throw new Error("Выберите тему материала");
    const templates = (
      value.templates.length ? value.templates : defaultTemplates(value)
    ).map((t) => templateSchema.parse(t));
    for (const t of templates) {
      if (t.kind === "date")
        for (const s of [t.expected, ...t.alternatives])
          parseDate(s, value.calendar);
      for (const mediaId of t.mediaIds)
        if (!this.store.one("SELECT id FROM media WHERE id=?", mediaId))
          throw new Error("Изображение вопроса не найдено");
    }
    this.store.db.transaction(() => {
      this.store.run(
        "INSERT INTO items(id,type,title,topic_id,description,source,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,title=excluded.title,topic_id=excluded.topic_id,description=excluded.description,source=excluded.source,updated_at=excluded.updated_at",
        id,
        value.type,
        value.title,
        value.topicId,
        value.description,
        value.source,
        new Date().toISOString(),
      );
      this.store.run("DELETE FROM facts WHERE item_id=?", id);
      for (const [key, v] of Object.entries({
        date,
        answer: value.answer,
        author: value.author,
      }))
        if (v)
          this.store.run(
            "INSERT INTO facts VALUES(?,?,?,?,?,?)",
            id,
            key,
            key === "date" ? "date" : "text",
            JSON.stringify(v),
            key === "date" ? date!.lower : null,
            key === "date" ? date!.upper : null,
          );
      this.store.run("DELETE FROM item_tags WHERE item_id=?", id);
      for (const name of new Set(value.tags)) {
        this.store.run(
          "INSERT OR IGNORE INTO tags VALUES(?,?)",
          randomUUID(),
          name,
        );
        this.store.run(
          "INSERT INTO item_tags VALUES(?,(SELECT id FROM tags WHERE name=?))",
          id,
          name,
        );
      }
      this.store.run("DELETE FROM item_media WHERE item_id=?", id);
      value.mediaIds.forEach((asset, i) =>
        this.store.run("INSERT INTO item_media VALUES(?,?,?)", id, asset, i),
      );
      this.store.run("DELETE FROM item_relations WHERE from_id=?", id);
      for (const target of new Set(value.relatedIds)) {
        if (
          !this.store.one(
            "SELECT id FROM items WHERE id=? AND deleted_at IS NULL",
            target,
          )
        )
          throw new Error("Связанный материал не найден");
        this.store.run(
          "INSERT INTO item_relations(from_id,to_id) VALUES(?,?)",
          id,
          target,
        );
      }
      this.store.run("UPDATE templates SET enabled=0 WHERE item_id=?", id);
      for (const t of templates) {
        const old = t.id
          ? this.store.one<any>(
              "SELECT item_id FROM templates WHERE id=?",
              t.id,
            )
          : null;
        if (old && old.item_id !== id)
          throw new Error("Вопрос принадлежит другому объекту");
        const tid = t.id ?? randomUUID();
        this.store.run(
          "INSERT INTO templates VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET direction=excluded.direction,enabled=excluded.enabled,spec=excluded.spec",
          tid,
          id,
          t.direction,
          t.enabled ? 1 : 0,
          JSON.stringify({ ...t, id: tid }),
        );
      }
      if (recordSnapshot) this.recordSnapshot();
    })();
    return id;
  }
  saveNode(input: unknown): string {
    const v = z
      .object({
        id: z.string().optional(),
        parentId: z.string().nullable(),
        kind: z.enum(["section", "period", "topic"]),
        title: z.string().trim().min(1).max(500),
      })
      .parse(input);
    const id = v.id ?? randomUUID();
    const parent = v.parentId
      ? this.nodes().find((n) => n.id === v.parentId)
      : null;
    if (v.kind === "section" && v.parentId)
      throw new Error("Раздел должен быть корневым");
    if (v.kind !== "section" && (!parent || parent.kind === "topic"))
      throw new Error(
        "Период или тема должны находиться в разделе или периоде",
      );
    let ancestor = parent;
    while (ancestor) {
      if (ancestor.id === id) throw new Error("Цикл в дереве тем");
      ancestor = this.nodes().find((n) => n.id === ancestor!.parentId) ?? null;
    }
    this.store.run(
      "INSERT INTO nodes VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,kind=excluded.kind,title=excluded.title",
      id,
      v.parentId,
      v.kind,
      v.title,
    );
    return id;
  }
  batch(input: unknown): void {
    const v = z
      .object({
        ids: z.array(z.string()).min(1).max(10000),
        operation: z.enum(["delete", "move", "tag"]),
        topicId: z.string().optional(),
        tag: z.string().trim().min(1).optional(),
      })
      .parse(input);
    this.store.db.transaction(() => {
      for (const id of new Set(v.ids)) {
        if (v.operation === "delete") {
          this.store.run(
            "UPDATE items SET deleted_at=? WHERE id=?",
            new Date().toISOString(),
            id,
          );
          this.store.run("DELETE FROM item_media WHERE item_id=?", id);
          this.store.run(
            "DELETE FROM item_relations WHERE from_id=? OR to_id=?",
            id,
            id,
          );
          this.store.run("DELETE FROM note_items WHERE item_id=?", id);
          this.store.run("DELETE FROM set_items WHERE item_id=?", id);
        }
        if (v.operation === "move") {
          if (
            !this.nodes().some((n) => n.id === v.topicId && n.kind === "topic")
          )
            throw new Error("Выберите тему");
          this.store.run(
            "UPDATE items SET topic_id=?,updated_at=? WHERE id=?",
            v.topicId,
            new Date().toISOString(),
            id,
          );
        }
        if (v.operation === "tag") {
          if (!v.tag) throw new Error("Укажите тег");
          this.store.run(
            "INSERT OR IGNORE INTO tags VALUES(?,?)",
            randomUUID(),
            v.tag,
          );
          this.store.run(
            "INSERT OR IGNORE INTO item_tags VALUES(?,(SELECT id FROM tags WHERE name=?))",
            id,
            v.tag,
          );
        }
      }
      this.recordSnapshot();
    })();
  }
  recordSnapshot(): void {
    const items = this.store.rows<{ id: string }>(
      "SELECT id FROM items WHERE deleted_at IS NULL",
    );
    this.store.run(
      "INSERT INTO knowledge_snapshots(created_at,percent,item_count) VALUES(?,?,?)",
      new Date().toISOString(),
      mean(items.map((i) => this.itemProgress(i.id))),
      items.length,
    );
  }
  sets(): StudySet[] {
    return this.store.rows<any>("SELECT * FROM sets").map((s) => ({
      id: s.id,
      title: s.title,
      itemIds: this.store
        .rows<any>("SELECT item_id FROM set_items WHERE set_id=?", s.id)
        .map((r) => r.item_id),
    }));
  }
  saveSet(input: unknown): string {
    const v = z
        .object({
          id: z.string().optional(),
          title: z.string().trim().min(1),
          itemIds: z.array(z.string()),
        })
        .parse(input),
      id = v.id ?? randomUUID();
    this.store.db.transaction(() => {
      this.store.run(
        "INSERT INTO sets VALUES(?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title",
        id,
        v.title,
      );
      this.store.run("DELETE FROM set_items WHERE set_id=?", id);
      for (const item of new Set(v.itemIds))
        this.store.run("INSERT INTO set_items VALUES(?,?)", id, item);
    })();
    return id;
  }
  notes(): Note[] {
    return this.store
      .rows<any>("SELECT * FROM notes ORDER BY updated_at DESC")
      .map((n) => ({
        id: n.id,
        topicId: n.topic_id,
        title: n.title,
        document: JSON.parse(n.document),
        updatedAt: n.updated_at,
        itemIds: this.store
          .rows<any>("SELECT item_id FROM note_items WHERE note_id=?", n.id)
          .map((r) => r.item_id),
      }));
  }
  saveNote(input: unknown): string {
    const v = z
        .object({
          id: z.string().optional(),
          topicId: z.string(),
          title: z.string().trim().min(1),
          document: z.record(z.string(), z.unknown()),
          itemIds: z.array(z.string()),
        })
        .parse(input),
      id = v.id ?? randomUUID();
    validateDocument(
      v.document,
      (id) => !!this.store.one("SELECT id FROM media WHERE id=?", id),
    );
    if (!this.nodes().some((n) => n.id === v.topicId && n.kind === "topic"))
      throw new Error("Выберите тему конспекта");
    this.store.db.transaction(() => {
      this.store.run(
        "INSERT INTO notes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET topic_id=excluded.topic_id,title=excluded.title,document=excluded.document,updated_at=excluded.updated_at",
        id,
        v.topicId,
        v.title,
        JSON.stringify(v.document),
        new Date().toISOString(),
      );
      this.store.run("DELETE FROM note_items WHERE note_id=?", id);
      for (const item of new Set(v.itemIds))
        this.store.run("INSERT INTO note_items VALUES(?,?)", id, item);
    })();
    return id;
  }
}
