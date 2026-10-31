import { useMemo, useState } from "react";
import {
  Plus,
  Upload,
  Search,
  ArrowDownUp,
  Trash2,
  Pencil,
  History,
  Play,
  ImagePlus,
  X,
} from "lucide-react";
import { api, useApp } from "../state";
import {
  Asset,
  Empty,
  Level,
  Modal,
  PageHeading,
  Progress,
  formatTime,
  directionNames,
} from "../components";
import {
  itemTypes,
  type ItemInput,
  type Item,
  type TemplateInput,
  type ImportRow,
} from "../../shared/models";
import { normalize } from "../../domain/validation";
import { parseDate } from "../../domain/dates";

export function TopicSelect({
  value,
  onChange,
  all = false,
}: {
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
}) {
  const { data } = useApp();
  const nodes = data!.nodes;
  const path = (id: string): string => {
    const n = nodes.find((n) => n.id === id);
    return n ? (n.parentId ? path(n.parentId) + " / " : "") + n.title : "";
  };
  return (
    <select
      aria-label="Тема"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {all && <option value="">Все разделы и темы</option>}
      {nodes
        .filter((n) => all || n.kind === "topic")
        .map((n) => (
          <option value={n.id} key={n.id}>
            {path(n.id)}
          </option>
        ))}
    </select>
  );
}
export function LibraryPage({
  errorsOnly,
  query,
  setQuery,
  edit,
  add,
  bulk,
  test,
}: {
  errorsOnly: boolean;
  query: string;
  setQuery: (s: string) => void;
  edit: (id: string) => void;
  add: () => void;
  bulk: () => void;
  test: (ids: string[]) => void;
}) {
  const { data, task } = useApp();
  const [topic, setTopic] = useState(
      typeof data!.settings.lastTopic === "string"
        ? data!.settings.lastTopic
        : "",
    ),
    [type, setType] = useState(""),
    [tag, setTag] = useState(""),
    [setId, setSetId] = useState(""),
    [order, setOrder] = useState("updated"),
    [selected, setSelected] = useState<string[]>([]),
    [history, setHistory] = useState<{ title: string; rows: any[] } | null>(
      null,
    ),
    [nodeModal, setNodeModal] = useState(false),
    [setModal, setSetModal] = useState(false),
    [batchModal, setBatchModal] = useState<"delete" | "move" | "tag" | null>(
      null,
    );
  function chooseTopic(id: string) {
    setTopic(id);
    void task(() =>
      api.request("settings.save", { key: "lastTopic", value: id }),
    );
  }
  const ids = new Set(topic ? [topic] : data!.nodes.map((n) => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of data!.nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  const items = data!.items
    .filter(
      (i) =>
        ids.has(i.topicId) &&
        (!errorsOnly || i.errors > 0) &&
        (!type || i.type === type) &&
        (!tag || i.tags.includes(tag)) &&
        (!setId ||
          data!.sets.find((s) => s.id === setId)?.itemIds.includes(i.id)) &&
        normalize(
          [i.title, i.description, i.dateText, ...i.tags].join(" "),
        ).includes(normalize(query)),
    )
    .sort((a, b) =>
      order === "date"
        ? (a.date?.lower ?? Infinity) - (b.date?.lower ?? Infinity)
        : order === "title"
          ? a.title.localeCompare(b.title, "ru")
          : order === "progress"
            ? a.progress - b.progress
            : b.updatedAt.localeCompare(a.updatedAt),
    );
  const tags = [...new Set(data!.items.flatMap((i) => i.tags))].sort();
  async function showHistory(item: Item) {
    const r = await task(() => api.request<any[]>("item.history", item.id));
    if (r.ok) setHistory({ title: item.title, rows: r.value });
  }
  return (
    <>
      <PageHeading
        eyebrow={errorsOnly ? "РАЗБОР И ПОВТОРЕНИЕ" : "ВАША БАЗА ЗНАНИЙ"}
        title={errorsOnly ? "Работа над ошибками" : "Библиотека"}
        description={
          errorsOnly
            ? "Материал, по которому были неправильные ответы. История сохраняется."
            : `${data!.items.length} материалов · события, личности, культура и связанные факты`
        }
        actions={
          <>
            <button className="button secondary" onClick={bulk}>
              <Upload size={16} />
              Массовый ввод
            </button>
            <button className="button primary" onClick={add}>
              <Plus size={17} />
              Добавить материал
            </button>
          </>
        }
      />
      <div className="library-layout">
        <aside className="library-tree">
          <div className="panel-heading">
            <h3>Структура</h3>
            <button
              className="icon-button"
              aria-label="Создать раздел или тему"
              onClick={() => setNodeModal(true)}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            className={!topic ? "tree-item selected" : "tree-item"}
            onClick={() => chooseTopic("")}
          >
            Весь материал <span>{data!.items.length}</span>
          </button>
          {data!.nodes.map((n) => (
            <button
              key={n.id}
              className={topic === n.id ? "tree-item selected" : "tree-item"}
              style={{
                paddingLeft:
                  n.kind === "section" ? 12 : n.kind === "period" ? 23 : 34,
              }}
              onClick={() => chooseTopic(n.id)}
            >
              <span>
                {n.kind === "section" ? "▦" : n.kind === "period" ? "◷" : "·"}{" "}
                {n.title}
              </span>
            </button>
          ))}
          <div className="panel-heading spaced">
            <h3>Наборы</h3>
            <button
              className="icon-button"
              aria-label="Создать набор"
              onClick={() => setSetModal(true)}
            >
              <Plus size={17} />
            </button>
          </div>
          {data!.sets.map((s) => (
            <div className="set-row" key={s.id}>
              <button
                className={setId === s.id ? "tree-item selected" : "tree-item"}
                onClick={() => setSetId(setId === s.id ? "" : s.id)}
              >
                {s.title}
                <span>{s.itemIds.length}</span>
              </button>
              <button
                className="icon-button"
                aria-label={`Удалить набор ${s.title}`}
                onClick={() => {
                  if (
                    confirm(
                      "Удалить набор? Сам материал останется в библиотеке.",
                    )
                  )
                    void task(
                      () => api.request("set.delete", s.id),
                      "Набор удалён",
                    );
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {!data!.sets.length && (
            <p className="muted small">
              Выберите материал и сохраните его в набор.
            </p>
          )}
        </aside>
        <section className="library-main">
          <div className="filters">
            <label className="search-input">
              <Search size={16} />
              <input
                aria-label="Найти материал"
                placeholder="Название, дата, тег…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Тип материала"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Все типы</option>
              {Object.entries(itemTypes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Тег"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">Все теги</option>
              {tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              aria-label="Сортировка"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="updated">Последние изменения</option>
              <option value="date">По исторической дате</option>
              <option value="title">По названию</option>
              <option value="progress">Сначала слабые</option>
            </select>
          </div>
          {selected.length > 0 && (
            <div className="selection-bar">
              <strong>Выбрано: {selected.length}</strong>
              <button onClick={() => test(selected)}>Тест</button>
              <button onClick={() => setBatchModal("move")}>Переместить</button>
              <button onClick={() => setBatchModal("tag")}>
                Назначить тег
              </button>
              <button onClick={() => setSetModal(true)}>В набор</button>
              <button
                className="danger-text"
                onClick={() => setBatchModal("delete")}
              >
                Удалить
              </button>
              <button onClick={() => setSelected([])}>Снять выбор</button>
            </div>
          )}
          {!items.length ? (
            <Empty
              title={
                data!.items.length
                  ? "Материал не найден"
                  : "Начните свою библиотеку"
              }
              action={
                <button className="button primary" onClick={add}>
                  <Plus size={16} />
                  Добавить первую запись
                </button>
              }
            >
              {data!.items.length
                ? "Измените поиск или фильтры."
                : "Добавьте запись или вставьте сразу несколько строк через массовый ввод. Историческая база не заполнена демонстрационными данными."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Выбрать все видимые"
                        type="checkbox"
                        checked={
                          items.length > 0 &&
                          items.every((i) => selected.includes(i.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...selected,
                                    ...items.map((i) => i.id),
                                  ]),
                                ]
                              : selected.filter(
                                  (id) => !items.some((i) => i.id === id),
                                ),
                          )
                        }
                      />
                    </th>
                    <th>Материал</th>
                    <th>Дата / период</th>
                    <th>Знание</th>
                    <th>Ошибки</th>
                    <th>
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          aria-label={`Выбрать ${item.title}`}
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, item.id]
                                : selected.filter((id) => id !== item.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="item-title"
                          onClick={() => edit(item.id)}
                        >
                          {item.mediaIds.length > 0 && (
                            <Asset
                              id={item.mediaIds[0]}
                              alt=""
                              className="row-image"
                            />
                          )}
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {itemTypes[item.type]}
                              {item.tags.length
                                ? " · " + item.tags.join(" · ")
                                : ""}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td className="date-cell">{item.dateText || "—"}</td>
                      <td>
                        <Progress
                          value={item.progress}
                          attempts={item.gradedCount}
                        />
                        <Level
                          value={item.progress}
                          attempts={item.gradedCount}
                        />
                        {item.lastChecked && (
                          <small className="last-checked">
                            {formatTime(item.lastChecked)}
                          </small>
                        )}
                      </td>
                      <td>
                        <span
                          className={item.errors ? "error-number" : "muted"}
                        >
                          {item.errors}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={`История: ${item.title}`}
                            onClick={() => void showHistory(item)}
                          >
                            <History size={17} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Редактировать: ${item.title}`}
                            onClick={() => edit(item.id)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-footer">
            <span>Показано: {items.length}</span>
            <button
              className="text-button"
              disabled={!items.length}
              onClick={() => test(items.map((i) => i.id))}
            >
              <Play size={15} />
              Проверить эту выборку
            </button>
          </div>
        </section>
      </div>
      {history && (
        <Modal
          title={`История: ${history.title}`}
          onClose={() => setHistory(null)}
          wide
        >
          {!history.rows.length ? (
            <Empty title="Проверок пока нет">
              Ответы появятся после завершения теста.
            </Empty>
          ) : (
            <div className="history-list">
              {history.rows.map((r, i) => (
                <article key={i}>
                  <small>
                    {formatTime(r.created_at)} ·{" "}
                    {directionNames[r.snapshot.template.direction] ?? "Вопрос"}
                  </small>
                  <h3>{r.snapshot.template.prompt}</h3>
                  <p>
                    Ваш ответ: <strong>{r.answer}</strong>
                  </p>
                  <p>Эталон: {r.snapshot.template.expected}</p>
                  <p className={r.units === 0 ? "danger-text" : "muted"}>
                    {r.reason}
                  </p>
                  {r.before_percent !== null && (
                    <small>
                      Знание: {r.before_percent}% → {r.after_percent}%
                    </small>
                  )}
                </article>
              ))}
            </div>
          )}
        </Modal>
      )}
      {nodeModal && <NodeModal close={() => setNodeModal(false)} />}
      {setModal && (
        <SetModal selected={selected} close={() => setSetModal(false)} />
      )}
      {batchModal && (
        <BatchModal
          operation={batchModal}
          ids={selected}
          close={() => setBatchModal(null)}
          done={() => setSelected([])}
        />
      )}
    </>
  );
}
function NodeModal({ close }: { close: () => void }) {
  const { data, task } = useApp(),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState<"section" | "period" | "topic">("topic"),
    [parent, setParent] = useState("russia");
  return (
    <Modal title="Новый раздел, период или тема" onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task(
            () =>
              api.request("node.save", {
                title,
                kind,
                parentId: kind === "section" ? null : parent,
              }),
            "Структура сохранена",
          );
          if (r.ok) close();
        }}
      >
        <label>
          Название
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Тип
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="section">Раздел</option>
            <option value="period">Период</option>
            <option value="topic">Тема</option>
          </select>
        </label>
        {kind !== "section" && (
          <label>
            Родитель
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {data!.nodes
                .filter((n) => n.kind !== "topic")
                .map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Отмена
          </button>
          <button className="button primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}
function SetModal({
  selected,
  close,
}: {
  selected: string[];
  close: () => void;
}) {
  const { data, task } = useApp(),
    [title, setTitle] = useState(""),
    [existing, setExisting] = useState("");
  return (
    <Modal title="Сохранить выборку в набор" onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const old = data!.sets.find((s) => s.id === existing);
          const r = await task(
            () =>
              api.request("set.save", {
                id: existing || undefined,
                title: old?.title ?? title,
                itemIds: [...new Set([...(old?.itemIds ?? []), ...selected])],
              }),
            "Набор сохранён",
          );
          if (r.ok) close();
        }}
      >
        <p>Выбрано материалов: {selected.length}. Объекты не дублируются.</p>
        <label>
          Набор
          <select
            value={existing}
            onChange={(e) => setExisting(e.target.value)}
          >
            <option value="">Создать новый</option>
            {data!.sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {!existing && (
          <label>
            Название
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        )}
        <div className="form-actions">
          <button className="button primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}
function BatchModal({
  operation,
  ids,
  close,
  done,
}: {
  operation: "delete" | "move" | "tag";
  ids: string[];
  close: () => void;
  done: () => void;
}) {
  const { task } = useApp(),
    [topicId, setTopic] = useState("russia-general"),
    [tag, setTag] = useState("");
  return (
    <Modal
      title={
        operation === "delete"
          ? "Удалить материал?"
          : operation === "move"
            ? "Переместить материал"
            : "Назначить тег"
      }
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task(
            () =>
              api.request("item.batch", {
                ids,
                operation,
                topicId,
                tag: tag || undefined,
              }),
            "Изменения сохранены",
          );
          if (r.ok) {
            done();
            close();
          }
        }}
      >
        <p>
          Материалов: {ids.length}.
          {operation === "delete" &&
            " Они исчезнут из активной библиотеки. История завершённых проверок сохранится."}
        </p>
        {operation === "move" && (
          <label>
            Новая тема
            <TopicSelect value={topicId} onChange={setTopic} />
          </label>
        )}
        {operation === "tag" && (
          <label>
            Тег
            <input
              required
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={close}>
            Отмена
          </button>
          <button
            className={
              "button " + (operation === "delete" ? "danger" : "primary")
            }
          >
            {operation === "delete" ? "Подтвердить удаление" : "Сохранить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ItemEditor({
  itemId,
  close,
}: {
  itemId: string | null;
  close: () => void;
}) {
  const { data, task } = useApp(),
    existing = data!.items.find((i) => i.id === itemId);
  const [form, setForm] = useState<ItemInput>(
    existing
      ? { ...existing }
      : {
          type: "event",
          title: "",
          topicId: "russia-general",
          dateText: "",
          calendar: "source_unspecified",
          description: "",
          answer: "",
          author: "",
          source: "",
          tags: [],
          mediaIds: [],
          relatedIds: [],
          templates: [],
        },
  );
  const [tagText, setTagText] = useState(form.tags.join(", ")),
    [mediaPicker, setMediaPicker] = useState(false),
    [dateError, setDateError] = useState("");
  const update = <K extends keyof ItemInput>(key: K, value: ItemInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const question = (index: number, key: keyof TemplateInput, value: unknown) =>
    setForm((f) => ({
      ...f,
      templates: f.templates.map((t, i) =>
        i === index ? { ...t, [key]: value } : t,
      ),
    }));
  async function importImages() {
    const r = await task(
      () => api.importImages(),
      "Изображения сохранены локально",
    );
    if (r.ok)
      update("mediaIds", [
        ...new Set([...form.mediaIds, ...r.value.map((m) => m.id)]),
      ]);
  }
  function dateCheck() {
    try {
      if (form.dateText) parseDate(form.dateText, form.calendar);
      setDateError("");
    } catch (e) {
      setDateError((e as Error).message);
    }
  }
  return (
    <Modal
      title={itemId ? "Редактирование материала" : "Новый материал"}
      onClose={close}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task(
            () =>
              api.request("item.save", {
                ...form,
                tags: tagText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }),
            "Материал сохранён",
          );
          if (r.ok) close();
        }}
      >
        <div className="form-grid">
          <label>
            Тип материала
            <select
              value={form.type}
              onChange={(e) =>
                update("type", e.target.value as ItemInput["type"])
              }
            >
              {Object.entries(itemTypes).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Тема
            <TopicSelect
              value={form.topicId}
              onChange={(v) => update("topicId", v)}
            />
          </label>
          <label className="full">
            Название / вопрос
            <input
              autoFocus
              required
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <label>
            Дата или период
            <input
              value={form.dateText}
              placeholder="Год, день, интервал, век, часть века…"
              onBlur={dateCheck}
              onChange={(e) => update("dateText", e.target.value)}
            />
            {dateError && <small className="danger-text">{dateError}</small>}
          </label>
          <label>
            Календарь источника
            <select
              value={form.calendar}
              onChange={(e) =>
                update("calendar", e.target.value as ItemInput["calendar"])
              }
            >
              <option value="source_unspecified">Не указан в источнике</option>
              <option value="julian">Юлианский</option>
              <option value="gregorian">Григорианский</option>
            </select>
          </label>
          <label className="full">
            Определение / эталон открытого ответа
            <textarea
              rows={3}
              value={form.answer}
              onChange={(e) => update("answer", e.target.value)}
            />
          </label>
          <label className="full">
            Описание и связанные факты
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>
          <label>
            Автор / создатель
            <input
              value={form.author}
              onChange={(e) => update("author", e.target.value)}
            />
          </label>
          <label>
            Теги через запятую
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
            />
          </label>
          <label className="full">
            Источник / библиографическое описание
            <input
              value={form.source}
              onChange={(e) => update("source", e.target.value)}
            />
          </label>
        </div>
        <div className="form-section">
          <div className="panel-heading">
            <h3>Изображения и карты</h3>
            <div className="actions">
              <button
                type="button"
                className="text-button"
                onClick={() => setMediaPicker(!mediaPicker)}
              >
                Из медиатеки
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => void importImages()}
              >
                <ImagePlus size={16} />С ПК
              </button>
            </div>
          </div>
          <div className="image-strip">
            {form.mediaIds.map((id) => (
              <div key={id}>
                <Asset id={id} alt="Связанное изображение" />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Убрать связь с изображением"
                  onClick={() =>
                    update(
                      "mediaIds",
                      form.mediaIds.filter((m) => m !== id),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          {mediaPicker && (
            <div className="media-picker">
              {data!.media.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={form.mediaIds.includes(m.id) ? "chosen" : ""}
                  onClick={() =>
                    update(
                      "mediaIds",
                      form.mediaIds.includes(m.id)
                        ? form.mediaIds.filter((id) => id !== m.id)
                        : [...form.mediaIds, m.id],
                    )
                  }
                >
                  <Asset id={m.id} alt={m.name} />
                  <span>{m.name}</span>
                </button>
              ))}
              {!data!.media.length && (
                <p>Медиатека пуста. Добавьте изображение с ПК.</p>
              )}
            </div>
          )}
        </div>
        <div className="form-section">
          <div className="panel-heading">
            <h3>Вопросы и допустимые ответы</h3>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                update("templates", [
                  ...form.templates,
                  {
                    direction: "custom_" + crypto.randomUUID(),
                    kind: "short",
                    prompt: "",
                    expected: "",
                    alternatives: [],
                    checking: "automatic",
                    criteria: [],
                    mediaIds: [],
                    enabled: true,
                  },
                ])
              }
            >
              <Plus size={16} />
              Свой вопрос
            </button>
          </div>
          {!form.templates.length && (
            <p className="muted">
              При сохранении вопросы будут созданы из даты, определения и
              изображений. После этого их можно редактировать и добавлять
              допустимые ответы.
            </p>
          )}
          {form.templates.map((t, i) => (
            <fieldset className="question-editor" key={t.id ?? i}>
              <legend>
                {directionNames[t.direction] ?? "Пользовательский вопрос"}
              </legend>
              <div className="form-grid">
                <label>
                  Формат
                  <select
                    value={t.kind}
                    onChange={(e) => question(i, "kind", e.target.value)}
                  >
                    <option value="date">Историческая дата</option>
                    <option value="short">Короткий ответ</option>
                    <option value="long">Развёрнутый ответ</option>
                    <option value="choice">Выбор из вариантов</option>
                    <option value="image">Изображение</option>
                    <option value="map">Карта</option>
                  </select>
                </label>
                <label>
                  Проверка
                  <select
                    value={t.checking}
                    onChange={(e) => question(i, "checking", e.target.value)}
                  >
                    <option value="automatic">
                      Автоматическая, с разбором неоднозначностей
                    </option>
                    <option value="manual">Самопроверка</option>
                    <option value="rubric">
                      По смысловым критериям с разбором
                    </option>
                  </select>
                </label>
                <label className="full">
                  Текст вопроса
                  <textarea
                    required
                    value={t.prompt}
                    onChange={(e) => question(i, "prompt", e.target.value)}
                  />
                </label>
                <label className="full">
                  Эталон
                  <textarea
                    required
                    value={t.expected}
                    onChange={(e) => question(i, "expected", e.target.value)}
                  />
                </label>
                <label className="full">
                  Допустимые ответы / синонимы, каждый с новой строки
                  <textarea
                    value={t.alternatives.join("\n")}
                    onChange={(e) =>
                      question(i, "alternatives", e.target.value.split("\n"))
                    }
                    onBlur={() =>
                      question(
                        i,
                        "alternatives",
                        t.alternatives.filter((s) => s.trim()),
                      )
                    }
                  />
                </label>
                {t.checking === "rubric" && (
                  <label className="full">
                    Обязательные смысловые пункты, каждый с новой строки
                    <textarea
                      value={t.criteria.join("\n")}
                      onChange={(e) =>
                        question(i, "criteria", e.target.value.split("\n"))
                      }
                      onBlur={() =>
                        question(
                          i,
                          "criteria",
                          t.criteria.filter((s) => s.trim()),
                        )
                      }
                    />
                  </label>
                )}
                {(t.kind === "image" || t.kind === "map") && (
                  <div className="full">
                    <small>Изображения вопроса</small>
                    <div className="check-list">
                      {data!.media.map((m) => (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            checked={t.mediaIds.includes(m.id)}
                            onChange={(e) =>
                              question(
                                i,
                                "mediaIds",
                                e.target.checked
                                  ? [...t.mediaIds, m.id]
                                  : t.mediaIds.filter((id) => id !== m.id),
                              )
                            }
                          />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <label className="inline-label full">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => question(i, "enabled", e.target.checked)}
                  />
                  Использовать в тестах и показателе знания
                </label>
              </div>
            </fieldset>
          ))}
        </div>
        <div className="form-section">
          <h3>Связанный материал</h3>
          <div className="check-list scroll-list">
            {data!.items
              .filter((i) => i.id !== itemId)
              .map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={form.relatedIds.includes(i.id)}
                    onChange={(e) =>
                      update(
                        "relatedIds",
                        e.target.checked
                          ? [...form.relatedIds, i.id]
                          : form.relatedIds.filter((id) => id !== i.id),
                      )
                    }
                  />
                  {i.title}
                </label>
              ))}
            {data!.items.length < 2 && (
              <p className="muted small">
                Добавьте другие объекты, чтобы связывать между собой факты.
              </p>
            )}
          </div>
        </div>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={close}>
            Отмена
          </button>
          <button className="button primary">Сохранить материал</button>
        </div>
      </form>
    </Modal>
  );
}
export function BulkImport({ close }: { close: () => void }) {
  const { task } = useApp(),
    [text, setText] = useState(""),
    [rows, setRows] = useState<ImportRow[]>([]),
    [topicId, setTopic] = useState("russia-general"),
    [type, setType] = useState<ItemInput["type"]>("event"),
    [preview, setPreview] = useState(false);
  function change(index: number, key: "dateText" | "title", value: string) {
    setRows((rows) =>
      rows.map((r) => {
        if (r.index !== index) return r;
        const next = { ...r, [key]: value };
        try {
          parseDate(next.dateText);
          if (!next.title.trim()) throw new Error("Нет названия");
          next.error = null;
        } catch (e) {
          next.error = (e as Error).message;
        }
        return next;
      }),
    );
  }
  return (
    <Modal title="Массовый ввод материала" onClose={close} wide>
      <p className="muted">
        Одна запись на строку: дата, пробел, тире, пробел, название. Ничего не
        сохраняется до подтверждения.
      </p>
      <div className="form-grid">
        <label>
          Тема
          <TopicSelect value={topicId} onChange={setTopic} />
        </label>
        <label>
          Тип
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemInput["type"])}
          >
            {Object.entries(itemTypes).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!preview ? (
        <>
          <label>
            Текст
            <textarea
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Дата — название события"
            />
          </label>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={!text.trim()}
              onClick={async () => {
                const r = await task(() =>
                  api.request<ImportRow[]>("import.preview", text),
                );
                if (r.ok) {
                  setRows(r.value);
                  setPreview(true);
                }
              }}
            >
              Распознать и проверить
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="import-rows">
            {rows.map((row) => (
              <div
                className={row.error ? "import-row invalid" : "import-row"}
                key={row.index}
              >
                <span>{row.index}</span>
                <input
                  aria-label={`Дата строки ${row.index}`}
                  value={row.dateText}
                  onChange={(e) =>
                    change(row.index, "dateText", e.target.value)
                  }
                />
                <input
                  aria-label={`Название строки ${row.index}`}
                  value={row.title}
                  onChange={(e) => change(row.index, "title", e.target.value)}
                />
                <button
                  className="icon-button"
                  aria-label={`Исключить строку ${row.index}`}
                  onClick={() =>
                    setRows(rows.filter((r) => r.index !== row.index))
                  }
                >
                  <X size={16} />
                </button>
                {row.error && (
                  <small>
                    {row.error} · Исходная строка: {row.text}
                  </small>
                )}
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setPreview(false)}
            >
              Вернуться к тексту
            </button>
            <button
              className="button primary"
              disabled={!rows.length || rows.some((r) => r.error)}
              onClick={async () => {
                const r = await task(
                  () =>
                    api.request("import.rows", {
                      topicId,
                      type,
                      rows: rows.map((r) => ({
                        title: r.title,
                        dateText: r.dateText,
                      })),
                    }),
                  `Сохранено записей: ${rows.length}`,
                );
                if (r.ok) close();
              }}
            >
              Подтвердить сохранение ({rows.length})
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
