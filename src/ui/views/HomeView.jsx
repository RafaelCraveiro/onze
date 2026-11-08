/* Ecrã principal — o teu jogo da taça (janela de registo de 4 min), amigáveis, notícias. */

import { Section, Btn, Pill } from "../components/bits.jsx";
import Emblem from "../components/Emblem.jsx";
import { YOU } from "../../engine/competitions.js";
import { userCupMatch, userActiveCup, cupRoundDue, cupRoundName, fmtTime } from "../../engine/realtime.js";
import { CUP_REG_WINDOW_MS } from "../../engine/constants.js";
import { fmtWhen } from "../helpers.js";

const NEWS_ICON = {
  welcome: "👋", level: "⬆️", trophy: "🏆", cup: "🏅", match: "⚽", injury: "🚑",
  card: "🟥", transfer: "🔁", academy: "🎓", squad: "👥", money: "💰", club: "🏗️", boost: "⚡",
};

export default function HomeView({ game, now, onPrepareMatch }) {
  const ts = now.getTime();
  const { club, inbox, lastMatch } = game;
  const active = userActiveCup(game);
  const avgFitness = Math.round(game.players.reduce((s, p) => s + p.fitness, 0) / Math.max(1, game.players.length));

  let cupMatch = null, wait = null;
  if (active?.state === "decorrer") {
    const m = userCupMatch(active, ts);
    if (m) {
      const opp = active.info?.[m.h === YOU ? m.a : m.h];
      const deadline = cupRoundDue(active) + (active.regWindowMs ?? CUP_REG_WINDOW_MS);
      if (opp) cupMatch = { cup: active, m, opp, deadline };
    } else if (active.rounds?.[active.roundIdx]?.some((x) => x.h === YOU || x.a === YOU) && ts < cupRoundDue(active)) {
      wait = { icon: active.icon, name: active.name, at: cupRoundDue(active), what: `registo dos ${cupRoundName(active.roundIdx).toLowerCase()}` };
    }
  } else if (active?.state === "inscricao") {
    wait = { icon: active.icon, name: active.name, at: active.startsAt, what: "início" };
  }

  return (
    <div className="flex flex-col gap-3">
      {lastMatch && ts - (lastMatch.at ?? 0) < 2 * 60 * 60 * 1000 && <LastMatchCard lastMatch={lastMatch} club={club} />}

      {game.league && <NextLeague lg={game.league} />}

      <Section title="Jogos disponíveis agora">
        <div className="flex flex-col gap-2">
          {cupMatch && (
            <div className="box-cream flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Emblem emblem={cupMatch.opp.emblem} size={34} />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">
                    {cupMatch.m.h === YOU ? "vs" : "@"} {cupMatch.opp.name}
                    {cupMatch.opp.isUser && <span className="ml-1 rounded bg-[var(--info-soft)] px-1 text-[9px] font-bold text-[var(--info)]">MANAGER REAL</span>}
                    <span className="ml-2 text-xs font-normal text-[var(--t3)]">nível {cupMatch.opp.level}</span>
                  </p>
                  <p className="truncate text-xs font-bold text-[var(--danger)]">
                    {cupMatch.cup.icon} {cupMatch.cup.name} · {cupRoundName(cupMatch.cup.roundIdx)} — regista a equipa até às {fmtTime(cupMatch.deadline)} ({countdown(cupMatch.deadline - ts)})
                  </p>
                </div>
              </div>
              <Btn onClick={() => onPrepareMatch("taca", { cupId: cupMatch.cup.id })}>Enviar equipa</Btn>
            </div>
          )}
          {!active && (
            <p className="box-cream rounded-md px-3 py-2 text-xs text-[var(--t2)]">
              Não estás em nenhuma taça. Vai a <b>Taças</b> e inscreve-te numa do teu escalão.
            </p>
          )}
          {wait && (
            <p className="box-cream rounded-md px-3 py-1.5 text-[11px] text-[var(--t2)]">
              ⏱ {wait.icon} <b>{wait.name}</b> — {wait.what === "início" ? "começa" : `${wait.what} às`} <b>{fmtTime(wait.at)}</b>
              <span className="ml-1 text-[var(--t3)]">({countdown(wait.at - ts)})</span> — tens 4 min para registar a equipa, senão perdes 3-0 por falta de comparência!
            </p>
          )}
          <div className="flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--s2)] px-3 py-2">
            <div className="text-sm">
              <p className="font-semibold">Jogo amigável</p>
              <p className="text-[11px] text-[var(--t3)]">Sempre disponível · evolução reduzida · gasta energia</p>
            </div>
            <Btn kind="dark" onClick={() => onPrepareMatch("amigavel")}>Jogar</Btn>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Energia média" value={`${avgFitness}%`} warn={avgFitness < 55} />
        <Stat label="Moral" value={`${Math.round(club.morale)}%`} warn={club.morale < 45} />
        <Stat label="Jogadores" value={game.players.length} />
      </div>

      <Section title="Notícias">
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {inbox.map((n, i) => (
            <div key={i} className="rounded-md bg-[var(--s2)] px-3 py-1.5">
              <p className="text-xs font-bold text-[var(--t1)]">
                <span className="mr-1">{NEWS_ICON[n.type] ?? "📰"}</span>
                {n.title}
                <span className="ml-2 font-normal text-[var(--t3)]">{fmtWhen(n.at)}</span>
              </p>
              <p className="text-xs text-[var(--t2)]">{n.text}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const NextLeague = ({ lg }) => {
  const next = lg.mine.find((m) => !m.score);
  const me = lg.table.find((c) => c.me);
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="shrink-0">
        <p className="font-display text-5xl font-bold leading-none text-[var(--accent)]">{me.rank}.º</p>
        <p className="text-[11px] text-[var(--t3)]">Divisão {lg.division} · {me.pts} pts</p>
      </div>
      {next && (
        <div className="min-w-0 flex-1 text-right">
          <p className="text-xs text-[var(--t3)]">Próximo jogo da liga · {fmtWhen(next.dueAt)}</p>
          <p className="truncate text-sm font-bold">{next.home} - {next.away}</p>
        </div>
      )}
    </section>
  );
};

const countdown = (ms) => {
  if (ms <= 0) return "agora";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

const Stat = ({ label, value, warn }) => (
  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2 text-center">
    <p className={`text-lg font-black ${warn ? "text-[var(--danger)]" : "text-[var(--t1)]"}`}>{value}</p>
    <p className="text-[11px] text-[var(--t3)]">{label}</p>
  </div>
);

const LastMatchCard = ({ lastMatch, club }) => {
  const { result, opp, isHome, userSide } = lastMatch;
  const [gh, ga] = result.score;
  const gU = userSide === "H" ? gh : ga, gO = userSide === "H" ? ga : gh;
  const color = gU > gO ? "text-[var(--green)]" : gU < gO ? "text-[var(--danger)]" : "text-[var(--gold)]";
  return (
    <Section
      title="Último jogo"
      right={<Pill color={gU > gO ? "#5fe08c" : gU < gO ? "#ff6b6f" : "#f5b83d"}>{gU > gO ? "Vitória +3 XP" : gU === gO ? "Empate +1 XP" : "Derrota"}</Pill>}
    >
      <div className="flex items-center justify-center gap-4 py-1">
        <div className="flex items-center gap-2">
          <Emblem emblem={isHome ? club.emblem : opp.emblem} size={30} />
          <span className="text-sm font-bold">{isHome ? club.name : opp.team}</span>
        </div>
        <span className={`text-2xl font-black tabular-nums ${color}`}>{gh} - {ga}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{isHome ? opp.team : club.name}</span>
          <Emblem emblem={isHome ? opp.emblem : club.emblem} size={30} />
        </div>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-2 text-center text-xs text-[var(--t3)]">
        <div><b className="text-[var(--t1)]">{result.possession[0]}% - {result.possession[1]}%</b><br />posse</div>
        <div><b className="text-[var(--t1)]">{result.shots[0]} - {result.shots[1]}</b><br />remates</div>
        <div><b className="text-[var(--t1)]">{result.onTarget[0]} - {result.onTarget[1]}</b><br />à baliza</div>
        <div><b className="text-[var(--green)]">{result.mvp?.name ?? "—"}</b><br />MVP</div>
      </div>
      {result.xg && <p className="mt-1 text-center text-xs text-[var(--t3)]">Qualidade das ocasiões (xG): <b className="text-[var(--t1)]">{result.xg[0].toFixed(1)} - {result.xg[1].toFixed(1)}</b></p>}
      {result.insights?.map((t) => <p key={t} className="mt-1 text-center text-xs text-[var(--t2)]">{t}</p>)}
    </Section>
  );
};
