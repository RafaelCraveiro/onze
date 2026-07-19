/* Micro-componentes partilhados — tema claro estilo 11x11. */

import { POS_COLOR, lineOf } from "../../engine/constants.js";
import { talentColor } from "../helpers.js";

export const Pill = ({ children, color = "#4f9312", className = "" }) => (
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
      className="inline-flex w-8 justify-center rounded border px-1 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: c + "15", color: c, borderColor: c + "44" }}
    >
      {pos}
    </span>
  );
};

export const Talent = ({ t, showNum = false }) => (
  <span className="text-xs font-semibold tracking-tight" style={{ color: talentColor(t) }} title={`Talento ${t}/9`}>
    {"★".repeat(Math.min(t, 5))}
    {t > 5 && <span className="ml-0.5 align-middle text-[10px]">+{t - 5}</span>}
    {showNum && <span className="ml-1 opacity-80">({t})</span>}
  </span>
);

export const Bar = ({ value, max = 100, color = "#5da814", className = "" }) => (
  <div className={`h-1.5 w-full overflow-hidden rounded bg-[#e3e5d8] ${className}`}>
    <div className="h-full rounded" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
  </div>
);

export const Section = ({ title, right, children }) => (
  <section className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
    <div className="mb-2 flex items-center justify-between border-b border-[#e6e8da] pb-1.5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-[#4f7a12]">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

export const Btn = ({ children, onClick, disabled, kind = "primary", className = "", title }) => {
  const styles = {
    primary: "btn-green",
    dark: "bg-[#e8eadd] hover:bg-[#dde0cd] text-[#3a4030] border border-[#c9cdb6]",
    danger: "bg-[#c0392b] hover:bg-[#d64535] text-white",
    gold: "bg-gradient-to-b from-[#f5c33b] to-[#dfa112] hover:brightness-105 text-[#4a3305]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[kind]} ${className}`}
    >
      {children}
    </button>
  );
};
