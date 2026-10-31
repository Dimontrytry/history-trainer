import { useState } from "react";
import {
  Upload,
  Download,
  ShieldCheck,
  FolderOpen,
  Trash2,
  ScanSearch,
  ImagePlus,
} from "lucide-react";
import { api, useApp } from "../state";
import { Asset, Empty, Modal, PageHeading, Panel } from "../components";
import { ranks } from "../../domain/progress";
import type { Diagnostics, MediaAsset } from "../../shared/models";

export function MediaPage() {
  const { data, task } = useApp(),
    [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null),
    [drag, setDrag] = useState(false),
    [source, setSource] = useState<MediaAsset | null>(null),
    [sourceText, setSourceText] = useState("");
  async function dropped(files: File[]) {
    await task(async () => {
      const images = [];
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024)
          throw new Error("Изображение больше 50 МБ");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        images.push({ name: file.name, base64: btoa(binary) });
      }
      return api.importDroppedImages(images);
    }, "Изображения скопированы в локальную медиатеку");
  }
  return (
    <>
      <PageHeading
        eyebrow="ЛОКАЛЬНЫЕ АССЕТЫ"
        title="Медиатека"
        description="Оригиналы хранятся вместе с вашей базой и включаются в полный backup."
        actions={
          <>
            <button
              className="button secondary"
              onClick={async () => {
                const r = await task(
                  () => api.request<Diagnostics>("media.check"),
                  "Проверка медиатеки завершена",
                );
                if (r.ok) setDiagnostics(r.value);
              }}
            >
              <ScanSearch size={17} />
              Проверить медиатеку
            </button>
            <button
              className="button primary"
              onClick={() =>
                void task(
                  () => api.importImages(),
                  "Изображения сохранены локально",
                )
              }
            >
              <ImagePlus size={17} />
              Добавить изображения
            </button>
          </>
        }
      />
      <div
        className={drag ? "dropzone dragging" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void dropped([...e.dataTransfer.files]);
        }}
      >
        <Upload size={21} />
        <span>Перетащите JPEG, PNG или WebP сюда</span>
        <small>
          До 50 МБ и 40 млн пикселей на изображение. Создаётся собственная копия
          файла.
        </small>
      </div>
      {diagnostics && (
        <div
          className={
            diagnostics.problems.length ? "diagnostic error" : "diagnostic"
          }
          role="status"
        >
          <strong>
            Проверено файлов: {diagnostics.checked}. Проблем:{" "}
            {diagnostics.problems.length}.
          </strong>
          {diagnostics.problems.map((p) => (
            <p key={p.id}>
              {p.name}: {p.problem}
            </p>
          ))}
        </div>
      )}
      {!data!.media.length ? (
        <Empty title="Медиатека пока пуста">
          Добавьте настоящие изображения культуры, карты или портреты.
          Постоянные внешние ссылки не используются.
        </Empty>
      ) : (
        <div className="media-grid">
          {data!.media.map((m) => (
            <article className="media-card" key={m.id}>
              <Asset id={m.id} alt={m.name} />
              <div>
                <h3>{m.name}</h3>
                <small>
                  {m.width} × {m.height} · {(m.size / 1024).toFixed(0)} КБ ·{" "}
                  {m.mime}
                </small>
                <p className="muted small">
                  {m.source || "Источник не указан"}
                </p>
                <div className="row-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      setSource(m);
                      setSourceText(m.source);
                    }}
                  >
                    Указать источник
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Удалить изображение ${m.name}`}
                    onClick={() => {
                      if (
                        confirm(
                          "Удалить локальный файл? Изображения, используемые материалом или историей, удалены не будут.",
                        )
                      )
                        void task(
                          () => api.request("media.delete", m.id),
                          "Изображение удалено",
                        );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {source && (
        <Modal title="Источник изображения" onClose={() => setSource(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await task(
                () =>
                  api.request("media.source", {
                    id: source.id,
                    source: sourceText,
                  }),
                "Источник сохранён",
              );
              if (r.ok) setSource(null);
            }}
          >
            <label>
              URL или библиографическое описание
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
              />
            </label>
            <p className="muted">
              Это сведения о происхождении. Изображение продолжает загружаться
              из локальной копии.
            </p>
            <div className="form-actions">
              <button className="button primary">Сохранить</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const { data, task } = useApp(),
    [preview, setPreview] = useState<{
      data: unknown;
      count: number;
      titles: string[];
    } | null>(null);
  async function importFile(format: "json" | "csv" | "backup") {
    const result = await task(
      () => api.importFile(format),
      (value) =>
        format === "backup" && value
          ? "Резервная копия проверена и восстановлена"
          : "",
    );
    if (result.ok && result.value && format !== "backup")
      setPreview(result.value as typeof preview);
  }
  const portraits = (data!.settings.rankMedia ?? {}) as Record<string, string>;
  return (
    <>
      <PageHeading
        eyebrow="ДАННЫЕ И ПРЕДПОЧТЕНИЯ"
        title="Настройки"
        description="Ваша база хранится отдельно от установленного приложения."
      />
      <div className="settings-grid">
        <Panel title="Полная резервная копия">
          <div className="setting-icon">
            <ShieldCheck size={28} />
          </div>
          <p>
            ZIP включает материал, темы, конспекты, наборы, настройки, историю,
            оценки и все локальные изображения.
          </p>
          <p className="muted">
            При восстановлении проверяется архив и создаётся предварительная
            копия текущей базы. После подтверждения база заменяется целиком.
          </p>
          <div className="actions">
            <button
              className="button primary"
              onClick={() =>
                void task(
                  () => api.exportFile("backup"),
                  (path) =>
                    path ? "Резервная копия проверена и сохранена" : "",
                )
              }
            >
              <Download size={16} />
              Создать ZIP-backup
            </button>
            <button
              className="button secondary"
              onClick={() => void importFile("backup")}
            >
              <Upload size={16} />
              Восстановить ZIP
            </button>
          </div>
        </Panel>
        <Panel title="Обмен учебным материалом">
          <p>
            JSON сохраняет структурированные записи и связи. CSV подходит для
            простых табличных записей. История и файлы изображений переносятся
            через полный backup.
          </p>
          <p className="muted">
            Импорт сначала показывает предварительный результат. Совпадающие ID
            не перезаписываются молча.
          </p>
          <div className="exchange-buttons">
            {(["json", "csv"] as const).map((format) => (
              <div key={format}>
                <strong>{format.toUpperCase()}</strong>
                <button
                  className="button secondary"
                  onClick={() =>
                    void task(
                      () => api.exportFile(format),
                      (path) => (path ? "Файл экспорта сохранён" : ""),
                    )
                  }
                >
                  <Download size={15} />
                  Экспорт
                </button>
                <button
                  className="button secondary"
                  onClick={() => void importFile(format)}
                >
                  <Upload size={15} />
                  Импорт
                </button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Хранение и интерфейс">
          <p>
            Обновление программы не должно перезаписывать пользовательские
            данные. Сохраняйте резервные копии также на другом диске.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              void task(() => api.request("desktop.openDataDirectory"))
            }
          >
            <FolderOpen size={16} />
            Открыть каталог данных
          </button>
          <label className="inline-label spaced">
            <input
              type="checkbox"
              checked={!!data!.settings.reduceMotion}
              onChange={(e) =>
                void task(() =>
                  api.request("settings.save", {
                    key: "reduceMotion",
                    value: e.target.checked,
                  }),
                )
              }
            />
            Уменьшить анимацию
          </label>
        </Panel>
        <Panel title="Модель знания">
          <p>
            Последние 20 оценённых проверок каждого направления. Правильно — 1,
            частично — 0,5, неправильно — 0.
          </p>
          <p className="muted">
            Слабо: &lt;50%; нормально: 50–&lt;70%; хорошо: 70–&lt;90%; отлично:
            90–&lt;97%; элитно: ≥97%. Непроверенный материал отмечается
            отдельно.
          </p>
        </Panel>
      </div>
      <Panel title="Портреты игровых рангов" className="spaced">
        <p className="muted">
          Назначьте проверенные локальные портреты. Ранг отражает знание
          истории, а не измерение интеллекта.
        </p>
        <div className="rank-settings">
          {ranks.map((rank) => (
            <div key={rank.key}>
              {portraits[rank.key] && (
                <Asset id={portraits[rank.key]} alt={rank.name} />
              )}
              <div>
                <strong>{rank.name}</strong>
                <small>
                  {rank.actor} · от {rank.min}%
                </small>
                <select
                  aria-label={`Портрет: ${rank.name}`}
                  value={portraits[rank.key] ?? ""}
                  onChange={(e) => {
                    const map = { ...portraits };
                    if (e.target.value) map[rank.key] = e.target.value;
                    else delete map[rank.key];
                    void task(
                      () =>
                        api.request("settings.save", {
                          key: "rankMedia",
                          value: map,
                        }),
                      "Портрет назначен",
                    );
                  }}
                >
                  <option value="">Не назначен</option>
                  {data!.media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          Изображения не поставляются с текущей сборкой: конкретные фотографии
          ещё предстоит согласовать и проверить.
        </p>
      </Panel>
      {preview && (
        <Modal
          title="Подтверждение импорта"
          onClose={() => setPreview(null)}
          wide
        >
          <p>
            Проверено записей: <strong>{preview.count}</strong>. Сохранение
            начнётся только после подтверждения.
          </p>
          <ul className="import-title-list">
            {preview.titles.map((title, i) => (
              <li key={i}>{title}</li>
            ))}
          </ul>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setPreview(null)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              onClick={async () => {
                const r = await task(
                  () => api.request("exchange.commit", preview.data),
                  "Материал импортирован",
                );
                if (r.ok) setPreview(null);
              }}
            >
              Подтвердить импорт
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
