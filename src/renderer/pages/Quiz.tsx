import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CornerDownLeft,
  Play,
  Check,
  X,
  CircleHelp,
  RotateCcw,
} from "lucide-react";
import { api, useApp } from "../state";
import {
  Asset,
  Empty,
  PageHeading,
  Panel,
  Metric,
  directionNames,
  formatPercent,
  formatTime,
} from "../components";
import { TopicSelect } from "./Library";
import type { QuizConfig, Session, Review } from "../../shared/models";

const modes: Record<string, string> = {
  all: "Обычный тест",
  random: "Случайный тест",
  quick: "Быстрый тест",
  exam: "Экзаменационный",
  mixed: "Смешанный",
};
export function QuizPage({
  initialItemIds,
  clearInitial,
}: {
  initialItemIds?: string[];
  clearInitial: () => void;
}) {
  const { data, task } = useApp();
  const [session, setSession] = useState<Session | null>(null),
    [config, setConfig] = useState<QuizConfig>({
      selection: "all",
      directions: [],
      count: Math.max(
        1,
        Math.min(
          10,
          data!.items.flatMap((i) => i.templates.filter((t) => t.enabled))
            .length,
        ),
      ),
      mode: "all",
      choice: false,
    });
  useEffect(() => {
    if (initialItemIds) {
      setSession(null);
      setConfig((c) => ({
        ...c,
        itemIds: initialItemIds,
        count: Math.max(
          1,
          Math.min(
            10,
            data!.items
              .filter((i) => initialItemIds.includes(i.id))
              .flatMap((i) => i.templates.filter((t) => t.enabled)).length,
          ),
        ),
      }));
      clearInitial();
    }
  }, [initialItemIds]);
  const directions = [
    ...new Set(
      data!.items.flatMap((i) =>
        i.templates.filter((t) => t.enabled).map((t) => t.direction),
      ),
    ),
  ];
  const load = async (id: string) => {
    const r = await task(() => api.request<Session>("quiz.get", id));
    if (r.ok) setSession(r.value);
  };
  if (session)
    return session.status === "active" ? (
      <Runner
        session={session}
        update={setSession}
        leave={() => setSession(null)}
      />
    ) : (
      <Results
        session={session}
        update={setSession}
        leave={() => setSession(null)}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="ПРОВЕРКА ЗНАНИЙ"
        title="Тестирование"
        description="Выберите материал и формат. Результаты откроются после завершения теста."
      />
      {!directions.length ? (
        <Empty title="Пока нет вопросов">
          Добавьте материал с датой, определением или собственным вопросом в
          библиотеке.
        </Empty>
      ) : (
        <div className="quiz-builder-layout">
          <Panel title="Конструктор теста">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await task(() =>
                  api.request<string>("quiz.start", config),
                );
                if (r.ok) await load(r.value);
              }}
            >
              <div className="form-grid">
                <label>
                  Режим
                  <select
                    value={config.mode}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        mode: e.target.value as QuizConfig["mode"],
                        ...(e.target.value === "quick"
                          ? {
                              count: Math.min(
                                5,
                                Math.max(
                                  1,
                                  data!.items.flatMap((i) => i.templates)
                                    .length,
                                ),
                              ),
                            }
                          : {}),
                      })
                    }
                  >
                    {Object.entries(modes).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Количество вопросов
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={config.count}
                    onChange={(e) =>
                      setConfig({ ...config, count: +e.target.value })
                    }
                  />
                </label>
                <label>
                  Раздел или тема
                  <TopicSelect
                    all
                    value={config.topicId ?? ""}
                    onChange={(v) =>
                      setConfig({ ...config, topicId: v || undefined })
                    }
                  />
                </label>
                <label>
                  Отбор
                  <select
                    value={config.selection}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        selection: e.target.value as QuizConfig["selection"],
                      })
                    }
                  >
                    <option value="all">Весь выбранный материал</option>
                    <option value="errors">Только материал с ошибками</option>
                    <option value="weak">Слабые и неизученные</option>
                  </select>
                </label>
                <label>
                  Конспект
                  <select
                    value={config.noteId ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        noteId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Любой конспект</option>
                    {data!.notes.map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Набор
                  <select
                    value={config.setId ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        setId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Любой набор</option>
                    {data!.sets.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {config.itemIds && (
                <div className="notice">
                  Используется выборка из библиотеки: {config.itemIds.length}{" "}
                  материалов.{" "}
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, itemIds: undefined })}
                  >
                    Снять ограничение
                  </button>
                </div>
              )}
              <div className="form-section">
                <h3>Направления вопросов</h3>
                <p className="muted small">
                  Без отметок используются все доступные направления.
                </p>
                <div className="check-list">
                  {directions.map((d) => (
                    <label key={d}>
                      <input
                        type="checkbox"
                        checked={config.directions.includes(d)}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            directions: e.target.checked
                              ? [...config.directions, d]
                              : config.directions.filter((v) => v !== d),
                          })
                        }
                      />
                      {directionNames[d] ?? "Пользовательский вопрос"}
                    </label>
                  ))}
                </div>
              </div>
              <label className="inline-label">
                <input
                  type="checkbox"
                  checked={config.choice}
                  onChange={(e) =>
                    setConfig({ ...config, choice: e.target.checked })
                  }
                />
                Выбор из четырёх вариантов вместо открытого ввода
              </label>
              <p className="muted small">
                Для вариантов нужны разные ответы того же направления из вашей
                библиотеки.
              </p>
              <div className="form-actions">
                <button className="button primary">
                  <Play size={17} />
                  Начать тест
                </button>
              </div>
            </form>
          </Panel>
          <div>
            <Panel title="Как проходит проверка">
              <ol className="steps">
                <li>
                  <strong>Введите ответ</strong>
                  <span>Первый Enter откроет подтверждение.</span>
                </li>
                <li>
                  <strong>Проверьте себя</strong>
                  <span>Исправьте текст или оставьте как есть.</span>
                </li>
                <li>
                  <strong>Подтвердите</strong>
                  <span>Второй Enter окончательно сохранит ответ.</span>
                </li>
                <li>
                  <strong>Разберите результат</strong>
                  <span>Эталоны и оценки откроются в конце.</span>
                </li>
              </ol>
            </Panel>
            <div className="notice">
              Без таймера. Сохранённые ответы не теряются при обычном
              перезапуске.
            </div>
          </div>
        </div>
      )}
      {!!data!.sessions.length && (
        <Panel title="Последние тесты" className="spaced">
          <div className="session-list">
            {data!.sessions.map((s) => (
              <button key={s.id} onClick={() => void load(s.id)}>
                <span>
                  <strong>{modes[s.mode] ?? "Тест"}</strong>
                  <small>
                    {formatTime(s.createdAt)} · {s.answered} / {s.total} ответов
                  </small>
                </span>
                <span className="text-accent">
                  {s.status === "active"
                    ? "Продолжить"
                    : s.status === "review"
                      ? "Завершить разбор"
                      : "Результаты"}{" "}
                  <ArrowRight size={16} />
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
function Runner({
  session,
  update,
  leave,
}: {
  session: Session;
  update: (s: Session) => void;
  leave: () => void;
}) {
  const { task, busy } = useApp(),
    question = session.questions.find((q) => !q.answered)!;
  const [answer, setAnswer] = useState(""),
    [confirming, setConfirming] = useState(false),
    input = useRef<HTMLTextAreaElement>(null),
    command = useRef(crypto.randomUUID());
  useEffect(() => {
    setAnswer("");
    setConfirming(false);
    command.current = crypto.randomUUID();
    input.current?.focus();
  }, [question.id]);
  async function send() {
    if (!answer.trim() || busy) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const result = await task(() =>
      api.request<Session>("quiz.submit", {
        questionId: question.id,
        answer,
        commandId: command.current,
      }),
    );
    if (result.ok) update(result.value);
  }
  return (
    <>
      <PageHeading
        eyebrow="СЕССИЯ ТЕСТИРОВАНИЯ"
        title={modes[session.mode] ?? "Тест"}
        actions={
          <button className="button secondary" onClick={leave}>
            Вернуться к конструктору
          </button>
        }
      />
      <div className="session-progress">
        <span>
          Вопрос {session.answered + 1} из {session.total}
        </span>
        <span>{session.answered} ответов сохранено</span>
        <div className="progress-track">
          <i
            style={{ width: `${(session.answered / session.total) * 100}%` }}
          />
        </div>
      </div>
      <section className="question-card">
        <span className="eyebrow">
          {question.kind === "date"
            ? "ИСТОРИЧЕСКАЯ ДАТА"
            : question.kind === "map"
              ? "ВОПРОС ПО КАРТЕ"
              : question.kind === "image"
                ? "ИЗОБРАЖЕНИЕ"
                : "ОТКРЫТЫЙ ВОПРОС"}
        </span>
        <h2>{question.prompt}</h2>
        {!!question.mediaIds.length && (
          <div className="question-images">
            {question.mediaIds.map((id) => (
              <Asset key={id} id={id} alt="Изображение к вопросу" />
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {question.choices.length ? (
            <fieldset className="choices">
              <legend>Ваш ответ</legend>
              {question.choices.map((choice, i) => (
                <label className={answer === choice ? "selected" : ""} key={i}>
                  <input
                    type="radio"
                    name="choice"
                    value={choice}
                    checked={answer === choice}
                    onChange={() => setAnswer(choice)}
                  />
                  <span>{i + 1}</span>
                  {choice}
                </label>
              ))}
            </fieldset>
          ) : (
            <label>
              Ваш ответ
              <textarea
                ref={input}
                autoFocus
                aria-label="Ваш ответ"
                className="answer-input"
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Введите ответ…"
              />
            </label>
          )}
          {confirming && (
            <div className="confirmation" role="status">
              <CircleHelp size={21} />
              <div>
                <strong>Вы уверены?</strong>
                <p>
                  Можно исправить ответ. Следующее нажатие Enter сохранит его
                  окончательно.
                </p>
              </div>
            </div>
          )}
          <div className="answer-actions">
            <small>
              <CornerDownLeft size={15} />
              {confirming
                ? "Второй Enter — окончательный ответ"
                : "Enter — проверить перед отправкой"}
              {!question.choices.length && " · Shift + Enter — новая строка"}
            </small>
            <button
              className="button primary"
              disabled={!answer.trim() || busy}
            >
              {confirming ? "Подтвердить ответ" : "Проверить перед отправкой"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>
      <p className="session-footnote">
        Правильность и эталоны будут доступны после последнего вопроса.
      </p>
    </>
  );
}
function Results({
  session,
  update,
  leave,
}: {
  session: Session;
  update: (s: Session) => void;
  leave: () => void;
}) {
  const { task } = useApp(),
    [onlyProblems, setOnlyProblems] = useState(false),
    reviews = session.reviews ?? [];
  const count = (outcome: string) =>
    reviews.filter((r) => r.grade.outcome === outcome).length;
  async function evaluate(review: Review, units: 0 | 1 | 2) {
    const r = await task(
      () =>
        api.request<Session>("quiz.review", {
          attemptId: review.attemptId,
          units,
        }),
      "Оценка сохранена",
    );
    if (r.ok) update(r.value);
  }
  return (
    <>
      <PageHeading
        eyebrow="ИТОГИ СЕССИИ"
        title={
          count("needs_review")
            ? "Тест завершён. Остался разбор"
            : "Результаты теста"
        }
        description="Ответы и оценки сохранены в локальной базе."
        actions={
          <button className="button secondary" onClick={leave}>
            <RotateCcw size={16} />К конструктору
          </button>
        }
      />
      <div className="metrics four">
        <Metric label="Правильно" value={count("correct")} />
        <Metric label="Частично" value={count("partial")} />
        <Metric label="Неправильно" value={count("incorrect")} />
        <Metric label="Ожидают оценки" value={count("needs_review")} />
      </div>
      <div className="panel-heading spaced">
        <h2>Разбор ответов</h2>
        <label className="inline-label">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
          />
          Только ошибки, частичные и неоднозначные
        </label>
      </div>
      <div className="review-list">
        {reviews
          .filter((r) => !onlyProblems || r.grade.outcome !== "correct")
          .map((r, i) => (
            <article
              className={"review-card " + r.grade.outcome}
              key={r.attemptId}
            >
              <div className="review-status">
                {r.grade.outcome === "correct" ? (
                  <Check size={20} />
                ) : r.grade.outcome === "incorrect" ? (
                  <X size={20} />
                ) : (
                  <CircleHelp size={20} />
                )}
                <span>Вопрос {r.question.ordinal + 1}</span>
                <strong>
                  {r.grade.outcome === "correct"
                    ? "Правильно"
                    : r.grade.outcome === "partial"
                      ? "Частичный ответ"
                      : r.grade.outcome === "incorrect"
                        ? "Неправильно"
                        : "Нужна ваша оценка"}
                </strong>
              </div>
              <h3>{r.question.prompt}</h3>
              {r.question.mediaIds.length > 0 && (
                <div className="review-images">
                  {r.question.mediaIds.map((id) => (
                    <Asset key={id} id={id} alt="Изображение к вопросу" />
                  ))}
                </div>
              )}
              <div className="review-answers">
                <div>
                  <span>Ваш окончательный ответ</span>
                  <p>{r.answer}</p>
                </div>
                <div>
                  <span>Эталон</span>
                  <p>{r.expected}</p>
                  {r.alternatives.length > 0 && (
                    <small>Допустимо также: {r.alternatives.join("; ")}</small>
                  )}
                </div>
              </div>
              <p className="muted">{r.grade.reason}</p>
              {(r as Review & { criteria?: string[] }).criteria?.length ? (
                <ul>
                  {(r as Review & { criteria: string[] }).criteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
              {r.grade.outcome === "needs_review" ? (
                <div className="self-grade">
                  <span>Сопоставьте ответ с эталоном и критериями:</span>
                  <button
                    className="button secondary"
                    onClick={() => void evaluate(r, 0)}
                  >
                    Неправильно · 0
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => void evaluate(r, 1)}
                  >
                    Частично · 0,5
                  </button>
                  <button
                    className="button primary"
                    onClick={() => void evaluate(r, 2)}
                  >
                    Правильно · 1
                  </button>
                </div>
              ) : (
                r.before !== null && (
                  <div className="knowledge-change">
                    Знание объекта: {formatPercent(r.before)}%{" "}
                    <ArrowRight size={14} /> {formatPercent(r.after ?? 0)}%
                  </div>
                )
              )}
            </article>
          ))}
      </div>
      {onlyProblems && !reviews.some((r) => r.grade.outcome !== "correct") && (
        <Empty title="Все ответы правильные">
          В этой сессии нет ответов для дополнительного разбора.
        </Empty>
      )}
    </>
  );
}
