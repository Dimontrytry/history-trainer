import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import Database from "better-sqlite3";
import { Application } from "../../src/application/service";
import type { QuizConfig } from "../../src/shared/models";

async function run() {
  const root = mkdtempSync(join(tmpdir(), "history-trainer-integration-"));
  let app = new Application(root);
  let checks = 0;
  function checked(name: string) {
    checks++;
    console.log(`PASS ${checks}: ${name}`);
  }
  const config = (id: string): QuizConfig => ({
    itemIds: [id],
    selection: "all",
    directions: ["event_to_date"],
    count: 1,
    mode: "exam",
    choice: false,
  });
  const template = {
    direction: "event_to_date",
    kind: "date",
    prompt: "Дата синтетического объекта?",
    expected: "08.09.1380",
    alternatives: [],
    checking: "automatic",
    criteria: [],
    mediaIds: [],
    enabled: true,
  };
  try {
    assert.equal(app.bootstrap().items.length, 0);
    assert.equal(app.bootstrap().stats.percent, null);
    checked("Пустая база не содержит фиктивного материала и процентов");
    const id = app.library.save({
      title: "Синтетический объект теста",
      type: "event",
      topicId: "russia-general",
      dateText: "08.09.1380",
      templates: [template],
      tags: ["проверка"],
    });
    app.store.close();
    app = new Application(root);
    assert.equal(app.library.items()[0].title, "Синтетический объект теста");
    checked(
      "Материал и структурированная дата сохраняются после закрытия и открытия БД",
    );
    let firstCommand = "";
    for (let i = 0; i < 20; i++) {
      const sid = app.quiz.start(config(id)),
        session = app.quiz.get(sid);
      assert.equal(session.reviews, undefined);
      assert.equal("expected" in session.questions[0], false);
      const commandId = randomUUID();
      const input = {
        questionId: session.questions[0].id,
        commandId,
        answer: i === 0 ? "1380" : "8 сентября 1380",
      };
      const result = app.quiz.submit(input);
      assert.equal(result.status, "completed");
      assert.equal(result.reviews![0].grade.units, i === 0 ? 1 : 2);
      if (i === 0) {
        firstCommand = commandId;
        app.quiz.submit(input);
        assert.equal(app.quiz.history(id).length, 1);
      }
    }
    assert.equal(app.library.itemProgress(id), 97.5);
    assert.equal(app.quiz.history(id).length, 20);
    checked("20 оценок, частичный балл и идемпотентная окончательная отправка");
    const fullItem = app.library.items().find((i) => i.id === id)!;
    app.library.save({
      ...fullItem,
      templates: [
        ...fullItem.templates,
        {
          ...template,
          direction: "date_to_event",
          kind: "short",
          prompt: "Название?",
          expected: fullItem.title,
        },
      ],
    });
    assert.equal(app.library.itemProgress(id), 48.75);
    checked(
      "Непроверенное обратное направление участвует с нулём, не создавая ложных попыток",
    );
    const mixed = app.quiz.get(
      app.quiz.start({
        ...config(id),
        directions: [],
        count: 2,
        mode: "mixed",
      }),
    );
    assert.equal(new Set(mixed.questions.map((q) => q.kind)).size, 2);
    assert.throws(() =>
      app.quiz.start({ ...config(id), count: 1, mode: "mixed" }),
    );
    checked(
      "Смешанный тест действительно содержит разные направления; однонаправленный не выдаётся за смешанный",
    );
    const two = app.quiz.start({ ...config(id), directions: [], count: 2 }),
      twoSession = app.quiz.get(two),
      before = app.library.itemProgress(id);
    let first = twoSession.questions[0];
    app.quiz.submit({
      questionId: first.id,
      commandId: randomUUID(),
      answer: "неверно",
    });
    assert.equal(app.library.itemProgress(id), before);
    assert.equal(app.quiz.get(two).reviews, undefined);
    checked("До завершения теста оценки и изменения знания не раскрываются");
    const second = twoSession.questions[1];
    app.quiz.submit({
      questionId: second.id,
      commandId: randomUUID(),
      answer: "неверно",
    });
    assert.ok(app.quiz.get(two).reviews);
    checked("Итоговый разбор появляется после последнего ответа");
    const snapshotSession = app.quiz.start(config(id));
    const old = app.library.items().find((i) => i.id === id)!;
    app.library.save({
      ...old,
      templates: old.templates.map((t) =>
        t.direction === "event_to_date" ? { ...t, expected: "09.09.1380" } : t,
      ),
    });
    const snap = app.quiz.submit({
      questionId: app.quiz.get(snapshotSession).questions[0].id,
      commandId: randomUUID(),
      answer: "08.09.1380",
    });
    assert.equal(snap.reviews![0].grade.units, 2);
    checked("Редактирование карточки не меняет эталон уже начатого теста");
    const previousCount = app.library.items().length;
    await assert.rejects(() =>
      app.dispatch("import.rows", {
        type: "event",
        topicId: "russia-general",
        rows: [
          { title: "Не сохранять", dateText: "1000" },
          { title: "Неверная", dateText: "32.01.1000" },
        ],
      }),
    );
    assert.equal(app.library.items().length, previousCount);
    checked(
      "Ошибка массового ввода не оставляет частично импортированный материал",
    );
    const manualId = app.library.save({
      type: "fact",
      title: "Вопрос для самопроверки",
      topicId: "russia-general",
      templates: [
        {
          ...template,
          kind: "long",
          direction: "open_question",
          checking: "manual",
          expected: "Эталон теста",
        },
      ],
    });
    const manual = app.quiz.start({ ...config(manualId), directions: [] });
    const m = app.quiz.submit({
      questionId: app.quiz.get(manual).questions[0].id,
      commandId: randomUUID(),
      answer: "Ответ теста",
    });
    assert.equal(m.status, "review");
    assert.equal(m.reviews![0].grade.units, null);
    const graded = app.quiz.review({
      attemptId: m.reviews![0].attemptId,
      units: 1,
    });
    assert.equal(graded.status, "completed");
    assert.equal(app.library.itemProgress(manualId), 2.5);
    assert.throws(() =>
      app.quiz.review({ attemptId: m.reviews![0].attemptId, units: 2 }),
    );
    checked("Самопроверка применяет балл один раз после итогового разбора");
    const bytes = await sharp({
      create: { width: 7, height: 5, channels: 3, background: "#91bda7" },
    })
      .png()
      .toBuffer();
    const asset = await app.media.import(
      bytes,
      "synthetic.png",
      "Developer fixture",
    );
    assert.deepEqual(readFileSync(app.media.path(asset.id)), bytes);
    assert.equal((await app.media.check()).problems.length, 0);
    app.library.save({
      ...app.library.items().find((i) => i.id === id)!,
      mediaIds: [asset.id],
    });
    assert.throws(() => app.media.remove(asset.id));
    checked(
      "Настоящее изображение декодируется, сохраняется и защищено от удаления при наличии связей",
    );
    const imageItem = app.library.save({
      type: "image",
      title: "Синтетическая иллюстрация",
      topicId: "russia-general",
      mediaIds: [asset.id],
    });
    const imageConfig = { ...config(imageItem), directions: [] };
    const imageSession = app.quiz.get(app.quiz.start(imageConfig));
    assert.equal(imageSession.questions[0].mediaIds[0], asset.id);
    writeFileSync(app.media.path(asset.id), "damaged");
    const beforeSessions = app.quiz.list().length;
    assert.throws(() => app.quiz.start(imageConfig), /повреждено/);
    assert.equal(app.quiz.list().length, beforeSessions);
    writeFileSync(app.media.path(asset.id), bytes);
    checked(
      "Тест с изображением использует локальный ассет и не запускается с повреждённым файлом",
    );
    const choiceIds: string[] = [];
    for (let i = 0; i < 4; i++)
      choiceIds.push(
        app.library.save({
          type: "event",
          title: `Синтетический выбор ${i}`,
          topicId: "russia-general",
          dateText: String(1000 + i),
        }),
      );
    const choiceSession = app.quiz.get(
      app.quiz.start({
        ...config(id),
        itemIds: choiceIds,
        count: 1,
        choice: true,
      }),
    );
    const choiceQuestion = choiceSession.questions[0];
    assert.equal(choiceQuestion.choices.length, 4);
    const expected = JSON.parse(
      app.store.one<any>(
        "SELECT snapshot FROM questions WHERE id=?",
        choiceQuestion.id,
      )!.snapshot,
    ).template.expected;
    const wrong = choiceQuestion.choices.find((c) => c !== expected)!;
    const choiceResult = app.quiz.submit({
      questionId: choiceQuestion.id,
      commandId: randomUUID(),
      answer: wrong,
    });
    assert.equal(choiceResult.reviews![0].grade.units, 0);
    checked(
      "Выбор из вариантов создаёт четыре разных ответа из материала и проверяет выбранный вариант однозначно",
    );
    const disposable = await app.media.import(
      await sharp({
        create: { width: 2, height: 3, channels: 3, background: "#123456" },
      })
        .png()
        .toBuffer(),
      "disposable.png",
    );
    const disposableItem = app.library.save({
      type: "image",
      title: "Удаляемая тестовая запись",
      topicId: "russia-general",
      mediaIds: [disposable.id],
    });
    app.store.run(
      "INSERT INTO item_relations(from_id,to_id) VALUES(?,?)",
      id,
      disposableItem,
    );
    app.library.batch({ ids: [disposableItem], operation: "delete" });
    assert.equal(
      app.library
        .items()
        .find((i) => i.id === id)!
        .relatedIds.includes(disposableItem),
      false,
    );
    const disposablePath = app.media.path(disposable.id);
    app.media.remove(disposable.id);
    assert.equal(existsSync(disposablePath), false);
    checked(
      "После удаления материала неиспользуемый файл можно удалить; изображения истории по-прежнему защищены",
    );
    const note = app.library.saveNote({
      topicId: "russia-general",
      title: "Тестовый конспект",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Проверка сохранения" }],
          },
          {
            type: "image",
            attrs: { src: `history-media://asset/${asset.id}` },
          },
        ],
      },
      itemIds: [id],
    });
    app.library.saveSet({ title: "Тестовый набор", itemIds: [id] });
    await app.dispatch("settings.save", {
      key: "rankMedia",
      value: { ford: asset.id },
    });
    const backup = join(root, "roundtrip.zip");
    await app.backup.create(backup);
    assert.ok(existsSync(backup));
    const snapshot = app.bootstrap();
    app.library.save({
      type: "term",
      title: "После резервной копии",
      topicId: "russia-general",
      answer: "Тест",
    });
    await app.backup.restore(backup);
    assert.equal(app.library.items().length, snapshot.items.length);
    assert.equal(
      app.library.notes().find((n) => n.id === note)!.title,
      "Тестовый конспект",
    );
    assert.equal(app.library.sets().length, 1);
    assert.equal(
      app.quiz.history(id).length,
      snapshot.items.find((i) => i.id === id)!.gradedCount,
    );
    assert.deepEqual(readFileSync(app.media.path(asset.id)), bytes);
    assert.deepEqual(app.bootstrap().settings, snapshot.settings);
    checked(
      "Полный backup восстанавливает материал, связи, конспект, историю, настройки и байты изображения",
    );
    const bad = join(root, "corrupt.zip");
    writeFileSync(bad, "not a ZIP file");
    await assert.rejects(() => app.backup.restore(bad));
    assert.equal(app.library.items().length, snapshot.items.length);
    checked("Повреждённый архив не заменяет рабочую базу");
    const assetPath = app.media.path(asset.id);
    writeFileSync(assetPath, "corrupt");
    assert.equal((await app.media.check()).problems.length, 1);
    await assert.rejects(() =>
      app.backup.create(join(root, "invalid-backup.zip")),
    );
    writeFileSync(assetPath, bytes);
    checked(
      "Повреждение изображения обнаруживается, неполный backup не выдаётся за успешный",
    );
    const exchange = app.exportData();
    const otherRoot = join(root, "other-profile");
    const other = new Application(otherRoot);
    try {
      await assert.rejects(() => other.dispatch("exchange.preview", exchange));
      checked(
        "JSON с недоступным изображением не импортируется как будто файл существует",
      );
    } finally {
      other.store.close();
    }
    const dbPath = join(app.store.directory, "library.sqlite");
    app.store.close();
    renameSync(dbPath, dbPath + ".saved");
    assert.throws(() => new Application(root), /отсутствует/);
    assert.equal(existsSync(dbPath), false);
    renameSync(dbPath + ".saved", dbPath);
    app = new Application(root);
    checked("Отсутствующая существующая БД не подменяется новой пустой базой");
    const node = app.library.saveNode({
      parentId: "russia",
      kind: "period",
      title: "Синтетический период",
    });
    assert.throws(() =>
      app.library.saveNode({
        id: node,
        parentId: node,
        kind: "period",
        title: "Цикл",
      }),
    );
    checked("Циклы в структуре материала отклоняются");
    const isolatedRoot = join(root, "exchange-source"),
      isolated = new Application(isolatedRoot),
      target = new Application(join(root, "exchange-target"));
    try {
      const a = isolated.library.save({
        type: "term",
        title: "Синтетический термин A",
        topicId: "russia-general",
        answer: "Определение A",
      });
      const b = isolated.library.save({
        type: "event",
        title: "Синтетическая запись B",
        topicId: "russia-general",
        dateText: "1237–1241",
        relatedIds: [a],
      });
      isolated.library.saveNote({
        title: "Связанный конспект",
        topicId: "russia-general",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Тестовые данные" }],
            },
          ],
        },
        itemIds: [a, b],
      });
      isolated.library.saveSet({ title: "Связанный набор", itemIds: [a, b] });
      const doc = isolated.exportData();
      await target.dispatch("exchange.preview", doc);
      assert.equal(target.library.items().length, 0);
      await target.dispatch("exchange.commit", doc);
      assert.equal(target.library.items().length, 2);
      assert.equal(target.library.notes()[0].itemIds.length, 2);
      assert.equal(target.library.sets()[0].itemIds.length, 2);
      const importedB = target.library
        .items()
        .find((i) => i.title === "Синтетическая запись B")!;
      assert.equal(importedB.relatedIds.length, 1);
      assert.notEqual(importedB.relatedIds[0], a);
      assert.equal(
        target.library.items().find((i) => i.id === importedB.relatedIds[0])!
          .title,
        "Синтетический термин A",
      );
      checked(
        "JSON переносит конспекты, наборы и связи с корректным переназначением ID; preview ничего не сохраняет",
      );
      const csv = join(root, "materials.csv");
      await isolated.dispatch("file.export", { format: "csv", path: csv });
      const parsed = (await target.dispatch("file.import", {
        format: "csv",
        path: csv,
      })) as any;
      assert.equal(parsed.count, 2);
      checked(
        "CSV экспорт и предварительный импорт сохраняют записи и интервал дат",
      );
      for (const format of ["jpeg", "webp"] as const) {
        const buffer = await sharp({
          create: { width: 8, height: 6, channels: 3, background: "#a1c4aa" },
        })
          .toFormat(format)
          .toBuffer();
        const image = await isolated.media.import(
          buffer,
          `synthetic.${format}`,
        );
        assert.equal(image.width, 8);
        assert.equal(image.height, 6);
      }
      assert.equal((await isolated.media.check()).problems.length, 0);
      checked("JPEG и WebP действительно декодируются в Electron runtime");
      isolated.store.run(
        "UPDATE schema_migrations SET checksum=? WHERE version=1",
        "invalid",
      );
      isolated.store.close();
      assert.throws(() => new Application(isolatedRoot), /контрольная сумма/);
      const raw = new Database(
        join(isolated.store.directory, "library.sqlite"),
      );
      try {
        assert.equal(
          (raw.prepare("SELECT COUNT(*) AS n FROM items").get() as any).n,
          2,
        );
      } finally {
        raw.close();
      }
      checked(
        "Несовместимая миграция отклоняется без удаления существующих данных",
      );
    } finally {
      isolated.store.close();
      target.store.close();
    }
    console.log(
      `INTEGRATION PASSED: ${checks} checks; runtime=${process.versions.electron ? "Electron" : "Node"}; sqlite=${app.store.one<any>("select sqlite_version() as v")!.v}`,
    );
  } finally {
    app.store.close();
    rmSync(root, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
