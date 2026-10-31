import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Plus,
  Trash2,
  ImagePlus,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Undo2,
  Redo2,
} from "lucide-react";
import { api, useApp } from "../state";
import { Empty, Modal, PageHeading, formatTime } from "../components";
import { TopicSelect } from "./Library";
import type { Note } from "../../shared/models";
const LocalImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src^="history-media://asset/"]' }];
  },
});

export function NotesPage() {
  const { data, task } = useApp(),
    [editing, setEditing] = useState<Note | null | false>(false),
    [query, setQuery] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="СВЯЗИ И КОНТЕКСТ"
        title="Конспекты"
        description="Текст, изображения и связанные учебные объекты в одном месте."
        actions={
          <button className="button primary" onClick={() => setEditing(null)}>
            <Plus size={17} />
            Новый конспект
          </button>
        }
      />
      <input
        className="notes-search"
        aria-label="Поиск конспектов"
        placeholder="Найти конспект…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!data!.notes.length ? (
        <Empty title="Пока нет конспектов">
          Создайте заметку и свяжите её с материалом для тестов.
        </Empty>
      ) : (
        <div className="notes-grid">
          {data!.notes
            .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
            .map((n) => (
              <article className="note-card" key={n.id}>
                <span className="eyebrow">
                  {data!.nodes.find((t) => t.id === n.topicId)?.title}
                </span>
                <button className="item-title" onClick={() => setEditing(n)}>
                  <h2>{n.title}</h2>
                </button>
                <p>{n.itemIds.length} связанных объектов</p>
                <footer>
                  <small>{formatTime(n.updatedAt)}</small>
                  <button
                    className="icon-button"
                    aria-label={`Удалить конспект ${n.title}`}
                    onClick={() => {
                      if (
                        confirm(
                          "Удалить конспект? Связанный учебный материал останется.",
                        )
                      )
                        void task(
                          () => api.request("note.delete", n.id),
                          "Конспект удалён",
                        );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </footer>
              </article>
            ))}
        </div>
      )}
      {editing !== false && (
        <NoteEditor note={editing} close={() => setEditing(false)} />
      )}
    </>
  );
}
function NoteEditor({ note, close }: { note: Note | null; close: () => void }) {
  const { data, task } = useApp(),
    [title, setTitle] = useState(note?.title ?? ""),
    [topicId, setTopic] = useState(note?.topicId ?? "russia-general"),
    [links, setLinks] = useState(note?.itemIds ?? []),
    [filter, setFilter] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
      LocalImage.configure({ allowBase64: false }),
    ],
    content: note?.document ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    editorProps: { attributes: { "aria-label": "Текст конспекта" } },
  });
  async function addImage() {
    const r = await task(
      () => api.importImages(),
      "Изображение сохранено локально",
    );
    if (r.ok)
      for (const media of r.value)
        editor
          ?.chain()
          .focus()
          .setImage({ src: api.assetUrl(media.id), alt: media.name })
          .run();
  }
  return (
    <Modal title={note ? "Конспект" : "Новый конспект"} onClose={close} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await task(
            () =>
              api.request("note.save", {
                id: note?.id,
                title,
                topicId,
                document: editor?.getJSON() ?? { type: "doc", content: [] },
                itemIds: links,
              }),
            "Конспект сохранён",
          );
          if (r.ok) close();
        }}
      >
        <div className="form-grid">
          <label>
            Название
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Тема
            <TopicSelect value={topicId} onChange={setTopic} />
          </label>
        </div>
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Форматирование конспекта"
        >
          <button
            type="button"
            aria-label="Жирный"
            aria-pressed={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold size={17} />
          </button>
          <button
            type="button"
            aria-label="Курсив"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic size={17} />
          </button>
          <button
            type="button"
            aria-label="Заголовок"
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 size={17} />
          </button>
          <button
            type="button"
            aria-label="Маркированный список"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List size={17} />
          </button>
          <button
            type="button"
            aria-label="Нумерованный список"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={17} />
          </button>
          <button
            type="button"
            aria-label="Добавить изображение"
            onClick={() => void addImage()}
          >
            <ImagePlus size={17} />
          </button>
          <button
            type="button"
            aria-label="Отменить"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            aria-label="Повторить"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <EditorContent editor={editor} className="rich-editor" />
        <div className="form-section">
          <h3>Связанный материал</h3>
          <input
            aria-label="Поиск связанных объектов"
            placeholder="Найти объект…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="check-list scroll-list">
            {data!.items
              .filter((i) =>
                i.title.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={links.includes(i.id)}
                    onChange={(e) =>
                      setLinks(
                        e.target.checked
                          ? [...links, i.id]
                          : links.filter((id) => id !== i.id),
                      )
                    }
                  />
                  {i.title}
                </label>
              ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Отмена
          </button>
          <button className="button primary">Сохранить конспект</button>
        </div>
      </form>
    </Modal>
  );
}
