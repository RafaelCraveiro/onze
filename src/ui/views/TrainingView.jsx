/* Evolução — os jogadores crescem com os JOGOS que fazem (talento × idade × competição).
   O foco escolhe QUE sub-habilidades recebem a experiência de jogo. */

import { Section, PosBadge, Bar, Talent } from "../components/bits.jsx";
import { talentCap, talentGrowth, SKILLS, SKILL_LABEL, overallBase, MATCH_XP_MULT } from "../../engine/constants.js";
import { overallColor, fmtWhen } from "../helpers.js";

const FOCI = [
  ["misto", "Misto", "Todas as sub-habilidades, devagar"],
  ["ataque", "Ataque", "Potência e precisão de remate"],
  ["defesa", "Defesa", "Desarme e marcação"],
  ["tecnica", "Técnica", "Passe, controlo e drible"],
  ["fisico", "Físico", "Resistência"],
];

export default function TrainingView({ game, actions }) {
  const treino = game.club.buildings.treino;
  const boostActive = (game.flags?.trainBoostUntil ?? 0) > Date.now();
  return (
    <div className="flex flex-col gap-3">
      <Section title="Foco de desenvolvimento" right={<span className="text-[11px] text-[#9aa08e]">Centro de Treino nível {treino} (+{treino * 8}% exp.)</span>}>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {FOCI.map(([k, label, desc]) => (
            <button
              key={k}
              onClick={() => actions.setTrainingFocus(k)}
              className={`rounded-lg px-2 py-2 text-center ${game.trainingFocus === k ? "btn-green" : "border border-[#c9cdb6] bg-white hover:bg-[#f4f5ec]"}`}
            >
              <p className="text-sm font-bold">{label}</p>
              <p className="text-[10px] opacity-80">{desc}</p>
            </button>
          ))}
        </div>
        {boostActive && (
          <p className="box-cream mt-2 rounded-md px-3 py-1.5 text-xs font-semibold text-[#a07407]">
            🎯 Treino Intensivo ativo até {fmtWhen(game.flags.trainBoostUntil)} — experiência de jogo a dobrar!
          </p>
        )}
        <p className="mt-2 text-xs text-[#9aa08e]">
          Não há treinos diários: os jogadores evoluem ao <b>jogar</b>. Cada jogo dá experiência consoante o talento e a idade
          — taças dão <b>×{MATCH_XP_MULT.taca}</b>, amigáveis ×{MATCH_XP_MULT.amigavel}. O foco decide para onde vai essa experiência
          (os guarda-redes desenvolvem sempre o seu ofício).
        </p>
      </Section>

      <Section title="Evolução do plantel">
        <div className="flex flex-col gap-1.5">
          {[...game.players]
            .sort((a, b) => b.talent - a.talent || a.age - b.age)
            .map((p) => {
              const cap = talentCap(p.talent);
              const best = SKILLS.reduce((m, s) => (p.skills[s] > p.skills[m] ? s : m), SKILLS[0]);
              const speed = talentGrowth(p.talent) * (p.age <= 20 ? 1.35 : p.age <= 24 ? 1.05 : p.age <= 28 ? 0.75 : 0.35);
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-[#e6e8da] bg-[#fbfcf7] px-2 py-1.5">
                  <span>{p.flag}</span>
                  <PosBadge pos={p.pos} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.name} <span className="text-xs font-normal text-[#9aa08e]">{p.age} anos · {p.stats.games} jogos · Skl <b style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b></span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Talent t={p.talent} />
                      <span className="text-[10px] text-[#9aa08e]">
                        evolução {speed >= 1.4 ? "🔥 muito rápida" : speed >= 1 ? "rápida" : speed >= 0.6 ? "normal" : "lenta"}
                      </span>
                    </div>
                  </div>
                  <div className="w-40">
                    <div className="flex justify-between text-[10px] text-[#9aa08e]">
                      <span>{SKILL_LABEL[best]}</span>
                      <span className="font-mono">{Math.floor(p.skills[best])} / {cap}</span>
                    </div>
                    <Bar value={p.skills[best]} max={cap} color={p.skills[best] >= cap - 0.5 ? "#b026c9" : "#5da814"} />
                  </div>
                </div>
              );
            })}
        </div>
      </Section>
    </div>
  );
}
