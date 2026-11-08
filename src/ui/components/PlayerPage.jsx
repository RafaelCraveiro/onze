/* Ficha de um jogador: serve os teus (page.playerId), os de outros managers
   (page.player + page.owner) e os agentes livres (page.player sem owner). */

import { useState } from "react";
import { Btn, PosBadge, Talent, Bar } from "./bits.jsx";
import {
  overallBase, overallAt, POSITIONS, POS_LABEL, SKILLS, SKILL_LABEL, playerValue, wagePerDay, renewCost,
  LINE_LABEL, lineOf, TRAITS, RATING_WEIGHTS,
} from "../../engine/constants.js";
import { canSell } from "../../engine/market.js";
import { fmtDur } from "../../engine/progress.js";
import { fmtMoney, overallColor } from "../helpers.js";

const Card = ({ title, children }) => (
  <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    {title && <h3 className="font-display mb-3 text-lg font-semibold uppercase tracking-wide">{title}</h3>}
    {children}
  </section>
);
const Fact = ({ label, value }) => (
  <div className="rounded-xl bg-[var(--s2)] p-2.5">
    <p className="tnum text-sm font-bold">{value}</p>
    <p className="text-[11px] text-[var(--t3)]">{label}</p>
  </div>
);

export default function PlayerPage({ game, actions, page, onBack, onShowProfile }) {
  const own = !!page.playerId;
  const p = own ? game.players.find((x) => x.id === page.playerId) : page.player;
  const [price, setPrice] = useState(() => (p ? playerValue(p) : 0));
  if (!p) { onBack(); return null; } // vendido ou dispensado entretanto

  const owner = own ? game.club.name : page.owner; // null → agente livre
  const sellBlock = own ? canSell(game) : null;
  const ovr = overallBase(p);
  const weights = RATING_WEIGHTS[lineOf(p.pos)];
  const attrs = SKILLS.filter((s) => weights[s] > 0 || (p.skills[s] ?? 0) >= 30);
  const best = POSITIONS.filter((x) => x !== p.pos && overallAt(p, x) >= ovr - 6).slice(0, 3);
  const cost = renewCost(p);

  return (
    <div className="flex flex-col gap-4">
      <div><Btn kind="dark" className="!py-1 text-xs" onClick={onBack}>← Voltar</Btn></div>

      <section className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="shrink-0 text-center">
          <p className="font-display text-7xl font-bold leading-[0.85]" style={{ color: overallColor(ovr) }}>{ovr}</p>
          <p className="mt-1 text-[11px] text-[var(--t3)]">qualidade</p>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display truncate text-3xl font-bold leading-none">{p.name}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--t2)]">
            <PosBadge pos={p.pos} />
            <span>{p.flag} {p.age} anos</span>
            <span className="text-[var(--t3)]">{LINE_LABEL[lineOf(p.pos)]}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--t3)]">
            {owner ? (own ? owner : <button className="font-semibold text-[var(--info)]" onClick={() => onShowProfile(owner)}>{owner}</button>) : "Agente livre"}
          </p>
          {(p.traits ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.traits.map((t) => <span key={t} title={TRAITS[t]?.desc} className="rounded-full bg-[var(--s3)] px-2.5 py-1 text-xs font-semibold">{TRAITS[t]?.label}</span>)}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <Card title="Atributos">
            <div className="flex flex-col gap-3">
              {attrs.map((s) => {
                const key = weights[s] >= 0.2;
                return (
                  <div key={s}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className={key ? "font-semibold" : "text-[var(--t2)]"}>{SKILL_LABEL[s]}</span>
                      <span className="tnum font-bold">{Math.floor(p.skills[s] ?? 0)}</span>
                    </div>
                    <Bar value={p.skills[s] ?? 0} max={99} color={key ? "#b6f23a" : "#6aaeff"} />
                  </div>
                );
              })}
            </div>
            {best.length > 0 && <p className="mt-3 text-xs text-[var(--t3)]">Também rende como {best.map((x) => POS_LABEL[x]).join(", ")}.</p>}
          </Card>

          {own && (
            <Card title="Plano de evolução">
              <p className="mb-3 text-xs text-[var(--t2)]">Os jogadores evoluem sozinhos a jogar. Escolhe em que deve focar-se: os mais novos e com mais margem evoluem mais depressa.</p>
              <div className="flex flex-wrap gap-1.5">
                <FocusChip on={!p.focus} onClick={() => actions.setFocus(p.id, null)}>Automático</FocusChip>
                {SKILLS.filter((s) => weights[s] > 0).map((s) => <FocusChip key={s} on={p.focus === s} onClick={() => actions.setFocus(p.id, s)}>{SKILL_LABEL[s]}</FocusChip>)}
              </div>
              {ovr >= p.pot && <p className="mt-3 text-xs font-semibold text-[var(--gold)]">Já atingiu o potencial e não vai evoluir mais.</p>}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="grid grid-cols-2 gap-2">
              <Fact label="Valor" value={fmtMoney(playerValue(p))} />
              <Fact label="Potencial" value={<Talent t={p.pot} />} />
              <Fact label="Salário" value={`${fmtMoney(wagePerDay(p))}/dia`} />
              <Fact label="Contrato" value={`${p.contract} época${p.contract === 1 ? "" : "s"}`} />
              {p.fitness != null && <Fact label="Energia" value={`${Math.round(p.fitness)}%`} />}
              {p.morale != null && <Fact label="Moral" value={Math.round(p.morale)} />}
              {p.stats && <Fact label="Jogos" value={p.stats.games ?? 0} />}
              {p.stats && <Fact label="Golos / assist." value={`${p.stats.goals ?? 0} / ${p.stats.assists ?? 0}`} />}
            </div>
            {own && ((p.injuryMin ?? 0) > 0 || p.suspension > 0) && (
              <div className="mt-2 rounded-xl bg-[var(--danger-soft)] p-2.5 text-xs font-semibold text-[var(--danger)]">
                {(p.injuryMin ?? 0) > 0 && <p>Lesionado: volta dentro de {fmtDur(p.injuryMin)}.</p>}
                {p.suspension > 0 && <p>Castigado: falta {p.suspension} jogo(s) oficial(is).</p>}
              </div>
            )}
          </Card>

          {own && (
            <Card title="Gestão">
              <div className="flex flex-col gap-2">
                <Btn disabled={game.club.money < cost || p.contract >= 5} title={p.contract >= 5 ? "Contrato já no máximo" : ""} onClick={() => actions.renewPlayer(p.id)}>
                  Renovar +2 épocas ({fmtMoney(cost)})
                </Btn>
                {p.selling ? (
                  <>
                    <p className="text-sm font-semibold text-[var(--gold)]">À venda por {fmtMoney(p.selling)}</p>
                    <Btn kind="dark" onClick={() => actions.cancelSale(p.id)}>Retirar do mercado</Btn>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <input type="number" aria-label="Preço de venda" value={price} onChange={(e) => setPrice(+e.target.value)} className="tnum w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--s2)] px-2 py-2 text-sm text-[var(--t1)]" />
                    <Btn kind="gold" disabled={!!sellBlock} title={sellBlock ?? ""} onClick={() => actions.listForSale(p.id, price)}>Vender</Btn>
                  </div>
                )}
                <button className="py-1 text-xs font-semibold text-[var(--danger)] disabled:opacity-40" disabled={!!sellBlock} title={sellBlock ?? ""} onClick={() => { actions.releasePlayer(p.id); onBack(); }}>
                  Dispensar jogador
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const FocusChip = ({ on, onClick, children }) => (
  <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${on ? "btn-green" : "bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--s3)]"}`}>{children}</button>
);
