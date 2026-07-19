/* Plantel — tabela estilo 11x11 (#, Jogador, Nat, Pos, Idade, Skl, Sta, Power, Mor, Tal). */

import { useState } from "react";
import { Section, Btn, PosBadge, Talent, Bar } from "../components/bits.jsx";
import {
  overallBase, SKILL_LABEL, SKILLS, talentCap, playerValue, POSITIONS, lineOf, LINE_LABEL,
} from "../../engine/constants.js";
import { canSell } from "../../engine/market.js";
import { fmtDur } from "../../engine/progress.js";
import { fmtMoney, overallColor, talentColor } from "../helpers.js";

const power = (p) => Math.round(overallBase(p) * (0.68 + 0.32 * p.fitness / 100));

export default function SquadView({ game, actions }) {
  const [sel, setSel] = useState(null);
  const [sort, setSort] = useState("pos");
  const players = [...game.players].sort((a, b) => {
    if (sort === "pos") return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || overallBase(b) - overallBase(a);
    if (sort === "skl") return overallBase(b) - overallBase(a);
    if (sort === "talento") return b.talent - a.talent;
    if (sort === "idade") return a.age - b.age;
    return 0;
  });
  const selected = game.players.find((p) => p.id === sel);
  const avgSkl = Math.round(players.reduce((s, p) => s + overallBase(p), 0) / Math.max(1, players.length));
  const avgAge = Math.round(players.reduce((s, p) => s + p.age, 0) / Math.max(1, players.length));

  return (
    <div className="flex flex-col gap-3">
      <Section
        title={`Plantel (${game.players.length})`}
        right={
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded border border-[#c9cdb6] bg-white px-2 py-1 text-xs">
            <option value="pos">Por posição</option>
            <option value="skl">Por Skl</option>
            <option value="talento">Por talento</option>
            <option value="idade">Por idade</option>
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="nav-green text-left text-xs text-white" style={{ textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}>
                <th className="rounded-l px-2 py-1.5">#</th>
                <th className="px-1 py-1.5">Jogador</th>
                <th className="px-1 py-1.5">Nat.</th>
                <th className="px-1 py-1.5">Pos</th>
                <th className="px-1 py-1.5 text-center">Idade</th>
                <th className="px-1 py-1.5 text-center">Skl</th>
                <th className="px-1 py-1.5 text-center">Sta</th>
                <th className="px-1 py-1.5 text-center">Power</th>
                <th className="px-1 py-1.5 text-center">Mor</th>
                <th className="px-1 py-1.5 text-center">Tal</th>
                <th className="rounded-r px-1 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => setSel(p.id)}
                  className={`cursor-pointer border-b border-[#eef0e4] hover:bg-[#f9f7dd] ${i % 2 ? "bg-[#f7f8f1]" : "bg-white"}`}
                >
                  <td className="px-2 py-1 text-xs text-[#9aa08e]">{i + 1}</td>
                  <td className="px-1 py-1 font-semibold text-[#3d7a0e]">{p.name}</td>
                  <td className="px-1 py-1">{p.flag}</td>
                  <td className="px-1 py-1"><PosBadge pos={p.pos} /></td>
                  <td className="px-1 py-1 text-center">{p.age}</td>
                  <td className="px-1 py-1 text-center font-black" style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</td>
                  <td className="px-1 py-1 text-center text-xs">{Math.round(p.fitness)}</td>
                  <td className="px-1 py-1 text-center font-bold" style={{ color: overallColor(power(p)) }}>{power(p)}</td>
                  <td className="px-1 py-1 text-center text-xs">{Math.round(p.morale ?? 0)}</td>
                  <td className="px-1 py-1 text-center font-bold" style={{ color: talentColor(p.talent) }}>{p.talent}</td>
                  <td className="px-1 py-1 text-[11px]">
                    {(p.injuryMin ?? 0) > 0 && <span className="mr-1 text-[#c0392b]">🚑{fmtDur(p.injuryMin)}</span>}
                    {p.suspension > 0 && <span className="mr-1 text-[#c0392b]">🟥{p.suspension}j</span>}
                    {p.selling && <span className="text-[#c98d09]">à venda</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="box-cream text-xs font-bold">
                <td className="px-2 py-1" colSpan={4}>Médias</td>
                <td className="px-1 py-1 text-center">{avgAge}</td>
                <td className="px-1 py-1 text-center">{avgSkl}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {selected && <PlayerModal p={selected} game={game} actions={actions} onClose={() => setSel(null)} />}
    </div>
  );
}

export const PlayerModal = ({ p, game, actions, onClose }) => {
  const [price, setPrice] = useState(playerValue(p));
  const cap = talentCap(p.talent);
  const sellBlock = canSell(game);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="onze-pop max-h-[88vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#c9cdb6] bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between">
          <div>
            <p className="text-lg font-black text-[#3d7a0e]">{p.flag} {p.name}</p>
            <p className="mt-0.5 text-sm text-[#6b7261]">
              <PosBadge pos={p.pos} /> <span className="ml-1">{LINE_LABEL[lineOf(p.pos)]} · {p.age} anos</span>
            </p>
            <p className="mt-1 text-sm"><Talent t={p.talent} showNum /></p>
          </div>
          <button onClick={onClose} className="rounded-md border border-[#c9cdb6] bg-[#f4f5ec] px-2 py-1 text-sm">✕</button>
        </div>

        {/* Habilidades — como no 11x11: Skill total + sub-habilidades */}
        <table className="mb-3 w-full text-sm">
          <tbody>
            <tr className="box-cream font-black">
              <td className="rounded-l px-2 py-1">Skill</td>
              <td className="rounded-r px-2 py-1 text-right" style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</td>
            </tr>
            {SKILLS.map((s) => (
              <tr key={s} className="border-b border-[#eef0e4]">
                <td className="px-2 py-1 text-[#6b7261]">» {SKILL_LABEL[s]}</td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-end gap-2">
                    <Bar value={p.skills[s]} max={cap} className="w-24" color="#5da814" />
                    <span className="w-10 text-right font-mono font-bold">{Math.floor(p.skills[s])}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mb-3 text-[11px] text-[#9aa08e]">Teto por sub-habilidade: {cap} (talento {p.talent}/9). Jovens e talentosos treinam mais depressa.</p>

        {/* Características */}
        <div className="mb-3 grid grid-cols-3 gap-1.5 text-center text-xs">
          <MiniStat label="Energia" value={`${Math.round(p.fitness)}%`} />
          <MiniStat label="Moral" value={Math.round(p.morale ?? 0)} />
          <MiniStat label="Preço" value={fmtMoney(playerValue(p))} />
          <MiniStat label="Jogos" value={p.stats.games} />
          <MiniStat label="Golos" value={p.stats.goals} />
          <MiniStat label="Assistências" value={p.stats.assists} />
        </div>

        {p.selling ? (
          <div className="box-cream flex items-center justify-between rounded-md px-3 py-2">
            <p className="text-sm font-semibold text-[#a07407]">À venda por {fmtMoney(p.selling)}</p>
            <Btn kind="dark" onClick={() => { actions.cancelSale(p.id); onClose(); }}>Retirar do mercado</Btn>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(+e.target.value)}
              className="w-28 rounded-md border border-[#c9cdb6] bg-white px-2 py-1.5 text-sm"
            />
            <Btn kind="gold" disabled={!!sellBlock} title={sellBlock ?? ""} onClick={() => { actions.listForSale(p.id, price); onClose(); }}>
              Pôr à venda
            </Btn>
            <Btn kind="danger" disabled={!!sellBlock} className="ml-auto" onClick={() => { actions.releasePlayer(p.id); onClose(); }}>
              Dispensar
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
};

const MiniStat = ({ label, value }) => (
  <div className="rounded-md border border-[#e6e8da] bg-[#f7f8f1] px-1 py-1.5">
    <p className="font-bold text-[#3a4030]">{value}</p>
    <p className="text-[10px] text-[#9aa08e]">{label}</p>
  </div>
);
