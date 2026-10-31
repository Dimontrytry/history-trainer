import { ZipArchive } from "archiver";
import yauzl from "yauzl";
import Database from "better-sqlite3";
import sharp from "sharp";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Storage, durableJson } from "./storage/database";
import { Media } from "./media";

const hashFile = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};
const manifestSchema = z.object({
  format: z.literal("history-trainer-backup"),
  version: z.literal(1),
  schema: z.literal(1),
  createdAt: z.string(),
  files: z
    .array(
      z.object({
        name: z.string(),
        size: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(10000),
});
type Manifest = z.infer<typeof manifestSchema>;
const safeName = (name: string) =>
  name === "manifest.json" ||
  name === "library.sqlite" ||
  /^media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(name);

export class Backup {
  constructor(
    readonly store: Storage,
    readonly media: Media,
  ) {}
  async create(destination: string): Promise<string> {
    const dir = join(this.store.root, "staging", randomUUID());
    mkdirSync(dir, { recursive: true });
    const temp = destination + "." + randomUUID() + ".partial";
    try {
      await this.store.db.backup(join(dir, "library.sqlite"));
      const files: Manifest["files"] = [
        {
          name: "library.sqlite",
          size: statSync(join(dir, "library.sqlite")).size,
          sha256: await hashFile(join(dir, "library.sqlite")),
        },
      ];
      for (const asset of this.media.list()) {
        const path = this.media.path(asset.id),
          name = "media/" + path.split(/[\\/]/).at(-1)!;
        if (!existsSync(path))
          throw new Error(`Отсутствует изображение: ${asset.name}`);
        if ((await hashFile(path)) !== asset.hash)
          throw new Error(`Повреждено изображение: ${asset.name}`);
        files.push({ name, size: statSync(path).size, sha256: asset.hash });
      }
      const manifest: Manifest = {
        format: "history-trainer-backup",
        version: 1,
        schema: 1,
        createdAt: new Date().toISOString(),
        files,
      };
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(temp, { flags: "wx" }),
          archive = new ZipArchive({ zlib: { level: 6 } });
        output.on("close", resolve);
        const fail = (error: Error) => {
          archive.abort();
          output.destroy();
          reject(error);
        };
        output.on("error", fail);
        archive.on("error", fail);
        archive.on("warning", fail);
        archive.pipe(output);
        archive.append(JSON.stringify(manifest, null, 2), {
          name: "manifest.json",
        });
        archive.file(join(dir, "library.sqlite"), { name: "library.sqlite" });
        for (const file of files.slice(1))
          archive.file(join(this.store.directory, file.name), {
            name: file.name,
          });
        archive.finalize().catch(fail);
      });
      // Verify the actual archive before advertising a successful backup.
      const verifyDir = await this.extractAndValidate(temp);
      rmSync(verifyDir, { recursive: true, force: true });
      renameSync(temp, destination);
      return destination;
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (existsSync(temp)) rmSync(temp, { force: true });
    }
  }
  private async extractAndValidate(path: string): Promise<string> {
    const dir = join(this.store.root, "staging", randomUUID());
    mkdirSync(join(dir, "media"), { recursive: true });
    try {
      await new Promise<void>((resolve, reject) => {
        yauzl.open(
          path,
          { lazyEntries: true, validateEntrySizes: true },
          (error, zip) => {
            if (error || !zip) {
              reject(error ?? new Error("Архив не открылся"));
              return;
            }
            const seen = new Set<string>();
            let total = 0,
              failed = false;
            const fail = (e: unknown) => {
              if (failed) return;
              failed = true;
              zip.close();
              reject(e);
            };
            zip.on("error", fail);
            zip.on("end", () => {
              if (!failed) resolve();
            });
            zip.on("entry", async (entry: yauzl.Entry) => {
              try {
                const name = entry.fileName,
                  mode = (entry.externalFileAttributes >>> 16) & 0o170000;
                if (
                  name === "manifest.json" &&
                  entry.uncompressedSize > 2_000_000
                )
                  throw new Error("Манифест архива слишком большой");
                if (
                  !safeName(name) ||
                  seen.has(name) ||
                  (mode !== 0 && mode !== 0o100000)
                )
                  throw new Error(
                    "Архив содержит недопустимый путь, ссылку или дубликат",
                  );
                seen.add(name);
                total += entry.uncompressedSize;
                if (
                  seen.size > 10001 ||
                  total > 2 * 1024 ** 3 ||
                  entry.uncompressedSize > 512 * 1024 ** 2
                )
                  throw new Error(
                    "Архив превышает безопасные ограничения размера",
                  );
                const stream = await new Promise<NodeJS.ReadableStream>(
                  (ok, no) =>
                    zip.openReadStream(entry, (e, s) =>
                      e || !s ? no(e) : ok(s),
                    ),
                );
                await pipeline(
                  stream,
                  createWriteStream(join(dir, name), { flags: "wx" }),
                );
                zip.readEntry();
              } catch (e) {
                fail(e);
              }
            });
            zip.readEntry();
          },
        );
      });
      const manifest = manifestSchema.parse(
        JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")),
      );
      const names = new Set<string>();
      for (const file of manifest.files) {
        if (
          !safeName(file.name) ||
          file.name === "manifest.json" ||
          names.has(file.name)
        )
          throw new Error("Неверный перечень файлов в манифесте");
        names.add(file.name);
        if (
          statSync(join(dir, file.name)).size !== file.size ||
          (await hashFile(join(dir, file.name))) !== file.sha256
        )
          throw new Error(`Файл не прошёл проверку: ${file.name}`);
      }
      const extracted = [
        "library.sqlite",
        ...readdirSync(join(dir, "media")).map((n) => "media/" + n),
      ];
      if (
        extracted.length !== names.size ||
        extracted.some((n) => !names.has(n))
      )
        throw new Error("Содержимое архива не соответствует манифесту");
      const db = new Database(join(dir, "library.sqlite"), { readonly: true });
      try {
        const schemaSQL =
          "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name";
        if (
          JSON.stringify(this.store.rows(schemaSQL)) !==
          JSON.stringify(db.prepare(schemaSQL).all())
        )
          throw new Error(
            "Структура таблиц, индексов или триггеров архива отличается от поддерживаемой схемы",
          );
        if (
          db.pragma("integrity_check", { simple: true }) !== "ok" ||
          (db.pragma("foreign_key_check") as unknown[]).length
        )
          throw new Error("Нарушена целостность базы");
        const current = this.store.rows<any>("SELECT * FROM schema_migrations"),
          incoming = db.prepare("SELECT * FROM schema_migrations").all();
        if (
          JSON.stringify(current.map((r) => [r.version, r.checksum])) !==
          JSON.stringify(
            (incoming as any[]).map((r) => [r.version, r.checksum]),
          )
        )
          throw new Error(
            "Схема базы не поддерживается этой версией приложения",
          );
        const assets = db.prepare("SELECT * FROM media").all() as any[];
        for (const asset of assets) {
          const name = `media/${asset.hash}.${asset.mime === "image/jpeg" ? "jpg" : asset.mime === "image/png" ? "png" : "webp"}`;
          if (
            !names.has(name) ||
            (await hashFile(join(dir, name))) !== asset.hash
          )
            throw new Error(
              "База ссылается на отсутствующее или повреждённое изображение",
            );
          await sharp(join(dir, name), {
            limitInputPixels: 40_000_000,
            failOn: "warning",
          })
            .raw()
            .toBuffer();
        }
      } finally {
        db.close();
      }
      return dir;
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
  async restore(path: string): Promise<{ backup: string }> {
    const stage = await this.extractAndValidate(path),
      previous = this.store.generation;
    try {
      mkdirSync(join(this.store.root, "backups"), { recursive: true });
      const backup = join(
        this.store.root,
        "backups",
        `before-restore-${Date.now()}-${randomUUID()}.zip`,
      );
      await this.create(backup);
      const next = randomUUID(),
        destination = join(this.store.root, "storage", "generations", next);
      renameSync(stage, destination);
      this.store.close();
      try {
        durableJson(join(this.store.root, "storage", "active.json"), {
          version: 1,
          generation: next,
        });
        this.store.open();
      } catch (e) {
        this.store.close();
        durableJson(join(this.store.root, "storage", "active.json"), {
          version: 1,
          generation: previous,
        });
        this.store.open();
        throw e;
      }
      return { backup };
    } finally {
      if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    }
  }
}
