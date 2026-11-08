/* Liga: classificação da época, próximos jogos e resultados. */

import { Section, Btn, Pill } from "../components/bits.jsx";
import Emblem from "../components/Emblem.jsx";
import { fmtWhen } from "../helpers.js";

const DAY = 24 * 60 * 60 * 1000;

export default function LeagueView({ game, actions, now }) {
  const lg = game.league;
  if (!lg) return <Section title="Liga"><p className="text-sm text-[var(--t3)]">A carregar a tua liga…</p></Section>;
  const ts = now.getTime();
  const next = lg.mine.find((m) => !m.score);
  const played = lg.mine.filter((m) => m.score).reverse();
  const daysLeft = Math.max(0, Math.ceil((lg.endsAt - ts) / DAY));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs text-[var(--t3)]">Época {lg.season}</p>
            <h2 className="font-display text-4xl font-bold uppercase leading-none">Divisão {lg.division}</h2>
          </div>
          <Pill color="#b6f23a">termina em {daysLeft} dia{daysLeft === 1 ? "" : "s"}</Pill>
        </div>
        {next && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--s2)] p-3">
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <span className="truncate text-sm font-bold">{next.home}</span>
              <Emblem emblem={next.homeEmblem} size={32} />
            </div>
            <div className="shrink-0 text-center">
              <p className="font-display text-xl font-bold leading-none">{next.round + 1}.ª jornada</p>
              <p className="tnum mt-1 text-xs text-[var(--accent)]">{fmtWhen(next.dueAt)}</p>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Emblem emblem={next.awayEmblem} size={32} />
              <span className="truncate text-sm font-bold">{next.away}</span>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--t3)]">Os jogos da liga fazem-se à hora marcada, mesmo offline, com o teu último onze e tática. Prepara a equipa em Táticas.</p>
      </div>

      <Section title="Classificação">
        <div className="-mx-1 overflow-x-auto">
          <table className="tnum w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-xs text-[var(--t3)]">
                <th className="px-1 py-1 text-left">#</th>
                <th className="px-1 py-1 text-left">Clube</th>
                <th className="px-1 py-1">J</th><th className="px-1 py-1">V</th><th className="px-1 py-1">E</th><th className="px-1 py-1">D</th>
                <th className="px-1 py-1">DG</th><th className="px-1 py-1 text-[var(--t1)]">Pts</th>
              </tr>
            </thead>
            <tbody>
              {lg.table.map((c) => {
                const up = lg.division > 1 && c.rank <= lg.upTo;
                const down = lg.division < lg.maxDivision && c.rank >= lg.downFrom;
                return (
                  <tr key={c.rank} className={`border-t border-[var(--line)] ${c.me ? "bg-[var(--s2)]" : ""}`}>
                    <td className="px-1 py-1.5">
                      <span className={`inline-block h-5 w-5 rounded text-center text-xs font-bold leading-5 ${up ? "bg-[var(--accent)] text-[var(--on-accent)]" : down ? "bg-[var(--danger)] text-[#1c0a0b]" : "text-[var(--t3)]"}`}>{c.rank}</span>
                    </td>
                    <td className="px-1 py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Emblem emblem={c.emblem} size={20} />
                        <span className={`truncate ${c.me ? "font-bold" : ""}`}>{c.name}</span>
                      </span>
                    </td>
                    <td className="px-1 py-1.5 text-center text-[var(--t2)]">{c.played}</td>
                    <td className="px-1 py-1.5 text-center text-[var(--t2)]">{c.w}</td>
                    <td className="px-1 py-1.5 text-center text-[var(--t2)]">{c.d}</td>
                    <td className="px-1 py-1.5 text-center text-[var(--t2)]">{c.l}</td>
                    <td className="px-1 py-1.5 text-center text-[var(--t2)]">{c.gf - c.ga > 0 ? "+" : ""}{c.gf - c.ga}</td>
                    <td className="px-1 py-1.5 text-center font-bold">{c.pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[var(--t3)]">Os 2 primeiros sobem de divisão e os 2 últimos descem.</p>
      </Section>

      <Section title="Os teus resultados">
        {played.length === 0 && <p className="text-sm text-[var(--t3)]">Ainda não há jogos disputados nesta época.</p>}
        <div className="flex flex-col gap-1.5">
          {played.map((m) => (
            <div key={m.round} className="flex items-center gap-2 rounded-xl bg-[var(--s2)] px-3 py-2 text-sm">
              <span className="w-7 text-xs text-[var(--t3)]">J{m.round + 1}</span>
              <span className="min-w-0 flex-1 truncate text-right">{m.home}</span>
              <b className="tnum shrink-0">{m.score[0]}-{m.score[1]}</b>
              <span className="min-w-0 flex-1 truncate">{m.away}</span>
              {m.watchable && <Btn kind="dark" className="!px-2 !py-1 text-xs" onClick={() => actions.watchLeagueMatch(m.round)}>Ver</Btn>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
