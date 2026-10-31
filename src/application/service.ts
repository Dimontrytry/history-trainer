import { z } from "zod";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { parse as parseCSV } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { Storage } from "../infrastructure/storage/database";
import { Library } from "./library";
import { Quiz } from "./quiz";
import { statistics } from "./analytics";
import { Media } from "../infrastructure/media";
import { Backup } from "../infrastructure/backup";
import { itemInputSchema, type Bootstrap } from "../shared/models";
import { previewText } from "../domain/import";
import { parseDate } from "../domain/dates";

export class Application {
  readonly store: Storage;
  readonly library: Library;
  readonly quiz: Quiz;
  readonly media: Media;
  readonly backup: Backup;
  constructor(root: string) {
    this.store = new Storage(root);
    this.library = new Library(this.store);
    this.media = new Media(this.store);
    this.quiz = new Quiz(this.store, this.library, (id) =>
      this.media.assertAvailable(id),
    );
    this.backup = new Backup(this.store, this.media);
  }
  bootstrap(): Bootstrap {
    return {
      nodes: this.library.nodes(),
      items: this.library.items(),
      media: this.media.list(),
      sets: this.library.sets(),
      notes: this.library.notes(),
      sessions: this.quiz.list(),
      stats: statistics(this.store, this.library),
      settings: Object.fromEntries(
        this.store
          .rows<any>("SELECT * FROM settings")
          .map((r) => [r.key, JSON.parse(r.value)]),
      ),
    };
  }
  async dispatch(command: string, payload: unknown): Promise<unknown> {
    switch (command) {
      case "bootstrap":
        return this.bootstrap();
      case "item.save":
        return this.library.save(payload);
      case "item.batch":
        return this.library.batch(payload);
      case "item.history":
        return this.quiz.history(z.string().parse(payload));
      case "node.save":
        return this.library.saveNode(payload);
      case "set.save":
        return this.library.saveSet(payload);
      case "set.delete":
        this.store.run(
          "DELETE FROM sets WHERE id=?",
          z.string().parse(payload),
        );
        return;
      case "note.save":
        return this.library.saveNote(payload);
      case "note.delete":
        this.store.run(
          "DELETE FROM notes WHERE id=?",
          z.string().parse(payload),
        );
        return;
      case "quiz.start":
        return this.quiz.start(payload);
      case "quiz.get":
        return this.quiz.get(z.string().parse(payload));
      case "quiz.submit":
        return this.quiz.submit(payload);
      case "quiz.review":
        return this.quiz.review(payload);
      case "import.preview":
        return previewText(z.string().max(2_000_000).parse(payload));
      case "import.rows": {
        const v = z
          .object({
            topicId: z.string(),
            type: itemInputSchema.shape.type,
            rows: z
              .array(
                z.object({
                  title: z.string().trim().min(1),
                  dateText: z.string().trim().min(1),
                }),
              )
              .min(1)
              .max(10000),
          })
          .parse(payload);
        for (const row of v.rows) parseDate(row.dateText);
        return this.store.db.transaction(() => {
          const ids = v.rows.map((row) =>
            this.library.save(
              { ...row, type: v.type, topicId: v.topicId },
              false,
            ),
          );
          this.library.recordSnapshot();
          return ids;
        })();
      }
      case "exchange.preview":
        return this.previewExchange(payload);
      case "exchange.commit":
        return this.commitExchange(payload);
      case "media.import": {
        const v = z
          .object({
            name: z.string().max(1000),
            base64: z.string().max(70_000_000),
            source: z.string().max(3000).optional(),
          })
          .parse(payload);
        return this.media.import(
          Buffer.from(v.base64, "base64"),
          v.name,
          v.source,
        );
      }
      case "media.path":
        return this.media.path(z.string().uuid().parse(payload));
      case "media.delete":
        return this.media.remove(z.string().uuid().parse(payload));
      case "media.source": {
        const v = z
          .object({ id: z.string().uuid(), source: z.string().max(3000) })
          .parse(payload);
        this.store.run("UPDATE media SET source=? WHERE id=?", v.source, v.id);
        return;
      }
      case "media.check":
        return this.media.check();
      case "settings.save": {
        const v = z
          .object({
            key: z.enum(["rankMedia", "lastTopic", "reduceMotion"]),
            value: z.unknown(),
          })
          .parse(payload);
        if (v.key === "rankMedia") {
          const map = z
            .partialRecord(
              z.enum(["ford", "loki", "graham", "jane", "lecter"]),
              z.string().uuid(),
            )
            .parse(v.value);
          for (const id of Object.values(map))
            if (!this.store.one("SELECT id FROM media WHERE id=?", id))
              throw new Error("Портрет не найден");
        }
        if (v.key === "reduceMotion") z.boolean().parse(v.value);
        if (v.key === "lastTopic") {
          const id = z.string().parse(v.value);
          if (id && !this.library.nodes().some((n) => n.id === id))
            throw new Error("Раздел или тема не найдены");
        }
        this.store.run(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          v.key,
          JSON.stringify(v.value),
        );
        return;
      }
      case "file.export": {
        const v = z
          .object({
            format: z.enum(["json", "csv", "backup"]),
            path: z.string(),
          })
          .parse(payload);
        if (v.format === "backup") return this.backup.create(v.path);
        writeFileSync(
          v.path,
          v.format === "json"
            ? JSON.stringify(this.exportData(), null, 2)
            : stringify(
                this.library.items().map((i) => ({
                  type: i.type,
                  title: i.title,
                  dateText: i.dateText,
                  description: i.description,
                  answer: i.answer,
                  author: i.author,
                  source: i.source,
                  tags: i.tags.join("|"),
                  topicId: i.topicId,
                })),
                { header: true, bom: true },
              ),
        );
        return v.path;
      }
      case "file.import": {
        const v = z
          .object({
            format: z.enum(["json", "csv", "backup"]),
            path: z.string(),
          })
          .parse(payload);
        if (v.format === "backup") return this.backup.restore(v.path);
        if (statSync(v.path).size > 20_000_000)
          throw new Error("Файл обмена слишком большой");
        const text = readFileSync(v.path, "utf8");
        if (text.length > 20_000_000)
          throw new Error("Файл обмена слишком большой");
        const data =
          v.format === "json"
            ? JSON.parse(text)
            : {
                format: "history-trainer-material",
                version: 1,
                items: parseCSV(text, {
                  columns: true,
                  bom: true,
                  skip_empty_lines: true,
                  max_record_size: 100_000,
                }).map((r: any) => ({
                  ...r,
                  tags: r.tags ? r.tags.split("|") : [],
                  topicId: r.topicId || "russia-general",
                })),
              };
        return this.previewExchange(data);
      }
      default:
        throw new Error("Неизвестная команда приложения");
    }
  }
  exportData(): unknown {
    return {
      format: "history-trainer-material",
      version: 1,
      nodes: this.library.nodes(),
      items: this.library.items(),
      notes: this.library.notes(),
      sets: this.library.sets(),
    };
  }
  private exchangeSchema = z.object({
    format: z.literal("history-trainer-material"),
    version: z.literal(1),
    nodes: z.array(z.unknown()).optional(),
    items: z.array(itemInputSchema).max(10000),
    notes: z.array(z.unknown()).optional(),
    sets: z.array(z.unknown()).optional(),
  });
  previewExchange(input: unknown): unknown {
    const data = this.exchangeSchema.parse(input);
    const conflicts = data.items
      .filter(
        (i) => i.id && this.store.one("SELECT id FROM items WHERE id=?", i.id),
      )
      .map((i) => i.title);
    for (const item of data.items) {
      if (item.dateText) parseDate(item.dateText, item.calendar);
      for (const id of [
        ...item.mediaIds,
        ...item.templates.flatMap((t) => t.mediaIds),
      ])
        if (!this.store.one("SELECT id FROM media WHERE id=?", id))
          throw new Error(
            "Файл ссылается на изображения, которых нет в этой базе. Для полного переноса используйте ZIP-backup.",
          );
    }
    if (conflicts.length)
      throw new Error(
        `Импорт не перезаписывает существующий материал. Совпали ID: ${conflicts.slice(0, 5).join(", ")}`,
      );
    return {
      data,
      count: data.items.length,
      titles: data.items.map((i) => i.title),
    };
  }
  commitExchange(input: unknown): number {
    this.previewExchange(input);
    const data = this.exchangeSchema.parse(input);
    return this.store.db.transaction(() => {
      if (data.nodes) {
        const todo = [...data.nodes] as any[];
        while (todo.length) {
          const i = todo.findIndex(
            (n) =>
              !n.parentId ||
              this.store.one("SELECT id FROM nodes WHERE id=?", n.parentId),
          );
          if (i < 0)
            throw new Error("Импорт содержит цикл или отсутствующего родителя");
          const [node] = todo.splice(i, 1);
          const existing = this.library.nodes().find((n) => n.id === node.id);
          if (existing) {
            if (
              existing.title !== node.title ||
              existing.parentId !== node.parentId ||
              existing.kind !== node.kind
            )
              throw new Error("Конфликт структуры тем");
          } else this.library.saveNode(node);
        }
      }
      const ids = new Map<string, string>();
      const newIds: string[] = [];
      for (const item of data.items) {
        const id = this.library.save(
          {
            ...item,
            id: undefined,
            relatedIds: [],
            templates: item.templates.map((t) => ({ ...t, id: undefined })),
          },
          false,
        );
        newIds.push(id);
        if (item.id) ids.set(item.id, id);
      }
      const remap = (id: string) => {
        const next = ids.get(id);
        if (!next) throw new Error("Связанный объект отсутствует в импорте");
        return next;
      };
      data.items.forEach((item, index) => {
        for (const target of item.relatedIds)
          this.store.run(
            "INSERT INTO item_relations(from_id,to_id) VALUES(?,?)",
            newIds[index],
            remap(target),
          );
      });
      for (const raw of data.notes ?? []) {
        const note = z
          .object({
            title: z.string(),
            topicId: z.string(),
            document: z.record(z.string(), z.unknown()),
            itemIds: z.array(z.string()),
          })
          .parse(raw);
        this.library.saveNote({ ...note, itemIds: note.itemIds.map(remap) });
      }
      for (const raw of data.sets ?? []) {
        const set = z
          .object({ title: z.string(), itemIds: z.array(z.string()) })
          .parse(raw);
        this.library.saveSet({ ...set, itemIds: set.itemIds.map(remap) });
      }
      this.library.recordSnapshot();
      return data.items.length;
    })();
  }
}
