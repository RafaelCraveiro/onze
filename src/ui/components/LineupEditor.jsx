/* Editor de onze partilhado (Táticas + pré-jogo): mini-campo + escolha por slot. */

import { useState } from "react";
import { Btn, PosBadge } from "./bits.jsx";
import { FORMATIONS, STYLES, POS_LABEL, overallAt, overallBase } from "../../engine/constants.js";
import { isAvailable } from "../../engine/team.js";
import { overallColor } from "../helpers.js";

export default function LineupEditor({ game, actions, compact = false }) {
  const [selSlot, setSelSlot] = useState(null);
  const { formation, starters } = game.lineup;
  const slots = FORMATIONS[formation];
  const byId = new Map(game.players.map((p) => [p.id, p]));

  const pickFor = (slotIdx, playerId) => {
    actions.swapStarter(slotIdx, playerId);
    setSelSlot(null);
  };

  const avg = Math.round(
    starters.reduce((s, id, i) => {
      const p = byId.get(id);
      return s + (p ? overallAt(p, slots[i]?.[0] ?? p.pos) : 0);
    }, 0) / Math.max(1, starters.length)
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {Object.keys(FORMATIONS).map((f) => (
          <button
            key={f}
            onClick={() => actions.setFormation(f)}
            className={`rounded-md px-2.5 py-1 text-xs font-bold ${formation === f ? "btn-green" : "bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--s3)]"}`}
          >
            {f}
          </button>
        ))}
        <span className="mx-1 text-[var(--t3)]">|</span>
        {Object.entries(STYLES).map(([k, s]) => (
          <button
            key={k}
            onClick={() => actions.setStyle(k)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${game.tacticStyle === k ? "bg-[var(--info)] text-[#07182b] font-bold" : "bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--s3)]"}`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--t3)]">
          Força do onze: <b style={{ color: overallColor(avg) }}>{avg}</b>
        </span>
        <Btn kind="dark" className="!py-1 text-xs" onClick={actions.autoXI}>Auto-onze</Btn>
      </div>
      {STYLES[game.tacticStyle] && <p className="mb-2 text-xs text-[var(--t2)]"><b>{STYLES[game.tacticStyle].label}:</b> {STYLES[game.tacticStyle].desc}</p>}

      {/* mini-campo vertical */}
      <div
        className={`relative mx-auto w-full rounded-xl border border-[var(--line)] bg-gradient-to-b from-[#143f2d] to-[#0e3023] ${compact ? "max-w-xs" : "max-w-sm"}`}
        style={{ aspectRatio: "3/4" }}
      >
        <div className="absolute inset-x-8 top-0 h-14 rounded-b-lg border border-t-0 border-white/40" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
        <div className="absolute inset-x-0 top-1/2 border-t border-white/40" />
        {slots.map(([pos, adv, wide], i) => {
          const p = byId.get(starters[i]);
          const missing = !p || !isAvailable(p);
          return (
            <button
              key={i}
              onClick={() => setSelSlot(selSlot === i ? null : i)}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${selSlot === i ? "z-10 scale-110" : ""}`}
              style={{ left: `${wide * 100}%`, top: `${92 - adv * 118}%` }}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[var(--surface)] text-xs font-black ${missing ? "border-[var(--danger)]" : selSlot === i ? "border-[var(--gold)]" : "border-[var(--t2)]/40"}`}
                style={{ color: p ? overallColor(overallAt(p, pos)) : "#ff6b6f" }}
              >
                {p ? overallAt(p, pos) : "—"}
              </span>
              <span className="mt-0.5 max-w-[74px] truncate rounded bg-black/45 px-1 text-[9px] font-semibold text-white">
                {POS_LABEL[pos]} · {p ? p.name.split(" ").pop() : "vazio"}
              </span>
            </button>
          );
        })}
      </div>

      {selSlot !== null && (
        <div className="onze-pop box-cream mt-2 rounded-lg p-2">
          <p className="mb-1 text-xs font-bold text-[var(--gold)]">
            Escolher jogador para {POS_LABEL[slots[selSlot][0]]}:
          </p>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {[...game.players]
              .filter((p) => p.id !== starters[selSlot])
              .sort((a, b) => overallAt(b, slots[selSlot][0]) - overallAt(a, slots[selSlot][0]))
              .map((p) => {
                const unavailable = !isAvailable(p);
                const inXI = starters.includes(p.id);
                return (
                  <button
                    key={p.id}
                    disabled={unavailable}
                    onClick={() => pickFor(selSlot, p.id)}
                    className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-left text-sm hover:bg-[var(--s2)] disabled:opacity-40"
                  >
                    <span>{p.flag}</span>
                    <PosBadge pos={p.pos} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {inXI && <span className="text-[10px] text-[var(--info)]">no onze (troca)</span>}
                    {unavailable && <span className="text-[10px] text-[var(--danger)]">{(p.injuryMin ?? 0) > 0 ? "lesionado" : p.eliteUntil ? "em treino" : "castigado"}</span>}
                    <b style={{ color: overallColor(overallAt(p, slots[selSlot][0])) }}>{overallAt(p, slots[selSlot][0])}</b>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {game.players
            .filter((p) => !starters.includes(p.id))
            .sort((a, b) => overallBase(b) - overallBase(a))
            .slice(0, 10)
            .map((p) => (
              <span key={p.id} className={`rounded-md border border-[var(--line)] bg-[var(--s2)] px-2 py-1 text-xs ${!isAvailable(p) ? "opacity-40" : ""}`}>
                {POS_LABEL[p.pos]} · {p.name.split(" ").pop()} <b style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
