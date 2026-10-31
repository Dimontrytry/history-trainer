import { useState, useEffect } from "react";
import {
  BookOpen,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  ChartNoAxesCombined,
  Images,
  Settings2,
  FileText,
  TriangleAlert,
  Search,
  LoaderCircle,
  X,
  Plus,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "./state";
import { Dashboard, Statistics } from "./pages/Analytics";
import { LibraryPage, ItemEditor, BulkImport } from "./pages/Library";
import { QuizPage } from "./pages/Quiz";
import { NotesPage } from "./pages/Notes";
import { MediaPage, SettingsPage } from "./pages/Settings";

export type Page =
  | "dashboard"
  | "library"
  | "quiz"
  | "notes"
  | "errors"
  | "statistics"
  | "media"
  | "settings";
const navigation = [
  { id: "dashboard", label: "Главная", icon: LayoutDashboard },
  { id: "library", label: "Библиотека", icon: LibraryBig },
  { id: "quiz", label: "Тестирование", icon: ListChecks },
  { id: "notes", label: "Конспекты", icon: FileText },
  { id: "errors", label: "Ошибки", icon: TriangleAlert },
  { id: "statistics", label: "Статистика", icon: ChartNoAxesCombined },
  { id: "media", label: "Медиатека", icon: Images },
  { id: "settings", label: "Настройки", icon: Settings2 },
] as const;
export function App() {
  const { data, busy, error, message, clear, refresh } = useApp();
  const [page, setPage] = useState<Page>("dashboard"),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<string | null | false>(false),
    [bulk, setBulk] = useState(false),
    [quizItems, setQuizItems] = useState<string[] | undefined>();
  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduce-motion",
      !!data?.settings.reduceMotion,
    );
  }, [data?.settings.reduceMotion]);
  function navigate(p: Page) {
    clear();
    setPage(p);
  }
  function testItems(ids?: string[]) {
    setQuizItems(ids);
    navigate("quiz");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-icon">
            <BookOpen size={25} />
          </span>
          <span>
            HISTORY<span className="brand-sub">ЛИЧНЫЙ АРХИВ ЗНАНИЙ</span>
          </span>
        </a>
        <div className="sidebar-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "nav-link active" : "nav-link"}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "library" && data && <small>{data.items.length}</small>}
              {n.id === "errors" && !!data?.stats.incorrect && (
                <small className="error-count">{data.stats.incorrect}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={17} />
          <div>
            Локальное хранилище<small>Материал и прогресс на вашем ПК</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Личный архив <span>/</span>{" "}
            {navigation.find((n) => n.id === page)?.label}
          </span>
          <label className="global-search">
            <Search size={16} />
            <input
              aria-label="Поиск по библиотеке"
              placeholder="Поиск по библиотеке"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage("library");
              }}
            />
          </label>
          <span className="local-indicator">
            <i />
            Один пользователь
          </span>
        </header>
        <main>
          {!data ? (
            <div className="startup">
              <LoaderCircle className="spin" />
              <p>{error || "Открываем локальную базу…"}</p>
              {error && (
                <button onClick={() => void refresh()}>Повторить</button>
              )}
            </div>
          ) : (
            <>
              {page === "dashboard" && (
                <Dashboard
                  navigate={navigate}
                  add={() => setEditor(null)}
                  test={() => testItems()}
                />
              )}
              {(page === "library" || page === "errors") && (
                <LibraryPage
                  errorsOnly={page === "errors"}
                  query={query}
                  setQuery={setQuery}
                  edit={setEditor}
                  add={() => setEditor(null)}
                  bulk={() => setBulk(true)}
                  test={testItems}
                />
              )}
              {page === "quiz" && (
                <QuizPage
                  initialItemIds={quizItems}
                  clearInitial={() => setQuizItems(undefined)}
                />
              )}
              {page === "notes" && <NotesPage />}
              {page === "statistics" && <Statistics />}
              {page === "media" && <MediaPage />}
              {page === "settings" && <SettingsPage />}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>HISTORY TRAINER · СБОРКА РАЗРАБОТКИ</span>
          <span>Знание складывается из проверенных ответов.</span>
        </footer>
      </div>
      {(error || message) && (
        <div
          className={error ? "toast error" : "toast"}
          role={error ? "alert" : "status"}
        >
          <span>{error || message}</span>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={clear}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-layer" role="status">
          <div>
            <LoaderCircle className="spin" />
            <span>Выполняется операция…</span>
          </div>
        </div>
      )}
      {editor !== false && data && (
        <ItemEditor itemId={editor} close={() => setEditor(false)} />
      )}
      {bulk && data && <BulkImport close={() => setBulk(false)} />}
    </div>
  );
}
