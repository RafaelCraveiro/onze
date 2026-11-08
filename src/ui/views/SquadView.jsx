/* Plantel em cartões, agrupado por setor. Tocar num jogador abre a ficha dele. */

import { useState } from "react";
import { Section, PosBadge, Talent, Bar } from "../components/bits.jsx";
import { overallBase, POSITIONS, LINE_LABEL, lineOf, TRAITS, wagePerDay } from "../../engine/constants.js";
import { fmtDur } from "../../engine/progress.js";
import { fmtMoney, overallColor } from "../helpers.js";

export const PlayerCard = ({ p, onClick, showWage = false }) => {
  const ovr = overallBase(p);
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-xl bg-[var(--s2)] p-2.5 text-left transition hover:bg-[var(--s3)]">
      <span className="font-display w-9 shrink-0 text-center text-3xl font-bold leading-none" style={{ color: overallColor(ovr) }}>{ovr}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <PosBadge pos={p.pos} />
          <span className="truncate text-sm font-semibold">{p.name}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--t3)]">
          <span>{p.age} anos</span>
          <Talent t={p.pot} />
          {(p.traits ?? []).map((t) => <span key={t} title={TRAITS[t]?.desc}>{TRAITS[t]?.label}</span>)}
          {showWage && <span>{fmtMoney(wagePerDay(p))}/dia</span>}
          {(p.injuryMin ?? 0) > 0 && <span className="font-semibold text-[var(--danger)]">lesionado {fmtDur(p.injuryMin)}</span>}
          {p.suspension > 0 && <span className="font-semibold text-[var(--danger)]">castigo {p.suspension}j</span>}
          {p.selling && <span className="font-semibold text-[var(--gold)]">à venda</span>}
          {p.contract <= 1 && <span className="font-semibold text-[var(--gold)]">contrato a acabar</span>}
        </p>
      </div>
      {p.fitness != null && <div className="w-11 shrink-0"><Bar value={p.fitness} /><p className="tnum mt-0.5 text-center text-[10px] text-[var(--t3)]">{Math.round(p.fitness)}%</p></div>}
    </button>
  );
};

const ORDERS = { pos: "Por setor", ovr: "Por qualidade", pot: "Por potencial", idade: "Mais novos" };

export default function SquadView({ game, onShowPlayer }) {
  const [sort, setSort] = useState("pos");
  const by = {
    ovr: (a, b) => overallBase(b) - overallBase(a),
    pot: (a, b) => b.pot - a.pot,
    idade: (a, b) => a.age - b.age,
    pos: (a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || overallBase(b) - overallBase(a),
  }[sort];
  const players = [...game.players].sort(by);
  const groups = sort === "pos"
    ? ["GR", "DF", "MD", "AV"].map((l) => [LINE_LABEL[l], players.filter((p) => lineOf(p.pos) === l)])
    : [[null, players]];
  const wages = game.players.reduce((s, p) => s + wagePerDay(p), 0);
  const avg = Math.round(players.reduce((s, p) => s + overallBase(p), 0) / Math.max(1, players.length));

  return (
    <Section
      title={`Plantel (${game.players.length})`}
      right={
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg bg-[var(--s2)] px-2 py-1.5 text-xs text-[var(--t1)]">
          {Object.entries(ORDERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      }
    >
      <p className="tnum mb-3 text-xs text-[var(--t3)]">Média <b className="text-[var(--t1)]">{avg}</b> · salários <b className="text-[var(--t1)]">{fmtMoney(wages)}/dia</b></p>
      <div className="flex flex-col gap-4">
        {groups.filter(([, l]) => l.length).map(([title, list]) => (
          <div key={title ?? "todos"}>
            {title && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--t3)]">{title}</p>}
            <div className="grid gap-1.5 md:grid-cols-2">
              {list.map((p) => <PlayerCard key={p.id} p={p} onClick={() => onShowPlayer(p.id)} showWage />)}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
