import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { Storage } from "./storage/database";
import type { Diagnostics, MediaAsset } from "../shared/models";
import { userMessage } from "../shared/errors";

export class Media {
  constructor(readonly store: Storage) {}
  list(): MediaAsset[] {
    return this.store
      .rows<any>("SELECT * FROM media ORDER BY rowid DESC")
      .map((r) => ({ ...r }));
  }
  assertAvailable(id: string): void {
    const row = this.store.one<any>(
      "SELECT hash,size FROM media WHERE id=?",
      id,
    );
    if (!row) throw new Error("Изображение вопроса отсутствует в медиатеке");
    try {
      const bytes = readFileSync(this.path(id));
      if (
        bytes.length !== row.size ||
        createHash("sha256").update(bytes).digest("hex") !== row.hash
      )
        throw new Error("hash mismatch");
    } catch {
      throw new Error(
        "Изображение вопроса отсутствует или повреждено. Проверьте медиатеку перед тестированием.",
      );
    }
  }
  path(id: string): string {
    const row = this.store.one<any>(
      "SELECT hash,mime FROM media WHERE id=?",
      id,
    );
    if (!row) throw new Error("Изображение не найдено");
    return join(
      this.store.directory,
      "media",
      `${row.hash}.${row.mime === "image/jpeg" ? "jpg" : row.mime === "image/png" ? "png" : "webp"}`,
    );
  }
  async import(bytes: Buffer, name: string, source = ""): Promise<MediaAsset> {
    if (!bytes.length || bytes.length > 50 * 1024 * 1024)
      throw new Error("Допустимый размер изображения: от 1 байта до 50 МБ");
    const image = sharp(bytes, {
        limitInputPixels: 40_000_000,
        failOn: "warning",
      }),
      metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? ""))
      throw new Error("Поддерживаются JPEG, PNG и WebP");
    await image.clone().raw().toBuffer(); // metadata alone does not establish that the image decodes.
    const hash = createHash("sha256").update(bytes).digest("hex");
    const old = this.store.one<any>("SELECT * FROM media WHERE hash=?", hash);
    if (old) {
      const path = this.path(old.id);
      if (
        !existsSync(path) ||
        createHash("sha256").update(readFileSync(path)).digest("hex") !== hash
      ) {
        const tmp = path + "." + randomUUID() + ".tmp";
        writeFileSync(tmp, bytes);
        renameSync(tmp, path);
      }
      return old;
    }
    const mime = `image/${metadata.format}`,
      id = randomUUID(),
      ext = metadata.format === "jpeg" ? "jpg" : metadata.format;
    const path = join(this.store.directory, "media", `${hash}.${ext}`),
      tmp = path + "." + randomUUID() + ".tmp";
    writeFileSync(tmp, bytes);
    renameSync(tmp, path);
    this.store.run(
      "INSERT INTO media VALUES(?,?,?,?,?,?,?,?)",
      id,
      hash,
      name,
      mime,
      bytes.length,
      metadata.width,
      metadata.height,
      source,
    );
    return this.list().find((m) => m.id === id)!;
  }
  remove(id: string): void {
    const references = this.store.one<any>(
      "SELECT (SELECT COUNT(*) FROM item_media WHERE asset_id=?) + (SELECT COUNT(*) FROM question_media WHERE asset_id=?) AS n",
      id,
      id,
    )!.n;
    const embedded = this.store.one<any>(
      "SELECT (SELECT COUNT(*) FROM notes WHERE instr(document,?)>0) + (SELECT COUNT(*) FROM templates t JOIN items i ON i.id=t.item_id WHERE i.deleted_at IS NULL AND instr(t.spec,?)>0) + (SELECT COUNT(*) FROM settings WHERE instr(value,?)>0) AS n",
      id,
      id,
      id,
    )!.n;
    if (references || embedded)
      throw new Error(
        "Изображение используется материалом, вопросом, конспектом или настройкой. Сначала замените/удалите связи. История тестов сохраняет свои изображения.",
      );
    const path = this.path(id);
    this.store.run("DELETE FROM media WHERE id=?", id);
    if (existsSync(path)) unlinkSync(path);
  }
  async check(): Promise<Diagnostics> {
    const rows = this.list(),
      problems: Diagnostics["problems"] = [];
    for (const row of rows)
      try {
        const bytes = readFileSync(this.path(row.id));
        if (createHash("sha256").update(bytes).digest("hex") !== row.hash)
          throw new Error("Контрольная сумма не совпадает");
        await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" })
          .raw()
          .toBuffer();
      } catch (e) {
        problems.push({
          id: row.id,
          name: row.name,
          problem: userMessage(e),
        });
      }
    return { checked: rows.length, problems };
  }
}
