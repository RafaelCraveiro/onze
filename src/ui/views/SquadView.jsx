/* Plantel — tabela estilo 11x11 (#, Jogador, Nat, Pos, Idade, Skl, Sta, Power, Mor, Tal).
   Clicar num jogador abre a PÁGINA dele (PlayerPage, via App.jsx) — sem modal. */

import { useState } from "react";
import { Section, PosBadge } from "../components/bits.jsx";
import { overallBase, POSITIONS } from "../../engine/constants.js";
import { fmtDur } from "../../engine/progress.js";
import { overallColor, talentColor } from "../helpers.js";

const power = (p) => Math.round(overallBase(p) * (0.68 + 0.32 * p.fitness / 100));

export default function SquadView({ game, onShowPlayer }) {
  const [sort, setSort] = useState("pos");
  const players = [...game.players].sort((a, b) => {
    if (sort === "pos") return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || overallBase(b) - overallBase(a);
    if (sort === "skl") return overallBase(b) - overallBase(a);
    if (sort === "talento") return b.talent - a.talent;
    if (sort === "idade") return a.age - b.age;
    return 0;
  });
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
                  onClick={() => onShowPlayer(p.id)}
                  title="Ver a página do jogador"
                  className={`cursor-pointer border-b border-[#eef0e4] hover:bg-[#f9f7dd] ${i % 2 ? "bg-[#f7f8f1]" : "bg-white"}`}
                >
                  <td className="px-2 py-1 text-xs text-[#9aa08e]">{i + 1}</td>
                  <td className="px-1 py-1 font-semibold text-[#3d7a0e] underline decoration-dotted">{p.name}</td>
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
    </div>
  );
}
