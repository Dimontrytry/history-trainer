import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ImageOff, ArrowUpRight } from "lucide-react";
import { api } from "./state";
import { level } from "../domain/progress";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">⌁</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Asset({
  id,
  alt,
  className = "",
}: {
  id: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  return failed ? (
    <div className={"asset-error " + className}>
      <ImageOff size={22} />
      <span>Файл недоступен. Проверьте медиатеку.</span>
    </div>
  ) : (
    <img
      className={className}
      src={api.assetUrl(id)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function Progress({
  value,
  attempts = 1,
}: {
  value: number;
  attempts?: number;
}) {
  return (
    <div className="progress-cell">
      <div className="progress-track">
        <i style={{ width: `${value}%` }} />
      </div>
      <span>{attempts ? `${formatPercent(value)}%` : "Не изучено"}</span>
    </div>
  );
}
export function Level({
  value,
  attempts,
}: {
  value: number;
  attempts: number;
}) {
  const label = level(value, attempts);
  return (
    <span
      className={
        "badge level-" +
        (label === "Элитно"
          ? "elite"
          : label === "Не изучено"
            ? "new"
            : value < 50
              ? "weak"
              : "known")
      }
    >
      {label}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export const formatPercent = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
export const formatTime = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export const directionNames: Record<string, string> = {
  event_to_date: "Событие → дата",
  date_to_event: "Дата → событие",
  ruler_to_reign: "Правитель → годы",
  reign_to_ruler: "Годы → правитель",
  term_to_definition: "Термин → определение",
  definition_to_term: "Определение → термин",
  image_to_object: "Изображение → объект",
  image_to_author: "Изображение → автор",
  map_to_object: "Карта",
  open_question: "Открытый вопрос",
};
