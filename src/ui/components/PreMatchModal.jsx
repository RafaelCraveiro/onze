/* Pré-jogo: edita o onze ANTES de enviar a equipa, vê o adversário e confirma. */

import { useEffect, useState } from "react";
import Emblem from "./Emblem.jsx";
import LineupEditor from "./LineupEditor.jsx";
import { Btn, Pill } from "./bits.jsx";
import { YOU } from "../../engine/competitions.js";
import { userCupMatch, cupRoundDue, cupRoundName, fmtTime } from "../../engine/realtime.js";
import { CUP_REG_WINDOW_MS } from "../../engine/constants.js";

const countdown = (ms) => {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function PreMatchModal({ game, actions, pre, onClose, onPlay }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const cup = pre.kind === "taca" ? game.cups.find((c) => c.id === pre.cupId) : null;
  const m = cup ? userCupMatch(cup, now) : null;
  const opp = m ? cup.info?.[m.h === YOU ? m.a : m.h] : null;
  const deadline = cup ? cupRoundDue(cup) + (cup.regWindowMs ?? CUP_REG_WINDOW_MS) : null;
  const expired = pre.kind === "taca" && !m;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="onze-pop max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#c9cdb6] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-lg font-black text-[#4f7a12]">Enviar equipa</h2>
          <button onClick={onClose} className="rounded-md border border-[#c9cdb6] bg-[#f4f5ec] px-2 py-1 text-sm">✕</button>
        </div>

        {pre.kind === "taca" && cup && (
          <div className="box-cream mb-3 flex items-center justify-between rounded-md px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              {opp && <Emblem emblem={opp.emblem} size={34} />}
              <div className="min-w-0 text-sm">
                <p className="truncate font-bold">{opp ? `${m.h === YOU ? "vs" : "@"} ${opp.name}` : "—"}
                  {opp?.isUser && <span className="ml-1 rounded bg-[#2563eb1a] px-1 text-[9px] font-bold text-[#2563eb]">MANAGER REAL</span>}
                  {opp && <span className="ml-2 text-xs font-normal text-[#8a9077]">nível {opp.level}</span>}
                </p>
                <p className="truncate text-xs text-[#6b7261]">{cup.icon} {cup.name} · {cupRoundName(cup.roundIdx)}</p>
              </div>
            </div>
            {deadline && (
              <Pill color="#c0392b">⏱ até às {fmtTime(deadline)} ({countdown(deadline - now)})</Pill>
            )}
          </div>
        )}
        {pre.kind === "amigavel" && (
          <p className="box-cream mb-3 rounded-md px-3 py-2 text-sm text-[#6b6427]">
            Jogo amigável contra um manager do teu nível — escolhe o onze e joga.
          </p>
        )}

        {expired ? (
          <p className="rounded-md border border-[#e8b4ae] bg-[#fdeeec] px-3 py-2 text-sm font-semibold text-[#c0392b]">
            A janela de registo desta ronda fechou.
          </p>
        ) : (
          <>
            <LineupEditor game={game} actions={actions} compact />
            <div className="mt-3 flex justify-end gap-2">
              <Btn kind="dark" onClick={onClose}>Cancelar</Btn>
              <Btn onClick={onPlay}>Confirmar equipa e JOGAR ⚽</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
