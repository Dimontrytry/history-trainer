import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";

const schema = `
CREATE TABLE nodes(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES nodes(id),kind TEXT NOT NULL CHECK(kind IN('section','period','topic')),title TEXT NOT NULL);
CREATE TABLE items(id TEXT PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,topic_id TEXT NOT NULL REFERENCES nodes(id),description TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,deleted_at TEXT);
CREATE TABLE facts(item_id TEXT NOT NULL REFERENCES items(id),key TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,sort_lower INTEGER,sort_upper INTEGER,PRIMARY KEY(item_id,key));
CREATE INDEX facts_dates ON facts(sort_lower,sort_upper);
CREATE TABLE tags(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE item_tags(item_id TEXT REFERENCES items(id),tag_id TEXT REFERENCES tags(id),PRIMARY KEY(item_id,tag_id));
CREATE TABLE item_relations(from_id TEXT REFERENCES items(id),to_id TEXT REFERENCES items(id),relation TEXT NOT NULL DEFAULT 'related_to',PRIMARY KEY(from_id,to_id,relation),CHECK(from_id!=to_id));
CREATE TABLE templates(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id),direction TEXT NOT NULL,enabled INTEGER NOT NULL,spec TEXT NOT NULL);
CREATE INDEX templates_item ON templates(item_id,direction);
CREATE TABLE media(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,source TEXT NOT NULL DEFAULT '');
CREATE TABLE item_media(item_id TEXT REFERENCES items(id),asset_id TEXT REFERENCES media(id),position INTEGER,PRIMARY KEY(item_id,asset_id));
CREATE TABLE sets(id TEXT PRIMARY KEY,title TEXT NOT NULL);
CREATE TABLE set_items(set_id TEXT REFERENCES sets(id) ON DELETE CASCADE,item_id TEXT REFERENCES items(id),PRIMARY KEY(set_id,item_id));
CREATE TABLE notes(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES nodes(id),title TEXT NOT NULL,document TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE note_items(note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,item_id TEXT REFERENCES items(id),PRIMARY KEY(note_id,item_id));
CREATE TABLE sessions(id TEXT PRIMARY KEY,mode TEXT NOT NULL,config TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('active','review','completed')),created_at TEXT NOT NULL,finished_at TEXT);
CREATE TABLE questions(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),ordinal INTEGER NOT NULL,item_id TEXT NOT NULL REFERENCES items(id),direction TEXT NOT NULL,snapshot TEXT NOT NULL,UNIQUE(session_id,ordinal));
CREATE TABLE question_media(question_id TEXT REFERENCES questions(id),asset_id TEXT REFERENCES media(id),PRIMARY KEY(question_id,asset_id));
CREATE TABLE attempts(id TEXT PRIMARY KEY,question_id TEXT NOT NULL UNIQUE REFERENCES questions(id),command_id TEXT NOT NULL UNIQUE,answer TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE evaluations(id INTEGER PRIMARY KEY AUTOINCREMENT,attempt_id TEXT NOT NULL REFERENCES attempts(id),outcome TEXT NOT NULL CHECK(outcome IN('correct','partial','incorrect','needs_review')),units INTEGER CHECK(units IN(0,1,2)),reason TEXT NOT NULL,method TEXT NOT NULL,created_at TEXT NOT NULL,sequence INTEGER,before_percent REAL,after_percent REAL,CHECK((outcome='needs_review' AND units IS NULL) OR (outcome='correct' AND units=2) OR (outcome='partial' AND units=1) OR (outcome='incorrect' AND units=0)));
CREATE INDEX evaluations_attempt ON evaluations(attempt_id,id);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE knowledge_snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,percent REAL,item_count INTEGER NOT NULL);
CREATE INDEX items_topic ON items(topic_id,deleted_at);
CREATE INDEX questions_direction ON questions(item_id,direction);
CREATE VIRTUAL TABLE item_search USING fts5(item_id UNINDEXED,title,description,tokenize='unicode61');
CREATE TRIGGER item_search_insert AFTER INSERT ON items BEGIN INSERT INTO item_search VALUES(new.id,new.title,new.description);END;
CREATE TRIGGER item_search_update AFTER UPDATE OF title,description ON items BEGIN DELETE FROM item_search WHERE item_id=old.id;INSERT INTO item_search VALUES(new.id,new.title,new.description);END;
`;
export function durableJson(path: string, value: unknown): void {
  const tmp = path + "." + randomUUID() + ".tmp";
  writeFileSync(tmp, JSON.stringify(value));
  const fd = openSync(tmp, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}
export class Storage {
  db!: Database.Database;
  generation!: string;
  directory!: string;
  private allowCreate = false;
  constructor(readonly root: string) {
    mkdirSync(join(root, "storage", "generations"), { recursive: true });
    if (!existsSync(join(root, "storage", "active.json"))) {
      const existing = require("node:fs").readdirSync(
        join(root, "storage", "generations"),
      ) as string[];
      if (existing.length)
        throw new Error(
          "Указатель базы отсутствует. Существующие данные не заменены пустой базой.",
        );
      const id = randomUUID();
      mkdirSync(join(root, "storage", "generations", id));
      durableJson(join(root, "storage", "active.json"), {
        version: 1,
        generation: id,
      });
      this.allowCreate = true;
    }
    try {
      this.open();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  open(): void {
    const pointer = JSON.parse(
      readFileSync(join(this.root, "storage", "active.json"), "utf8"),
    );
    if (pointer.version !== 1 || !/^[-a-f0-9]{36}$/.test(pointer.generation))
      throw new Error("Повреждён указатель базы");
    this.generation = pointer.generation;
    this.directory = join(this.root, "storage", "generations", this.generation);
    if (!existsSync(this.directory))
      throw new Error(
        "Каталог базы отсутствует. Автоматическое создание пустой базы запрещено.",
      );
    mkdirSync(join(this.directory, "media"), { recursive: true });
    const dbPath = join(this.directory, "library.sqlite");
    if (!existsSync(dbPath) && !this.allowCreate)
      throw new Error(
        "Файл существующей базы отсутствует. Пустая база вместо него не создана.",
      );
    const newDatabase = this.allowCreate;
    this.db = new Database(dbPath);
    this.allowCreate = false;
    if (
      !newDatabase &&
      !this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
        )
        .get()
    )
      throw new Error(
        "Файл не содержит поддерживаемую схему базы. Автоматическая переинициализация запрещена.",
      );
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    const digest = createHash("sha256").update(schema).digest("hex");
    const applied = this.db
      .prepare("SELECT * FROM schema_migrations")
      .all() as { version: number; checksum: string }[];
    if (applied.some((r) => r.version !== 1 || r.checksum !== digest))
      throw new Error(
        "Версия или контрольная сумма схемы не поддерживается. База не изменена.",
      );
    if (!applied.length)
      this.db.transaction(() => {
        this.db.exec(schema);
        this.db
          .prepare("INSERT INTO schema_migrations VALUES(1,?,?)")
          .run(digest, new Date().toISOString());
        const stmt = this.db.prepare("INSERT INTO nodes VALUES(?,?,?,?)");
        stmt.run("russia", null, "section", "История России");
        stmt.run("world", null, "section", "Всемирная история");
        stmt.run("russia-general", "russia", "topic", "Общее");
        stmt.run("world-general", "world", "topic", "Общее");
      })();
    if (this.db.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("Проверка целостности базы не пройдена");
  }
  close(): void {
    if (this.db?.open) this.db.close();
  }
  rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  one<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  run(sql: string, ...params: unknown[]): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }
}
