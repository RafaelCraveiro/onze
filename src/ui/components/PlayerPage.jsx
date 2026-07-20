/* Página de um JOGADOR (estilo 11x11, não modal): cabeçalho com nome/posição/
   idade/Skl e o dono, lista de ações (só nos teus jogadores), tabela de Skills
   e tabela de Características. Serve os teus jogadores (page.playerId — dados
   vivos do game), os de outros managers (page.player + page.owner) e os
   agentes livres do mercado (page.player sem owner). */

import { useState } from "react";
import { Btn, PosBadge, Talent, Bar } from "./bits.jsx";
import {
  overallBase, SKILLS, SKILL_LABEL, SKILL_CAP, playerValue, lineOf, LINE_LABEL,
} from "../../engine/constants.js";
import { canSell } from "../../engine/market.js";
import { fmtDur } from "../../engine/progress.js";
import { fmtMoney, overallColor } from "../helpers.js";

export default function PlayerPage({ game, actions, page, onBack, onShowProfile, onGoTraining }) {
  const own = !!page.playerId;
  const p = own ? game.players.find((x) => x.id === page.playerId) : page.player;
  const [price, setPrice] = useState(() => (p ? playerValue(p) : 0));

  if (!p) { onBack(); return null; } // vendido/dispensado entretanto

  const owner = own ? game.club.name : page.owner; // null → agente livre
  const sellBlock = own ? canSell(game) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* cabeçalho: (nome) 🇵🇹 Pos idade/Skl (dono) */}
      <div className="flex items-center justify-between">
        <h2 className="min-w-0 text-lg font-black text-[#3a4030]">
          <span className="mr-1">{p.flag}</span>
          <span className="text-[#2563eb]">{p.name}</span>
          <span className="mx-2 align-middle"><PosBadge pos={p.pos} /></span>
          <span className="text-[#3a4030]">{p.age}/<span style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</span></span>
          <span className="ml-2 text-sm font-normal text-[#8a9077]">
            (
            {owner ? (
              own ? owner : (
                <button className="text-[#2563eb] underline decoration-dotted" onClick={() => onShowProfile(owner)}>{owner}</button>
              )
            ) : "agente livre"}
            )
          </span>
        </h2>
        <Btn kind="dark" className="!py-1 text-xs" onClick={onBack}>← Voltar</Btn>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
        <div className="flex flex-col gap-3">
          {/* ações — só nos TEUS jogadores (lista de links, como no 11x11) */}
          {own && (
            <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
              <ul className="flex flex-col gap-1.5 text-sm">
                <li>
                  <button className="text-[#2563eb] underline decoration-dotted hover:text-[#1d4ed8]" onClick={onGoTraining}>
                    » Distribuir XP de treino ({p.trainingXp ?? 0} disponível)
                  </button>
                </li>
                {p.selling ? (
                  <li className="flex items-center gap-2">
                    <span className="text-[#a07407]">» À venda por <b>{fmtMoney(p.selling)}</b></span>
                    <Btn kind="dark" className="!py-0.5 !px-2 text-xs" onClick={() => actions.cancelSale(p.id)}>Retirar do mercado</Btn>
                  </li>
                ) : (
                  <li className="flex flex-wrap items-center gap-2">
                    <span className="text-[#6b7261]">» Pôr à venda por</span>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(+e.target.value)}
                      className="w-24 rounded-md border border-[#c9cdb6] bg-white px-2 py-1 text-xs"
                    />
                    <Btn kind="gold" className="!py-0.5 !px-2 text-xs" disabled={!!sellBlock} title={sellBlock ?? ""} onClick={() => actions.listForSale(p.id, price)}>
                      Confirmar
                    </Btn>
                  </li>
                )}
                <li>
                  <button
                    className="text-[#c0392b] underline decoration-dotted hover:text-[#a93226] disabled:opacity-40"
                    disabled={!!sellBlock}
                    title={sellBlock ?? ""}
                    onClick={() => { actions.releasePlayer(p.id); onBack(); }}
                  >
                    » Dispensar (sai de graça)
                  </button>
                </li>
              </ul>
            </div>
          )}

          {/* Skills — como no 11x11: Skill total + as 8 sub-habilidades */}
          <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
            <h3 className="mb-2 border-b border-[#e6e8da] pb-1.5 text-sm font-bold uppercase tracking-wide text-[#4f7a12]">Skills</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr className="box-cream font-black">
                  <td className="rounded-l px-2 py-1">Skill</td>
                  <td className="rounded-r px-2 py-1 text-right" style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</td>
                </tr>
                {SKILLS.map((s, i) => (
                  <tr key={s} className={i % 2 ? "bg-[#f7f8f1]" : "bg-white"}>
                    <td className="px-2 py-1 text-[#6b7261]">» {SKILL_LABEL[s]}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-end gap-2">
                        <Bar value={p.skills[s] ?? 0} max={SKILL_CAP} className="w-24" color="#5da814" />
                        <span className="w-8 text-right font-mono font-bold">{Math.floor(p.skills[s] ?? 0)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Características — coluna à direita, como no 11x11 */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
            <h3 className="mb-2 border-b border-[#e6e8da] pb-1.5 text-sm font-bold uppercase tracking-wide text-[#4f7a12]">Características</h3>
            <table className="w-full text-sm">
              <tbody>
                <CharRow label="Idade" value={p.age} />
                <CharRow label="Posição" value={`${p.pos} · ${LINE_LABEL[lineOf(p.pos)]}`} />
                <CharRow label="País" value={<>{p.flag} {p.nat ?? "—"}</>} />
                {p.fitness != null && <CharRow label="Energia" value={`${Math.round(p.fitness)}%`} />}
                {p.morale != null && <CharRow label="Moral" value={Math.round(p.morale)} />}
                <CharRow label="Preço" value={<b>{fmtMoney(playerValue(p))}</b>} />
                <CharRow label="Talento" value={<Talent t={p.talent} showNum />} />
                {own && <CharRow label="XP de treino" value={<b className="text-[#a07407]">{p.trainingXp ?? 0}</b>} />}
              </tbody>
            </table>
          </div>

          {p.stats && (
            <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
              <h3 className="mb-2 border-b border-[#e6e8da] pb-1.5 text-sm font-bold uppercase tracking-wide text-[#4f7a12]">Estatísticas</h3>
              <table className="w-full text-sm">
                <tbody>
                  <CharRow label="Jogos" value={p.stats.games ?? 0} />
                  <CharRow label="Golos" value={p.stats.goals ?? 0} />
                  <CharRow label="Assistências" value={p.stats.assists ?? 0} />
                </tbody>
              </table>
            </div>
          )}

          {own && ((p.injuryMin ?? 0) > 0 || p.suspension > 0) && (
            <div className="rounded-lg border border-[#e8b4ae] bg-[#fdeeec] p-3 text-xs font-semibold text-[#c0392b]">
              {(p.injuryMin ?? 0) > 0 && <p>🚑 Lesionado — volta dentro de {fmtDur(p.injuryMin)}.</p>}
              {p.suspension > 0 && <p>🟥 Castigado — falta {p.suspension} jogo(s) oficial(is).</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CharRow = ({ label, value }) => (
  <tr className="border-b border-[#eef0e4] last:border-0">
    <td className="py-1.5 pr-2 text-[#6b7261]">{label}</td>
    <td className="py-1.5 text-right font-semibold text-[#3a4030]">{value}</td>
  </tr>
);
