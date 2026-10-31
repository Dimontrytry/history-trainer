import type { Storage } from "../infrastructure/storage/database";
import type { Stats } from "../shared/models";
import { Library } from "./library";
import { mean } from "../domain/progress";

export function statistics(store: Storage, library: Library): Stats {
  const items = library.items(),
    nodes = library.nodes();
  const rows = store.rows<any>(
    `SELECT e.outcome,e.units,a.answer,a.created_at,a.id,q.snapshot FROM evaluations e JOIN attempts a ON a.id=e.attempt_id JOIN questions q ON q.id=a.question_id JOIN sessions s ON s.id=q.session_id WHERE s.status!='active' AND e.id=(SELECT MAX(x.id) FROM evaluations x WHERE x.attempt_id=a.id) ORDER BY a.created_at DESC`,
  );
  const days = new Map<
    string,
    { date: string; correct: number; partial: number; incorrect: number }
  >();
  for (const r of rows) {
    if (r.units === null) continue;
    const d = new Date(r.created_at),
      date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = days.get(date) ?? {
      date,
      correct: 0,
      partial: 0,
      incorrect: 0,
    };
    day[r.outcome as "correct" | "partial" | "incorrect"]++;
    days.set(date, day);
  }
  return {
    total: items.length,
    studied: items.filter((i) => i.gradedCount).length,
    weak: items.filter((i) => i.gradedCount && i.progress < 50).length,
    elite: items.filter((i) => i.progress >= 97).length,
    excellent: items.filter((i) => i.progress >= 90 && i.progress < 97).length,
    percent: mean(items.map((i) => i.progress)),
    correct: rows.filter((r) => r.units === 2).length,
    partial: rows.filter((r) => r.units === 1).length,
    incorrect: rows.filter((r) => r.units === 0).length,
    pending: rows.filter((r) => r.units === null).length,
    activity: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    knowledgeTrend: store.rows<any>(
      "SELECT created_at AS time,percent,item_count AS count FROM knowledge_snapshots ORDER BY id",
    ),
    topics: nodes
      .filter((n) => n.kind === "topic" || n.kind === "section")
      .map((n) => {
        const ids = new Set([n.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of nodes)
            if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
              ids.add(node.id);
              changed = true;
            }
        }
        const group = items.filter((i) => ids.has(i.topicId));
        return {
          id: n.id,
          title: n.title,
          count: group.length,
          percent: mean(group.map((i) => i.progress)) ?? 0,
        };
      }),
    recent: rows.slice(0, 12).map((r) => ({
      id: r.id,
      title: JSON.parse(r.snapshot).itemTitle,
      answer: r.answer,
      outcome: r.outcome,
      createdAt: r.created_at,
    })),
  };
}
