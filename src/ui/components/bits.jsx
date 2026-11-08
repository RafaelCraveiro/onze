/* Micro-componentes partilhados — usam os tokens de src/index.css. */

import { POS_COLOR, POS_LABEL, lineOf, potentialGrade } from "../../engine/constants.js";
import { talentColor } from "../helpers.js";

export const Pill = ({ children, color = "#5fe08c", className = "" }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
    style={{ backgroundColor: color + "22", color }}
  >
    {children}
  </span>
);

export const PosBadge = ({ pos }) => {
  const c = POS_COLOR[lineOf(pos)] ?? "#666";
  return (
    <span
      className="inline-flex w-8 justify-center rounded-md px-1 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: c + "1f", color: c }}
    >
      {POS_LABEL[pos] ?? pos}
    </span>
  );
};

export const Talent = ({ t }) => (
  <span className="font-bold" style={{ color: talentColor(t) }} title={`Potencial ${t}`}>Pot. {potentialGrade(t)}</span>
);

export const Bar = ({ value, max = 100, color = "#b6f23a", className = "" }) => (
  <div className={`h-1.5 w-full overflow-hidden rounded-full bg-[var(--s3)] ${className}`}>
    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
  </div>
);

export const Section = ({ title, right, children }) => (
  <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-[var(--t1)]">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

export const Btn = ({ children, onClick, disabled, kind = "primary", className = "", title }) => {
  const styles = {
    primary: "btn-green",
    dark: "bg-[var(--s3)] hover:bg-[#33404d] text-[var(--t1)]",
    danger: "bg-[var(--danger)] hover:brightness-110 text-[#1c0a0b] font-bold",
    gold: "bg-[var(--gold)] hover:brightness-110 text-[#241803] font-bold",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[kind]} ${className}`}
    >
      {children}
    </button>
  );
};
