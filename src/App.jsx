/* Onze — app raiz: jogo ONLINE (login/registo → jogo → jogo ao vivo). */

import { useEffect, useState } from "react";
import { useGame } from "./state/useGame.js";
import { xpForNext, overallBase } from "./engine/constants.js";
import AuthView from "./ui/views/AuthView.jsx";
import HomeView from "./ui/views/HomeView.jsx";
import SquadView from "./ui/views/SquadView.jsx";
import TacticsView from "./ui/views/TacticsView.jsx";
import TrainingView from "./ui/views/TrainingView.jsx";
import MarketView from "./ui/views/MarketView.jsx";
import CompetitionsView from "./ui/views/CompetitionsView.jsx";
import ClubView from "./ui/views/ClubView.jsx";
import MatchView from "./ui/views/MatchView.jsx";
import ManagerProfilePage from "./ui/components/ManagerProfile.jsx";
import PlayerPage from "./ui/components/PlayerPage.jsx";
import Emblem from "./ui/components/Emblem.jsx";
import PreMatchModal from "./ui/components/PreMatchModal.jsx";
import { Bar, Btn, PosBadge, Talent } from "./ui/components/bits.jsx";
import { fmtMoney, overallColor } from "./ui/helpers.js";
import { YOU } from "./engine/competitions.js";
import { userCupMatch, userActiveCup, cupRoundDue, cupRoundName, fmtTime } from "./engine/realtime.js";
import { CUP_REG_WINDOW_MS } from "./engine/constants.js";

const TABS = [
  ["inicio", "🏠", "Início"],
  ["plantel", "👥", "Plantel"],
  ["taticas", "📋", "Táticas"],
  ["treino", "🏋️", "Evolução"],
  ["mercado", "🔁", "Mercado"],
  ["competicoes", "🏆", "Taças"],
  ["clube", "🏟️", "Clube"],
];

const useClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return now;
};

export default function App() {
  const { game, actions, auth, notice } = useGame();
  const [tab, setTab] = useState("inicio");
  const [reveal, setReveal] = useState(false);
  const [preMatch, setPreMatch] = useState(null); // {kind, cupId?} — ecrã de envio de equipa
  const [profileOf, setProfileOf] = useState(null); // nome do clube → PÁGINA de perfil (estilo 11x11)
  const [playerPage, setPlayerPage] = useState(null); // {playerId} (teu) | {player, owner} (de outro manager / agente livre)
  const now = useClock();
  const prepareMatch = (kind, opts = {}) => setPreMatch({ kind, ...opts });

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg font-bold text-[#8a9077]">⚽ A ligar ao servidor…</p>
      </div>
    );
  }

  if (auth.status === "anon" || !game) {
    return (
      <AuthView
        auth={auth}
        actions={{
          login: actions.login,
          register: async (data) => {
            const ok = await actions.register(data);
            if (ok) setReveal(true);
          },
        }}
      />
    );
  }

  if (game.live) {
    return (
      <div className="min-h-screen">
        <MatchView game={game} actions={actions} onDone={() => setTab("inicio")} />
      </div>
    );
  }

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-2 pb-8 pt-2">
      {/* topo: relógio + marca */}
      <div className="mb-1 flex items-end justify-between px-1">
        <div className="flex items-end gap-3">
          <div className="rounded-md bg-[#2e5d1a] px-3 py-1 font-mono text-lg font-bold text-[#c9f3a8] shadow">{clock}</div>
          <p className="text-2xl font-black leading-none tracking-tight">
            <span className="text-[#5da814]">On</span><span className="text-[#3a4030]">ze</span>
            <span className="ml-2 align-middle text-[10px] font-normal text-[#8a9077]">manager de futebol online</span>
          </p>
        </div>
        <button onClick={actions.logout} className="text-xs text-[#8a9077] underline hover:text-[#c0392b]">
          Sair 🚪
        </button>
      </div>

      {/* barra verde de navegação */}
      <nav className="nav-green flex overflow-x-auto rounded-t-lg shadow">
        {TABS.map(([k, icon, label]) => (
          <button
            key={k}
            onClick={() => { setProfileOf(null); setPlayerPage(null); setTab(k); }}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-sm font-bold text-white transition ${tab === k && !profileOf && !playerPage ? "bg-black/20 shadow-inner" : "hover:bg-white/10"}`}
            style={{ textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>

      {/* corpo: sidebar + conteúdo */}
      <div className="grid gap-2 rounded-b-lg bg-[#f4f5ec] p-2 shadow sm:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-2">
          <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Emblem emblem={game.club.emblem} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#3d7a0e]">{game.club.name} <span className="font-normal text-[#8a9077]">[{game.club.level}]</span></p>
                <p className="truncate text-[10px] text-[#9aa08e]">🟢 online</p>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-[#8a9077]">
                <span>Nível {game.club.level}</span>
                <span className="font-mono">{game.club.xp}/{xpForNext(game.club.level)} XP</span>
              </div>
              <Bar value={game.club.xp} max={xpForNext(game.club.level)} />
            </div>
            <table className="mt-2 w-full text-xs">
              <tbody>
                <SideStat icon="💰" label="Dinheiro" value={fmtMoney(game.club.money)} warn={game.club.money < 0} />
                <SideStat icon="🧬" label="Exp" value={game.club.totalXp ?? 0} />
                <SideStat icon="🙌" label="Adeptos" value={(game.club.fans ?? 100).toLocaleString("pt-PT")} />
                <SideStat icon="😀" label="Moral" value={`${Math.round(game.club.morale)}%`} />
                <SideStat icon="🏆" label="Troféus" value={game.account.trophies.length} />
                <SideStat icon="⚽" label="V-E-D" value={`${game.account.wins}-${game.account.draws}-${game.account.losses}`} />
              </tbody>
            </table>
          </div>
          <MatchAlert game={game} now={now} onPrepare={prepareMatch} />
          <div className="box-cream rounded-lg p-2.5 text-[11px] leading-relaxed text-[#6b6427]">
            <b>💡 Como funciona:</b> inscreve-te numa taça (uma de cada vez) e aparece à hora: 4 min para registar a equipa, senão é 3-0 por falta de comparência. Se ambos registarem cedo, a ronda seguinte começa logo. Os jogadores evoluem com os jogos!
          </div>
        </aside>

        <main className="min-w-0">
          {playerPage ? (
            <PlayerPage
              game={game}
              actions={actions}
              page={playerPage}
              onBack={() => setPlayerPage(null)}
              onShowProfile={(name) => { setPlayerPage(null); setProfileOf(name); }}
              onGoTraining={() => { setPlayerPage(null); setProfileOf(null); setTab("treino"); }}
            />
          ) : profileOf ? (
            <ManagerProfilePage
              clubName={profileOf}
              onBack={() => setProfileOf(null)}
              onShowPlayer={(player) => setPlayerPage({ player, owner: profileOf })}
            />
          ) : (
            <>
              {tab === "inicio" && <HomeView game={game} actions={actions} now={now} onPrepareMatch={prepareMatch} />}
              {tab === "plantel" && <SquadView game={game} actions={actions} onShowPlayer={(id) => setPlayerPage({ playerId: id })} />}
              {tab === "taticas" && <TacticsView game={game} actions={actions} />}
              {tab === "treino" && <TrainingView game={game} actions={actions} />}
              {tab === "mercado" && <MarketView game={game} actions={actions} onShowPlayer={(player) => setPlayerPage({ player, owner: null })} />}
              {tab === "competicoes" && <CompetitionsView game={game} actions={actions} now={now} onPrepareMatch={prepareMatch} onShowProfile={setProfileOf} />}
              {tab === "clube" && <ClubView game={game} actions={actions} />}
            </>
          )}
        </main>
      </div>

      {preMatch && (
        <PreMatchModal
          game={game}
          actions={actions}
          pre={preMatch}
          onClose={() => setPreMatch(null)}
          onPlay={() => {
            if (preMatch.kind === "taca") actions.registerAndPlay(preMatch.cupId);
            else actions.startMatch("amigavel");
            setPreMatch(null);
          }}
        />
      )}
      {notice && (
        <button
          onClick={actions.dismissNotice}
          className={`onze-pop fixed inset-x-0 bottom-4 z-50 mx-auto block max-w-md rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ${notice.kind === "erro" ? "border border-[#e8b4ae] bg-[#fdeeec] text-[#c0392b]" : "box-cream text-[#6b6427]"}`}
        >
          {notice.text}
          <span className="ml-2 text-[10px] font-normal opacity-60">(toca para fechar)</span>
        </button>
      )}
      {reveal && <SquadReveal game={game} onClose={() => setReveal(false)} />}
    </div>
  );
}

/* Alerta permanente na sidebar: sabes SEMPRE se tens jogo e quanto tempo resta. */
const MatchAlert = ({ game, now, onPrepare }) => {
  const ts = now.getTime();
  const oppOf = (cup, m) => cup.info?.[m.h === YOU ? m.a : m.h];

  // 1) jogo jogável AGORA (janela aberta)
  for (const cup of game.cups) {
    const m = cup.state === "decorrer" ? userCupMatch(cup, ts) : null;
    if (m) {
      const opp = oppOf(cup, m);
      const deadline = cupRoundDue(cup) + (cup.regWindowMs ?? CUP_REG_WINDOW_MS);
      return (
        <div className="onze-flash rounded-lg border-2 border-[#c0392b] bg-[#fdeeec] p-2.5 shadow">
          <p className="text-xs font-black text-[#c0392b]">⚽ TENS JOGO AGORA!</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[#3a4030]">
            {opp && <Emblem emblem={opp.emblem} size={18} />} {m.h === YOU ? "vs" : "@"} {opp?.name ?? "—"}
            {opp?.isUser && <span className="rounded bg-[#2563eb1a] px-1 text-[9px] font-bold text-[#2563eb]">REAL</span>}
          </p>
          <p className="text-[11px] text-[#6b7261]">{cup.icon} {cupRoundName(cup.roundIdx)} · até às {fmtTime(deadline)} <b className="font-mono text-[#c0392b]">({cd(deadline - ts)})</b></p>
          <Btn className="mt-1.5 w-full !py-1 text-xs" onClick={() => onPrepare("taca", { cupId: cup.id })}>
            Enviar equipa ⚽
          </Btn>
        </div>
      );
    }
  }

  // 2) à espera: taça viva (ronda futura ou inscrição)
  const active = userActiveCup(game);
  if (active) {
    if (active.state === "inscricao") {
      return (
        <div className="box-cream rounded-lg p-2.5 text-[11px] text-[#6b6427]">
          ⏱ {active.icon} <b>{active.name}</b><br />
          sorteio às <b>{fmtTime(active.startsAt)}</b> <span className="font-mono">({cd(active.startsAt - ts)})</span>
        </div>
      );
    }
    const due = cupRoundDue(active);
    const m = active.rounds?.[active.roundIdx]?.find((x) => x.h === YOU || x.a === YOU);
    const opp = m ? oppOf(active, m) : null;
    if (m && ts < due) {
      return (
        <div className="box-cream rounded-lg p-2.5 text-[11px] text-[#6b6427]">
          ⏱ {active.icon} <b>{cupRoundName(active.roundIdx)}</b> {opp && <>· {m.h === YOU ? "vs" : "@"} <b>{opp.name}</b></>}<br />
          registo abre às <b>{fmtTime(due)}</b> <span className="font-mono">({cd(due - ts)})</span>
        </div>
      );
    }
    return (
      <div className="box-cream rounded-lg p-2.5 text-[11px] text-[#6b6427]">
        {active.icon} <b>{active.name}</b> —{" "}
        {active.registered ? "equipa enviada ✓, à espera do adversário…" : "à espera do fecho da ronda…"}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#d9dcc8] bg-white p-2.5 text-[11px] text-[#8a9077]">
      Sem taça ativa — inscreve-te em <b>🏆 Taças</b>.
    </div>
  );
};

const cd = (ms) => {
  if (ms <= 0) return "agora";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

const SideStat = ({ icon, label, value, warn }) => (
  <tr className="border-t border-[#eef0e4]">
    <td className="py-1 pr-1">{icon}</td>
    <td className="py-1 text-[#8a9077]">{label}:</td>
    <td className={`py-1 text-right font-bold ${warn ? "text-[#c0392b]" : "text-[#d97706]"}`}>{value}</td>
  </tr>
);

/* Revelação do plantel inicial — o momento "abrir o pack". */
const SquadReveal = ({ game, onClose }) => {
  const sorted = [...game.players].sort((a, b) => b.talent - a.talent);
  const best = sorted[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="onze-pop max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#c9cdb6] bg-white p-4 shadow-2xl">
        <h2 className="text-center text-xl font-black text-[#4f7a12]">O plantel do {game.club.name}!</h2>
        <p className="mb-3 text-center text-xs text-[#8a9077]">
          {best.talent >= 7
            ? `🌟 Sorte grande — ${best.name} tem talento ${best.talent}!`
            : "Um plantel humilde… o talento constrói-se com jogos, academia e mercado."}
        </p>
        <div className="flex flex-col gap-1">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${p.talent >= 7 ? "onze-flash box-cream" : "bg-[#f6f7ef]"}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span>{p.flag}</span>
              <PosBadge pos={p.pos} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
              <Talent t={p.talent} />
              <b style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-center">
          <Btn onClick={onClose}>Começar a jogar ⚽</Btn>
        </div>
      </div>
    </div>
  );
};
