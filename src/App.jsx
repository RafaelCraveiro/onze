/* Touchline — app raiz: jogo ONLINE (login/registo → jogo → jogo ao vivo). */

import { useEffect, useState } from "react";
import { useGame } from "./state/useGame.js";
import { xpForNext, overallBase } from "./engine/constants.js";
import AuthView from "./ui/views/AuthView.jsx";
import HomeView from "./ui/views/HomeView.jsx";
import SquadView from "./ui/views/SquadView.jsx";
import TacticsView from "./ui/views/TacticsView.jsx";
import LeagueView from "./ui/views/LeagueView.jsx";
import MarketView from "./ui/views/MarketView.jsx";
import CompetitionsView from "./ui/views/CompetitionsView.jsx";
import ClubView from "./ui/views/ClubView.jsx";
import MatchView from "./ui/views/MatchView.jsx";
import ManagerProfilePage from "./ui/components/ManagerProfile.jsx";
import PlayerPage from "./ui/components/PlayerPage.jsx";
import Emblem from "./ui/components/Emblem.jsx";
import PreMatchModal from "./ui/components/PreMatchModal.jsx";
import { House, ListOrdered, Users, ClipboardList, ArrowLeftRight, Trophy, Building2, LogOut } from "lucide-react";
import { Bar, Btn, PosBadge, Talent } from "./ui/components/bits.jsx";
import { fmtMoney, overallColor } from "./ui/helpers.js";
import { YOU } from "./engine/competitions.js";
import { userCupMatch, userActiveCup, cupRoundDue, cupRoundName, fmtTime } from "./engine/realtime.js";
import { CUP_REG_WINDOW_MS } from "./engine/constants.js";

const TABS = [
  ["inicio", House, "Início"],
  ["liga", ListOrdered, "Liga"],
  ["plantel", Users, "Plantel"],
  ["taticas", ClipboardList, "Táticas"],
  ["mercado", ArrowLeftRight, "Mercado"],
  ["competicoes", Trophy, "Taças"],
  ["clube", Building2, "Clube"],
];

const Logo = () => (
  <p className="font-display px-3 text-[2.6rem] font-bold uppercase leading-none tracking-tight">
    <span className="text-[var(--accent)]">Touch</span>line
  </p>
);

const HeadStat = ({ label, value }) => (
  <div className="text-right">
    <p className="tnum text-sm font-bold leading-tight">{value}</p>
    <p className="text-[10px] text-[var(--t3)]">{label}</p>
  </div>
);

const HowItWorks = ({ className = "" }) => (
  <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-[var(--t2)] ${className}`}>
    <p className="mb-1 font-semibold text-[var(--t1)]">Como funciona</p>
    A liga joga-se sozinha, mesmo offline, com o teu último onze. Nas taças do teu escalão tens de aparecer à hora: 4 min para enviar a equipa, senão é 3-0. Os jogadores evoluem a jogar, recebem salário e têm contrato.
  </div>
);

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
  const [profileOf, setProfileOf] = useState(null); // nome do clube → PÁGINA de perfil
  const [playerPage, setPlayerPage] = useState(null); // {playerId} (teu) | {player, owner} (de outro manager / agente livre)
  const now = useClock();
  const prepareMatch = (kind, opts = {}) => setPreMatch({ kind, ...opts });
  const goTo = (k) => { setProfileOf(null); setPlayerPage(null); setTab(k); };

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold text-[var(--t3)]">A ligar ao servidor…</p>
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
    <div className="min-h-screen pb-24 lg:pb-8 lg:pl-60">
      {/* navegação lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--line)] bg-[var(--surface)] p-4 lg:flex">
        <Logo />
        <nav className="mt-7 flex flex-1 flex-col gap-1">
          {TABS.map(([k, Icon, label]) => {
            const on = tab === k && !profileOf && !playerPage;
            return (
              <button key={k} onClick={() => goTo(k)} aria-current={on ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${on ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--t2)] hover:bg-[var(--s2)] hover:text-[var(--t1)]"}`}>
                <Icon size={18} strokeWidth={2.2} />{label}
              </button>
            );
          })}
        </nav>
        <button onClick={actions.logout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--t3)] transition hover:bg-[var(--s2)] hover:text-[var(--danger)]">
          <LogOut size={18} />Sair
        </button>
      </aside>

      {/* navegação inferior (telemóvel) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        {TABS.map(([k, Icon, label]) => {
          const on = tab === k && !profileOf && !playerPage;
          return (
            <button key={k} onClick={() => goTo(k)} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${on ? "text-[var(--accent)]" : "text-[var(--t3)]"}`}>
              <Icon size={20} strokeWidth={on ? 2.5 : 2} />{label}
            </button>
          );
        })}
      </nav>

      {/* topo: clube e números principais */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <Emblem emblem={game.club.emblem} size={38} />
          <div className="min-w-0 flex-1 sm:max-w-56">
            <p className="truncate text-sm font-bold">{game.club.name}</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--accent)]">Nível {game.club.level}</span>
              <Bar value={game.club.xp} max={xpForNext(game.club.level)} className="max-w-24" />
              <span className="tnum hidden text-[10px] text-[var(--t3)] sm:inline">{game.club.xp}/{xpForNext(game.club.level)}</span>
            </div>
          </div>
          <div className="ml-auto hidden items-center gap-5 md:flex">
            <HeadStat label="Adeptos" value={(game.club.fans ?? 100).toLocaleString("pt-PT")} />
            <HeadStat label="Moral" value={`${Math.round(game.club.morale)}%`} />
            <HeadStat label="V-E-D" value={`${game.account.wins}-${game.account.draws}-${game.account.losses}`} />
            <HeadStat label="Troféus" value={game.account.trophies.length} />
          </div>
          <div className={`tnum ml-auto rounded-lg bg-[var(--s2)] px-3 py-1.5 text-sm font-bold md:ml-2 ${game.club.money < 0 ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>{fmtMoney(game.club.money)}</div>
          <span className="tnum hidden font-mono text-xs text-[var(--t3)] sm:inline">{clock}</span>
          <button onClick={actions.logout} aria-label="Sair" className="rounded-lg p-1.5 text-[var(--t3)] hover:text-[var(--danger)] lg:hidden"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <aside className="flex flex-col gap-3 lg:order-last">
          <MatchAlert game={game} now={now} onPrepare={prepareMatch} />
          <HowItWorks className="hidden lg:block" />
        </aside>

        <main className="min-w-0">
          {playerPage ? (
            <PlayerPage
              game={game}
              actions={actions}
              page={playerPage}
              onBack={() => setPlayerPage(null)}
              onShowProfile={(name) => { setPlayerPage(null); setProfileOf(name); }}
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
              {tab === "liga" && <LeagueView game={game} actions={actions} now={now} />}
              {tab === "mercado" && <MarketView game={game} actions={actions} onShowProfile={setProfileOf} onShowPlayer={(player, owner = null) => setPlayerPage({ player, owner })} />}
              {tab === "competicoes" && <CompetitionsView game={game} actions={actions} now={now} onPrepareMatch={prepareMatch} onShowProfile={setProfileOf} />}
              {tab === "clube" && <ClubView game={game} actions={actions} />}
            </>
          )}
        </main>
        <HowItWorks className="lg:hidden" />
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
          className={`onze-pop fixed inset-x-0 bottom-4 z-50 mx-auto block max-w-md rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ${notice.kind === "erro" ? "border border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]" : "box-cream text-[var(--t2)]"}`}
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
        <div className="onze-flash rounded-lg border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-2.5">
          <p className="text-xs font-black text-[var(--danger)]">⚽ TENS JOGO AGORA!</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--t1)]">
            {opp && <Emblem emblem={opp.emblem} size={18} />} {m.h === YOU ? "vs" : "@"} {opp?.name ?? "—"}
            {opp?.isUser && <span className="rounded bg-[var(--info-soft)] px-1 text-[9px] font-bold text-[var(--info)]">REAL</span>}
          </p>
          <p className="text-[11px] text-[var(--t2)]">{cup.icon} {cupRoundName(cup.roundIdx)} · até às {fmtTime(deadline)} <b className="font-mono text-[var(--danger)]">({cd(deadline - ts)})</b></p>
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
        <div className="box-cream rounded-lg p-2.5 text-[11px] text-[var(--t2)]">
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
        <div className="box-cream rounded-lg p-2.5 text-[11px] text-[var(--t2)]">
          ⏱ {active.icon} <b>{cupRoundName(active.roundIdx)}</b> {opp && <>· {m.h === YOU ? "vs" : "@"} <b>{opp.name}</b></>}<br />
          registo abre às <b>{fmtTime(due)}</b> <span className="font-mono">({cd(due - ts)})</span>
        </div>
      );
    }
    return (
      <div className="box-cream rounded-lg p-2.5 text-[11px] text-[var(--t2)]">
        {active.icon} <b>{active.name}</b> —{" "}
        {active.registered ? "equipa enviada ✓, à espera do adversário…" : "à espera do fecho da ronda…"}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2.5 text-[11px] text-[var(--t3)]">
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


/* Revelação do plantel inicial — o momento "abrir o pack". */
const SquadReveal = ({ game, onClose }) => {
  const sorted = [...game.players].sort((a, b) => b.pot - a.pot);
  const best = sorted[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="onze-pop max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2xl">
        <h2 className="text-center text-xl font-black text-[var(--green)]">O plantel do {game.club.name}!</h2>
        <p className="mb-3 text-center text-xs text-[var(--t3)]">
          {best.pot >= 80
            ? `Tens uma joia: ${best.name} pode chegar a ${best.pot}!`
            : "Um plantel humilde. O futuro constrói-se com jogos, academia e mercado."}
        </p>
        <div className="flex flex-col gap-1">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${p.pot >= 80 ? "onze-flash box-cream" : "bg-[var(--s2)]"}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span>{p.flag}</span>
              <PosBadge pos={p.pos} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
              <Talent t={p.pot} />
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
