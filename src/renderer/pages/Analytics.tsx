import { useState } from "react";
import {
  ArrowRight,
  Plus,
  Play,
  TrendingUp,
  BookOpen,
  Target,
  Crosshair,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useApp } from "../state";
import {
  Asset,
  Empty,
  PageHeading,
  Panel,
  Metric,
  Progress,
  LinkButton,
  formatPercent,
  formatTime,
} from "../components";
import { ranks } from "../../domain/progress";
import type { Page } from "../App";

export function Dashboard({
  navigate,
  add,
  test,
}: {
  navigate: (p: Page) => void;
  add: () => void;
  test: () => void;
}) {
  const { data } = useApp(),
    s = data!.stats,
    rank = [...ranks].reverse().find((r) => r.min <= (s.percent ?? 0))!,
    portrait = (
      data!.settings.rankMedia as Record<string, string> | undefined
    )?.[rank.key];
  return (
    <>
      <PageHeading
        eyebrow="ПЕРСОНАЛЬНАЯ СИСТЕМА ИЗУЧЕНИЯ ИСТОРИИ"
        title="Ваше знание. В деталях."
        description="Собирайте факты, находите связи и проверяйте то, что действительно помните."
        actions={
          <button className="button primary" onClick={test}>
            <Play size={17} />
            Начать тест
          </button>
        }
      />
      {data!.nodes.some((n) => n.id === data!.settings.lastTopic) && (
        <div className="last-topic">
          <button className="text-button" onClick={() => navigate("library")}>
            Продолжить:{" "}
            {data!.nodes.find((n) => n.id === data!.settings.lastTopic)?.title}
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="dashboard-hero">
        <section className="knowledge-hero">
          <span className="eyebrow">ОБЩЕЕ ЗНАНИЕ БАЗЫ</span>
          <div className="hero-number">
            {s.percent === null ? "—" : formatPercent(s.percent)}
            <span>{s.percent === null ? "" : "%"}</span>
          </div>
          <div className="progress-track hero-track">
            <i style={{ width: `${s.percent ?? 0}%` }} />
          </div>
          <p>
            {s.total
              ? `Проверено ${s.studied} из ${s.total} материалов. Непроверенные направления ещё не дают баллов.`
              : "Библиотека пока пуста. Добавьте материал — здесь появится ваш настоящий прогресс."}
          </p>
          <div className="hero-bottom">
            <span>
              <Crosshair size={16} />
              Последние 20 проверок каждого направления
            </span>
            <button
              className="text-button"
              onClick={() => navigate("statistics")}
            >
              Как складывается результат
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
        <section className={"rank-card " + (portrait ? "with-photo" : "")}>
          {portrait && s.studied > 0 && (
            <Asset id={portrait} alt={rank.name} className="rank-photo" />
          )}
          <div className="rank-copy">
            <span className="eyebrow">МОЙ ТЕКУЩИЙ УРОВЕНЬ</span>
            <h2>{s.studied ? rank.name : "Первый шаг — проверка"}</h2>
            <p>
              {s.studied
                ? "Игровой ранг знания истории"
                : "Пройдите первый тест по своему материалу."}
            </p>
            {s.studied && !portrait && (
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                Назначить локальный портрет
                <ArrowRight size={15} />
              </button>
            )}
            {s.studied > 0 && (
              <small>
                {rank.min}–{ranks[ranks.indexOf(rank) + 1]?.min ?? 100}% общего
                знания
              </small>
            )}
          </div>
        </section>
      </div>
      <div className="metrics four">
        <Metric
          label="Материалов в библиотеке"
          value={s.total}
          detail="Ваша собственная база"
        />
        <Metric
          label="Проверено материалов"
          value={s.studied}
          detail="Есть оценённые ответы"
        />
        <Metric
          label="Требуют внимания"
          value={s.weak}
          detail="Проверенные, знание ниже 50%"
        />
        <Metric
          label="Элитный уровень"
          value={s.elite}
          detail="Знание от 97%"
        />
      </div>
      {!s.total && (
        <div className="welcome-card">
          <BookOpen size={30} />
          <div>
            <h2>Библиотека начинается с вашего материала</h2>
            <p>
              Создайте запись с датой, термином или вопросом. Для большого
              списка используйте массовый ввод с проверкой перед сохранением.
            </p>
          </div>
          <button className="button secondary" onClick={add}>
            <Plus size={16} />
            Добавить материал
          </button>
        </div>
      )}
      <Panel title="Изменение знания" className="spaced trend-panel">
        <KnowledgeChart />
      </Panel>
      <div className="dashboard-grid">
        <Panel
          title="Разделы и направления"
          action={
            <LinkButton onClick={() => navigate("library")}>
              Библиотека
            </LinkButton>
          }
        >
          {s.topics
            .filter(
              (t) => data!.nodes.find((n) => n.id === t.id)?.kind === "section",
            )
            .map((t) => (
              <div className="topic-progress" key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <small>{t.count} материалов</small>
                </div>
                <Progress value={t.percent} attempts={t.count} />
              </div>
            ))}
        </Panel>
        <Panel
          title="Активность"
          action={
            <LinkButton onClick={() => navigate("statistics")}>
              Подробнее
            </LinkButton>
          }
        >
          <ActivityChart />
        </Panel>
        <Panel
          title="Слабые темы"
          action={
            <LinkButton onClick={() => navigate("errors")}>
              Разобрать ошибки
            </LinkButton>
          }
        >
          {s.topics
            .filter(
              (t) =>
                t.count &&
                t.percent < 50 &&
                data!.nodes.find((n) => n.id === t.id)?.kind === "topic",
            )
            .slice(0, 5)
            .map((t) => (
              <div className="topic-progress" key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <small>{t.count} материалов</small>
                </div>
                <Progress value={t.percent} />
              </div>
            ))}
          {!s.topics.some((t) => t.count && t.percent < 50) && (
            <p className="muted panel-empty">
              Недостаточно данных для слабых тем.
            </p>
          )}
        </Panel>
        <Panel title="Последние ответы">
          {s.recent.length ? (
            <div className="recent-list">
              {s.recent.slice(0, 5).map((r) => (
                <div key={r.id}>
                  <i className={"status-dot " + r.outcome} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>{formatTime(r.createdAt)}</small>
                  </span>
                  <span className="muted">
                    {r.outcome === "correct"
                      ? "Верно"
                      : r.outcome === "partial"
                        ? "Частично"
                        : r.outcome === "incorrect"
                          ? "Ошибка"
                          : "Разбор"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted panel-empty">
              Завершённые проверки появятся после первого теста.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
function ActivityChart({ days = 0 }: { days?: number }) {
  const { data } = useApp();
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const rows = data!.stats.activity.filter(
    (d) => new Date(d.date).getTime() >= cutoff,
  );
  if (!rows.length)
    return (
      <div className="chart-empty">
        Пока нет оценённых ответов за этот период.
      </div>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows}>
          <CartesianGrid stroke="#ffffff0b" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#87928f", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#87928f", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#202728",
              border: "1px solid #37423e",
              borderRadius: 10,
            }}
          />
          <Bar
            isAnimationActive={false}
            dataKey="correct"
            name="Правильно"
            stackId="a"
            fill="#91bda7"
          />
          <Bar
            isAnimationActive={false}
            dataKey="partial"
            name="Частично"
            stackId="a"
            fill="#c9b680"
          />
          <Bar
            isAnimationActive={false}
            dataKey="incorrect"
            name="Неправильно"
            stackId="a"
            fill="#ad7474"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function KnowledgeChart({ days = 0 }: { days?: number }) {
  const { data } = useApp();
  const rows = data!.stats.knowledgeTrend.filter(
    (d) =>
      d.percent !== null &&
      (!days || new Date(d.time).getTime() >= Date.now() - days * 86400000),
  );
  if (!rows.length)
    return (
      <div className="chart-empty">
        История знания появится после добавления материала и проверок.
      </div>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={210}>
        <AreaChart data={rows}>
          <CartesianGrid stroke="#ffffff0b" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(time) => new Date(time).toLocaleDateString("ru-RU")}
            tick={{ fill: "#87928f", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            unit="%"
            tick={{ fill: "#87928f", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(label) => formatTime(String(label))}
            contentStyle={{
              background: "#202728",
              border: "1px solid #37423e",
              borderRadius: 10,
            }}
          />
          <Area
            isAnimationActive={false}
            type="stepAfter"
            dataKey="percent"
            name="Знание, %"
            stroke="#a1c4aa"
            fill="#a1c4aa12"
            strokeWidth={2}
            dot={{ r: 2, fill: "#a1c4aa" }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="muted small">
        Сохранённые значения. Добавление неизученного материала может снижать
        общий процент без новой ошибки.
      </p>
    </div>
  );
}
export function Statistics() {
  const { data } = useApp(),
    s = data!.stats,
    [days, setDays] = useState(0);
  const activity = s.activity.filter(
      (d) =>
        !days || new Date(d.date).getTime() >= Date.now() - days * 86400000,
    ),
    correct = activity.reduce((n, d) => n + d.correct, 0),
    partial = activity.reduce((n, d) => n + d.partial, 0),
    incorrect = activity.reduce((n, d) => n + d.incorrect, 0),
    count = correct + partial + incorrect;
  const pie = [
    { name: "Правильно", value: correct },
    { name: "Частично", value: partial },
    { name: "Неправильно", value: incorrect },
  ];
  return (
    <>
      <PageHeading
        eyebrow="ФАКТЫ О ВАШЕМ ПРОГРЕССЕ"
        title="Статистика"
        description="Знание и доля правильных ответов — разные показатели."
        actions={
          <select
            aria-label="Период статистики"
            value={days}
            onChange={(e) => setDays(+e.target.value)}
          >
            <option value={0}>Всё время</option>
            <option value={7}>Последние 7 дней</option>
            <option value={30}>Последние 30 дней</option>
            <option value={90}>Последние 90 дней</option>
          </select>
        }
      />
      <div className="metrics four">
        <Metric
          label="Знание сейчас"
          value={s.percent === null ? "—" : `${formatPercent(s.percent)}%`}
        />
        <Metric
          label="Полностью правильных"
          value={count ? `${formatPercent((correct / count) * 100)}%` : "—"}
          detail="За выбранный период"
        />
        <Metric
          label="Оценённых ответов"
          value={count}
          detail="За выбранный период"
        />
        <Metric
          label="Ожидают самопроверки"
          value={s.pending}
          detail="За всё время"
        />
      </div>
      <Panel title="История знания" className="trend-panel">
        <KnowledgeChart days={days} />
      </Panel>
      <div className="dashboard-grid">
        <Panel title="История активности">
          <ActivityChart days={days} />
        </Panel>
        <Panel title="Результаты ответов">
          {count ? (
            <div className="pie-layout">
              <ResponsiveContainer width="55%" height={210}>
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={pie}
                    dataKey="value"
                    innerRadius={62}
                    outerRadius={88}
                    stroke="none"
                  >
                    {pie.map((_, i) => (
                      <Cell
                        key={i}
                        fill={["#91bda7", "#c9b680", "#ad7474"][i]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#202728",
                      border: "1px solid #37423e",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {pie.map((p, i) => (
                  <div key={p.name}>
                    <i
                      style={{
                        background: ["#91bda7", "#c9b680", "#ad7474"][i],
                      }}
                    />
                    {p.name}
                    <strong>{p.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chart-empty">За выбранный период нет оценок.</div>
          )}
        </Panel>
        <Panel title="Знание по темам">
          {s.topics
            .filter(
              (t) =>
                t.count &&
                data!.nodes.find((n) => n.id === t.id)?.kind === "topic",
            )
            .map((t) => (
              <div className="topic-progress" key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <small>{t.count} объектов</small>
                </div>
                <Progress value={t.percent} />
              </div>
            ))}
          {!s.total && (
            <p className="panel-empty muted">
              Добавьте материал для сравнения тем.
            </p>
          )}
        </Panel>
        <Panel title="Прозрачная формула">
          <div className="formula">
            <strong>Σ баллов последних 20 проверок / 20 × 100%</strong>
            <p>
              Правильно — 1; частично — 0,5; неправильно — 0. Незаполненные
              позиции не дают баллов, но не записываются как ошибки.
            </p>
            <p>
              У каждого направления отдельное окно. Объект — среднее его
              включённых направлений. Тема и база — среднее объектов, включая
              неизученные, без дублей из наборов.
            </p>
            <div className="formula-example">
              19 правильных + 1 частичный = <strong>97,5%</strong>
            </div>
          </div>
        </Panel>
      </div>
      <div className="metrics three spaced">
        <Metric label="Не изучено" value={s.total - s.studied} />
        <Metric label="Отлично · 90–<97%" value={s.excellent} />
        <Metric label="Элитно · от 97%" value={s.elite} />
      </div>
    </>
  );
}
