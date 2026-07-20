/* Evolução — os jogadores GANHAM XP ao jogar (mais talento = mais XP por
   jogo); o treinador distribui esse XP manualmente pelos atributos que
   quiser. Quanto mais alto já está um atributo, mais caro fica o próximo
   ponto — teto plano de 25 por atributo, para já. */

import { useState } from "react";
import { Section, Btn, PosBadge, Bar, Talent, Pill } from "../components/bits.jsx";
import {
  SKILLS, SKILL_LABEL, SKILL_CAP, trainCost, overallBase, talentGrowth,
} from "../../engine/constants.js";
import { overallColor, fmtWhen } from "../helpers.js";

export default function TrainingView({ game, actions }) {
  const [selId, setSelId] = useState(null);
  const selected = game.players.find((p) => p.id === selId);
  const boostActive = (game.flags?.trainBoostUntil ?? 0) > Date.now();

  return (
    <div className="flex flex-col gap-3">
      <Section title="Como funciona">
        <p className="text-xs text-[#6b7261]">
          Não há treino automático: os jogadores ganham <b>XP</b> ao jogar (mais talento = mais XP por jogo;
          taças dão o dobro). Abre a ficha de um jogador e gasta o XP dele nos atributos que quiseres —
          quanto mais alto já está um atributo, mais caro fica o ponto seguinte. Teto atual: <b>{SKILL_CAP}</b> por atributo.
        </p>
        {boostActive && (
          <p className="box-cream mt-2 rounded-md px-3 py-1.5 text-xs font-semibold text-[#a07407]">
            🎯 Treino Intensivo ativo até {fmtWhen(game.flags.trainBoostUntil)} — XP de jogo a dobrar!
          </p>
        )}
      </Section>

      <Section title="Plantel" right={<span className="text-[11px] text-[#9aa08e]">toca num jogador para distribuir XP</span>}>
        <div className="flex flex-col gap-1.5">
          {[...game.players]
            .sort((a, b) => (b.trainingXp ?? 0) - (a.trainingXp ?? 0))
            .map((p) => {
              const speed = talentGrowth(p.talent) * (p.age <= 20 ? 1.35 : p.age <= 24 ? 1.05 : p.age <= 28 ? 0.75 : 0.35);
              return (
                <button
                  key={p.id}
                  onClick={() => setSelId(p.id)}
                  className="flex items-center gap-2 rounded-md border border-[#e6e8da] bg-[#fbfcf7] px-2 py-1.5 text-left hover:bg-[#f4f5ec]"
                >
                  <span>{p.flag}</span>
                  <PosBadge pos={p.pos} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.name} <span className="text-xs font-normal text-[#9aa08e]">{p.age} anos · Skl <b style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b></span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Talent t={p.talent} />
                      <span className="text-[10px] text-[#9aa08e]">
                        ganha XP {speed >= 1.4 ? "🔥 muito depressa" : speed >= 1 ? "depressa" : speed >= 0.6 ? "normal" : "devagar"}
                      </span>
                    </div>
                  </div>
                  <Pill color={(p.trainingXp ?? 0) > 0 ? "#3d8c0e" : "#9aa08e"}>{p.trainingXp ?? 0} XP</Pill>
                </button>
              );
            })}
        </div>
      </Section>

      {selected && <TrainModal p={selected} actions={actions} onClose={() => setSelId(null)} />}
    </div>
  );
}

const TrainModal = ({ p, actions, onClose }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="onze-pop max-h-[88vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#c9cdb6] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-lg font-black text-[#3d7a0e]">{p.flag} {p.name}</p>
          <p className="text-sm text-[#6b7261]"><PosBadge pos={p.pos} /> <span className="ml-1">{p.age} anos · Skl <b style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b></span></p>
          <p className="mt-1 text-sm"><Talent t={p.talent} showNum /></p>
        </div>
        <button onClick={onClose} className="rounded-md border border-[#c9cdb6] bg-[#f4f5ec] px-2 py-1 text-sm">✕</button>
      </div>

      <div className="box-cream mb-3 flex items-center justify-between rounded-md px-3 py-2">
        <span className="text-sm font-semibold text-[#a07407]">XP disponível</span>
        <span className="text-lg font-black text-[#a07407]">{p.trainingXp ?? 0}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {SKILLS.map((s) => {
          const cur = Math.floor(p.skills[s] ?? 0);
          const cap = cur >= SKILL_CAP;
          const cost = trainCost(cur);
          const canAfford = (p.trainingXp ?? 0) >= cost;
          return (
            <div key={s} className="flex items-center gap-2 rounded-md border border-[#e6e8da] bg-[#fbfcf7] px-2 py-1.5">
              <div className="w-28 shrink-0 text-xs text-[#6b7261]">{SKILL_LABEL[s]}</div>
              <Bar value={p.skills[s] ?? 0} max={SKILL_CAP} className="flex-1" color={cap ? "#b026c9" : "#5da814"} />
              <span className="w-12 text-right font-mono text-xs">{cur}/{SKILL_CAP}</span>
              <Btn
                kind="gold"
                className="!py-1 !px-2 text-xs"
                disabled={cap || !canAfford}
                title={cap ? "Já está no teto" : `Custa ${cost} XP`}
                onClick={() => actions.trainSkill(p.id, s)}
              >
                {cap ? "Máx" : `+1 (${cost})`}
              </Btn>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
