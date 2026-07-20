/* Clube — infraestruturas, boosters, troféus, conta e histórico. */

import { Section, Btn, Bar, Pill } from "../components/bits.jsx";
import Emblem from "../components/Emblem.jsx";
import { BUILDINGS, BOOSTERS, buildingCost, xpForNext, stadiumCapacity, gateIncome } from "../../engine/constants.js";
import { fmtMoney, fmtWhen } from "../helpers.js";

export default function ClubView({ game, actions }) {
  const { club, account } = game;
  return (
    <div className="flex flex-col gap-3">
      <Section title="O clube">
        <div className="flex items-center gap-3">
          <Emblem emblem={club.emblem} size={64} />
          <div className="flex-1">
            <p className="text-lg font-black">{club.name}</p>
            <p className="text-xs text-[#8a9077]">conta online · criada a {fmtWhen(account.createdAt)}</p>
            <div className="mt-1 flex items-center gap-2">
              <Pill>Nível {club.level}</Pill>
              <div className="flex-1">
                <Bar value={club.xp} max={xpForNext(club.level)} />
              </div>
              <span className="font-mono text-xs text-[#8a9077]">{club.xp}/{xpForNext(club.level)} XP</span>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
          <MiniStat label="Vitórias" value={account.wins} />
          <MiniStat label="Empates" value={account.draws} />
          <MiniStat label="Derrotas" value={account.losses} />
          <MiniStat label="Adeptos" value={(club.fans ?? 100).toLocaleString("pt-PT")} />
        </div>
      </Section>

      <Section title="Infraestruturas">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(BUILDINGS).map(([key, b]) => {
            const lvl = club.buildings[key];
            const cost = buildingCost(lvl + 1);
            const maxed = lvl >= b.max;
            return (
              <div key={key} className="rounded-lg border border-[#e6e8da] bg-[#fbfcf7] p-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{b.label} <span className="text-xs font-normal text-[#8a9077]">nível {lvl}</span></p>
                  <Btn kind="dark" disabled={maxed || club.money < cost} onClick={() => actions.upgradeBuilding(key)}>
                    {maxed ? "Máx." : fmtMoney(cost)}
                  </Btn>
                </div>
                <p className="mt-1 text-xs text-[#6b7261]">{b.desc}</p>
                {key === "estadio" && (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#4f7a12]">
                    {stadiumCapacity(lvl).toLocaleString("pt-PT")} lugares · bilheteira: {fmtMoney(gateIncome(lvl, club.fans ?? 0))}/jogo em casa
                    {stadiumCapacity(lvl) > 0 && (club.fans ?? 0) >= stadiumCapacity(lvl) ? " (casa cheia!)" : ""}
                  </p>
                )}
                <Bar value={lvl} max={b.max} className="mt-2" color="#2563eb" />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Boosters">
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(BOOSTERS).map(([key, b]) => (
            <div key={key} className="flex flex-col rounded-lg border border-[#e6e8da] bg-[#fbfcf7] p-3">
              <p className="font-bold">{b.icon} {b.label}</p>
              <p className="mb-2 flex-1 text-xs text-[#6b7261]">{b.desc}</p>
              <Btn kind="gold" disabled={club.money < b.price || (key === "treino" && (game.flags?.trainBoostUntil ?? 0) > Date.now())} onClick={() => actions.buyBooster(key)}>
                {key === "treino" && (game.flags?.trainBoostUntil ?? 0) > Date.now() ? `Ativo até ${fmtWhen(game.flags.trainBoostUntil)}` : fmtMoney(b.price)}
              </Btn>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Palmarés"
        right={account.trophies.length > 0 && <Pill color="#d97706">🏆 {account.trophies.length} taça{account.trophies.length === 1 ? "" : "s"}</Pill>}
      >
        {account.trophies.length === 0
          ? <p className="text-xs text-[#9aa08e]">Palmarés vazio — vence a tua primeira taça para o estrear!</p>
          : (
            <>
              {/* vitrine por nível */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {Object.entries(
                  account.trophies.reduce((acc, t) => {
                    const lvl = t.level ?? "?";
                    acc[lvl] = (acc[lvl] ?? 0) + 1;
                    return acc;
                  }, {})
                ).sort((a, b) => b[0] - a[0]).map(([lvl, n]) => (
                  <span key={lvl} className="box-cream rounded-md px-2.5 py-1 text-xs font-bold text-[#a07407]">
                    Nível {lvl}: {n}× 🏆
                  </span>
                ))}
              </div>
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {[...account.trophies].reverse().map((t, i) => (
                  <p key={i} className="box-cream flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold text-[#a07407]">
                    <span className="text-lg">{t.icon ?? "🏆"}</span>
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {t.level && <span className="text-[10px] font-normal text-[#9aa08e]">nível {t.level}</span>}
                    <span className="text-xs font-normal text-[#9aa08e]">{fmtWhen(t.at)}</span>
                  </p>
                ))}
              </div>
            </>
          )}
      </Section>

      <Section title="Histórico de jogos">
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {game.history.map((h, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-[#f7f8f1] px-2 py-1 text-xs">
              <span className={`w-5 text-center font-black ${h.outcome === "V" ? "text-[#3d8c0e]" : h.outcome === "E" ? "text-[#c98d09]" : "text-[#c0392b]"}`}>{h.outcome}</span>
              <span className="w-14 text-[#9aa08e]">{fmtWhen(h.at)}</span>
              <span className="min-w-0 flex-1 truncate">{h.isHome ? "vs" : "@"} {h.opp}</span>
              <span className="text-[#9aa08e]">{{ amigavel: "amigável", taca: "taça" }[h.kind] ?? h.kind}</span>
              <b className="tabular-nums">{h.score[0]}-{h.score[1]}</b>
              {h.auto && <span title="simulado automaticamente">🤖</span>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Conta">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[#8a9077]">
            A tua conta e o save vivem na base de dados do servidor — podes entrar de qualquer browser com o teu email.
          </p>
          <Btn kind="dark" onClick={actions.logout}>Sair da conta 🚪</Btn>
        </div>
      </Section>
    </div>
  );
}

const MiniStat = ({ label, value }) => (
  <div className="rounded-md border border-[#e6e8da] bg-[#f7f8f1] px-1 py-1.5">
    <p className="font-bold text-[#3a4030]">{value}</p>
    <p className="text-[10px] text-[#9aa08e]">{label}</p>
  </div>
);
