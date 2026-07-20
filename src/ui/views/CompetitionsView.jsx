/* Jogos — só TAÇAS (estilo 11x11): inscreves-te numa de cada vez, vês os inscritos,
   e quando começa tens 4 minutos por ronda para registar a equipa. */

import { Section, Btn, Pill } from "../components/bits.jsx";
import Emblem from "../components/Emblem.jsx";
import { YOU } from "../../engine/competitions.js";
import { userCupMatch, userActiveCup, cupRoundName, cupRoundDue, fmtTime } from "../../engine/realtime.js";
import { CUP_REG_WINDOW_MS } from "../../engine/constants.js";
import { fmtMoney } from "../helpers.js";

const countdown = (ms) => {
  if (ms <= 0) return "agora!";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

/* Os adversários vêm do servidor (podem ser contas reais) — resolve por cup.info. */
const teamName = (game, id, cup) => (id === YOU ? game.club.name : cup?.info?.[id]?.name ?? "—");
const teamEmblem = (game, id, cup) => (id === YOU ? game.club.emblem : cup?.info?.[id]?.emblem);
const teamLevel = (game, id, cup) => (id === YOU ? game.club.level : cup?.info?.[id]?.level ?? "?");
const isRealUser = (id, cup) => id !== YOU && !!cup?.info?.[id]?.isUser;

export default function CompetitionsView({ game, actions, now, onPrepareMatch, onShowProfile }) {
  const ts = now.getTime();
  const setProfileOf = onShowProfile; // managers reais abrem uma PÁGINA de perfil (App.jsx)
  const active = userActiveCup(game); // taça em que ainda estás VIVO (bloqueia novas inscrições)
  const mine = game.cups.filter((c) => c.entrants.includes(YOU) && (c.state === "inscricao" || c.state === "decorrer"));
  const open = game.cups.filter((c) => c.state === "inscricao" && !c.entrants.includes(YOU)).sort((a, b) => a.startsAt - b.startsAt);
  const done = game.cups.filter((c) => c.state === "fim");

  return (
    <div className="flex flex-col gap-3">
      {mine.map((cup) =>
        cup.state === "inscricao"
          ? <EnrolledCup key={cup.id} cup={cup} game={game} ts={ts} onShowProfile={setProfileOf} />
          : <ActiveCup key={cup.id} cup={cup} game={game} ts={ts} onPrepareMatch={onPrepareMatch} onShowProfile={setProfileOf} />
      )}

      <Section
        title={`Taças do teu nível (${game.club.level})`}
        right={<span className="text-[11px] text-[#9aa08e]">abre uma nova de 10 em 10 minutos</span>}
      >
        {active && (
          <p className="box-cream mb-2 rounded-md px-3 py-1.5 text-xs font-semibold text-[#a07407]">
            Estás na {active.icon} {active.name} — só podes inscrever-te noutra taça quando esta terminar.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {open.map((cup) => {
            const full = cup.entrants.length >= cup.size;
            return (
              <div key={cup.id} className="flex gap-3 rounded-lg border border-[#e0e2d2] bg-[#fbfcf7] p-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[#e0e2d2] bg-white text-3xl">{cup.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#3d7a0e]">
                    {cup.name} <span className="font-normal text-[#9aa08e]">// hoje às {fmtTime(cup.startsAt)}</span>
                  </p>
                  <ul className="mt-1 grid grid-cols-2 gap-x-4 text-[11px] text-[#6b7261] sm:grid-cols-4">
                    <li>💰 Prémio: <b className="text-[#d97706]">{fmtMoney(cup.prize)}</b></li>
                    <li>🎟️ Inscrição: <b>{fmtMoney(cup.entryFee)}</b></li>
                    <li>📶 Nível: <b>{cup.level}</b></li>
                    <li>👥 Inscritos: <b>{cup.entrants.length}</b> de {cup.size}</li>
                  </ul>
                  <p className="mt-0.5 text-[10px] text-[#9aa08e]">4 min para registar a equipa (senão: 3-0 por falta de comparência) · se ambos registarem, a ronda seguinte começa logo · experiência ×2</p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between">
                  <span className="font-mono text-xs font-bold text-[#c0392b]">⏱ {countdown(cup.startsAt - ts)}</span>
                  {full
                    ? <Pill color="#9aa08e">Cheia</Pill>
                    : <Btn kind="gold" className="!py-1 text-xs" disabled={!!active || game.club.money < cup.entryFee} onClick={() => actions.enrollCup(cup.id)}>[inscrever]</Btn>}
                </div>
              </div>
            );
          })}
          {open.length === 0 && <p className="text-xs text-[#9aa08e]">A agendar novas taças…</p>}
        </div>
      </Section>

      {done.length > 0 && (
        <Section title="Taças recentes">
          {done.map((cup) => (
            <p key={cup.id} className="border-b border-[#eef0e4] py-1 text-sm last:border-0">
              {cup.icon} <b>{cup.name}</b> — vencedor:{" "}
              {isRealUser(cup.winner, cup) ? (
                <button className="font-semibold text-[#2563eb] underline decoration-dotted" onClick={() => setProfileOf(teamName(game, cup.winner, cup))}>
                  {teamName(game, cup.winner, cup)}
                </button>
              ) : (
                <span className={cup.winner === YOU ? "font-black text-[#d97706]" : "font-semibold"}>{teamName(game, cup.winner, cup)}</span>
              )}
              {cup.winner === YOU && " 🏆"}
            </p>
          ))}
        </Section>
      )}

    </div>
  );
}

/* A taça onde estás inscrito, antes do sorteio: lista de inscritos em direto.
   Managers REAIS são clicáveis — abrem o perfil público deles. */
const EnrolledCup = ({ cup, game, ts, onShowProfile }) => (
  <Section
    title={`${cup.icon} ${cup.name} · estás inscrito`}
    right={<Pill>começa às {fmtTime(cup.startsAt)} ({countdown(cup.startsAt - ts)})</Pill>}
  >
    <p className="mb-2 text-xs text-[#6b7261]">
      Managers inscritos ({cup.entrants.length}/{cup.size}) — as vagas restantes são preenchidas no sorteio:
    </p>
    <div className="grid gap-1 sm:grid-cols-2">
      {cup.entrants.map((id) => {
        const real = isRealUser(id, cup);
        return (
          <div
            key={id}
            onClick={real ? () => onShowProfile(teamName(game, id, cup)) : undefined}
            title={real ? "Ver perfil do manager" : undefined}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${id === YOU ? "box-cream font-bold" : "bg-[#f7f8f1]"} ${real ? "cursor-pointer hover:bg-[#eef3ff]" : ""}`}
          >
            <Emblem emblem={teamEmblem(game, id, cup)} size={22} />
            <span className="min-w-0 flex-1 truncate">{teamName(game, id, cup)}</span>
            {real && <span className="rounded bg-[#2563eb1a] px-1 text-[9px] font-bold text-[#2563eb]">REAL</span>}
            <span className="text-[10px] text-[#9aa08e]">nível {teamLevel(game, id, cup)}</span>
            {id === YOU && <Pill>tu</Pill>}
          </div>
        );
      })}
    </div>
    <p className="mt-2 text-[11px] font-semibold text-[#a07407]">
      ⚠️ Quando começar tens 4 minutos para registar a equipa em cada ronda — falta de comparência é derrota 3-0!
      Se ambos registarem cedo, o confronto seguinte prepara-se logo (sem esperas).
    </p>
  </Section>
);

/* A taça a decorrer: bracket + janela de registo. */
const ActiveCup = ({ cup, game, ts, onPrepareMatch, onShowProfile }) => {
  const my = userCupMatch(cup, ts);
  const due = cupRoundDue(cup);
  const regEnd = due + (cup.regWindowMs ?? CUP_REG_WINDOW_MS);
  const youAlive = cup.rounds[cup.roundIdx]?.some((m) => m.h === YOU || m.a === YOU);
  return (
    <Section
      title={`${cup.icon} ${cup.name} · a decorrer`}
      right={<Pill color="#2563eb">{cupRoundName(cup.roundIdx)}</Pill>}
    >
      {my ? (
        <div className="box-cream mb-2 flex items-center justify-between rounded-md px-3 py-2">
          <p className="text-sm font-bold text-[#c0392b]">
            ⚽ Regista a equipa até às {fmtTime(regEnd)} ({countdown(regEnd - ts)}) — ou perdes 3-0 por falta de comparência!
          </p>
          <Btn onClick={() => onPrepareMatch("taca", { cupId: cup.id })}>Enviar equipa</Btn>
        </div>
      ) : youAlive ? (
        <p className="mb-2 text-xs text-[#6b7261]">
          {ts < due ? `Registo dos ${cupRoundName(cup.roundIdx).toLowerCase()} abre às ${fmtTime(due)} (${countdown(due - ts)})` : "Jogo registado — à espera do fecho da ronda…"}
        </p>
      ) : (
        <p className="mb-2 text-xs text-[#c0392b]">Foste eliminado — mas já podes inscrever-te noutra taça em baixo! 👇</p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cup.rounds.map((round, ri) => (
          <div key={ri} className="min-w-[185px] shrink-0">
            <p className="mb-1 text-[11px] font-bold uppercase text-[#9aa08e]">{cupRoundName(ri)}</p>
            <div className="flex flex-col gap-1">
              {round.map((m, mi) => (
                <div key={mi} className={`rounded-md border px-2 py-1 text-xs ${m.h === YOU || m.a === YOU ? "box-cream" : "border-[#e6e8da] bg-white"}`}>
                  <TieRow game={game} cup={cup} id={m.h} score={m.score?.[0]} winner={m.score && m.score[0] > m.score[1]} onShowProfile={onShowProfile} />
                  <TieRow game={game} cup={cup} id={m.a} score={m.score?.[1]} winner={m.score && m.score[1] > m.score[0]} onShowProfile={onShowProfile} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const TieRow = ({ game, cup, id, score, winner, onShowProfile }) => {
  const real = isRealUser(id, cup);
  return (
    <div className={`flex items-center justify-between ${winner ? "font-bold text-[#2f3428]" : "text-[#6b7261]"}`}>
      <span
        className={`flex min-w-0 items-center gap-1 ${real ? "cursor-pointer hover:underline" : ""}`}
        onClick={real ? () => onShowProfile(teamName(game, id, cup)) : undefined}
        title={real ? "Ver perfil do manager" : undefined}
      >
        <Emblem emblem={teamEmblem(game, id, cup)} size={14} />
        <span className="max-w-[125px] truncate">{teamName(game, id, cup)}</span>
        {real && <span className="text-[8px] font-bold text-[#2563eb]">●</span>}
      </span>
      <span className="tabular-nums">{score ?? ""}</span>
    </div>
  );
};
