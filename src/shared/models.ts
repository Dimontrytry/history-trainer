import { z } from "zod";

export const itemTypes = {
  event: "Событие",
  ruler: "Правитель",
  person: "Личность",
  term: "Термин",
  war: "Война",
  reform: "Реформа",
  culture: "Культура",
  work: "Произведение",
  architecture: "Архитектура",
  image: "Изображение",
  map: "Карта",
  source: "Источник",
  fact: "Факт",
} as const;
export type ItemType = keyof typeof itemTypes;
export type HistoricalDate = {
  kind: "year" | "day" | "range" | "century" | "century_part";
  calendar: "source_unspecified" | "julian" | "gregorian";
  approximate: boolean;
  label: string;
  start: { year: number; month?: number; day?: number };
  end?: { year: number; month?: number; day?: number };
  century?: number;
  part?: { count: 2 | 4; index: number };
  lower: number;
  upper: number;
};
// Negative historical years denote BCE; zero is forbidden. They are not JS dates.
export const templateSchema = z.object({
  id: z.string().optional(),
  direction: z.string().trim().min(1).max(100),
  kind: z.enum(["date", "short", "long", "choice", "image", "map"]),
  prompt: z.string().trim().min(1).max(20000),
  expected: z.string().trim().min(1).max(20000),
  alternatives: z
    .array(z.string().trim().min(1).max(20000))
    .max(100)
    .default([]),
  checking: z.enum(["automatic", "manual", "rubric"]).default("automatic"),
  criteria: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  mediaIds: z.array(z.string()).max(50).default([]),
  enabled: z.boolean().default(true),
});
export type TemplateInput = z.infer<typeof templateSchema>;
export type Template = TemplateInput & { id: string; itemId: string };
export const itemInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(Object.keys(itemTypes) as [ItemType, ...ItemType[]]),
  title: z.string().trim().min(1, "Укажите название").max(1000),
  topicId: z.string().min(1),
  dateText: z.string().max(500).default(""),
  calendar: z
    .enum(["source_unspecified", "julian", "gregorian"])
    .default("source_unspecified"),
  description: z.string().max(50000).default(""),
  answer: z.string().max(20000).default(""),
  author: z.string().max(1000).default(""),
  source: z.string().max(3000).default(""),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  mediaIds: z.array(z.string()).max(50).default([]),
  relatedIds: z.array(z.string()).max(500).default([]),
  templates: z.array(templateSchema).max(100).default([]),
});
export type ItemInput = z.infer<typeof itemInputSchema>;
export type Item = Omit<ItemInput, "id" | "templates"> & {
  id: string;
  date: HistoricalDate | null;
  templates: Template[];
  updatedAt: string;
  progress: number;
  gradedCount: number;
  errors: number;
  lastChecked: string | null;
};
export type LibraryNode = {
  id: string;
  parentId: string | null;
  kind: "section" | "period" | "topic";
  title: string;
};
export type MediaAsset = {
  id: string;
  hash: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  source: string;
};
export type Grade = {
  outcome: "correct" | "partial" | "incorrect" | "needs_review";
  units: 0 | 1 | 2 | null;
  reason: string;
};
export type QuizConfig = {
  topicId?: string;
  noteId?: string;
  setId?: string;
  itemIds?: string[];
  selection: "all" | "errors" | "weak";
  directions: string[];
  count: number;
  mode: "all" | "random" | "quick" | "exam" | "mixed";
  choice: boolean;
};
export const quizConfigSchema = z.object({
  topicId: z.string().optional(),
  noteId: z.string().optional(),
  setId: z.string().optional(),
  itemIds: z.array(z.string()).optional(),
  selection: z.enum(["all", "errors", "weak"]),
  directions: z.array(z.string()),
  count: z.number().int().min(1).max(1000),
  mode: z.enum(["all", "random", "quick", "exam", "mixed"]),
  choice: z.boolean(),
});
export type PublicQuestion = {
  id: string;
  ordinal: number;
  kind: Template["kind"];
  prompt: string;
  mediaIds: string[];
  choices: string[];
  answered: boolean;
  finalAnswer?: string;
};
export type Review = {
  question: PublicQuestion;
  expected: string;
  alternatives: string[];
  criteria: string[];
  answer: string;
  grade: Grade;
  attemptId: string;
  before: number | null;
  after: number | null;
  itemTitle: string;
};
export type Session = {
  id: string;
  mode: string;
  status: "active" | "review" | "completed";
  createdAt: string;
  total: number;
  answered: number;
  questions: PublicQuestion[];
  reviews?: Review[];
};
export type Note = {
  id: string;
  topicId: string;
  title: string;
  document: Record<string, unknown>;
  itemIds: string[];
  updatedAt: string;
};
export type StudySet = { id: string; title: string; itemIds: string[] };
export type Stats = {
  total: number;
  studied: number;
  weak: number;
  elite: number;
  excellent: number;
  percent: number | null;
  correct: number;
  partial: number;
  incorrect: number;
  pending: number;
  activity: {
    date: string;
    correct: number;
    partial: number;
    incorrect: number;
  }[];
  knowledgeTrend: { time: string; percent: number | null; count: number }[];
  topics: { id: string; title: string; count: number; percent: number }[];
  recent: {
    id: string;
    title: string;
    answer: string;
    outcome: string;
    createdAt: string;
  }[];
};
export type Bootstrap = {
  nodes: LibraryNode[];
  items: Item[];
  media: MediaAsset[];
  sets: StudySet[];
  notes: Note[];
  sessions: Session[];
  stats: Stats;
  settings: Record<string, unknown>;
};
export type ImportRow = {
  index: number;
  text: string;
  title: string;
  dateText: string;
  error: string | null;
};
export type Diagnostics = {
  checked: number;
  problems: { id: string; name: string; problem: string }[];
};
export interface DesktopApi {
  request<T = unknown>(command: string, payload?: unknown): Promise<T>;
  importImages(): Promise<MediaAsset[]>;
  importDroppedImages(
    files: { name: string; base64: string }[],
  ): Promise<MediaAsset[]>;
  exportFile(format: "json" | "csv" | "backup"): Promise<string | null>;
  importFile(format: "json" | "csv" | "backup"): Promise<unknown>;
  assetUrl(id: string): string;
}
declare global {
  interface Window {
    historyTrainer: DesktopApi;
  }
}
