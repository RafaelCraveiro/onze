/* Ecrã de jogo ao vivo — envolve o viewer 2D. */

import MatchViewer2D from "../components/MatchViewer2D.jsx";
import { Pill } from "../components/bits.jsx";

const KIND_LABEL = { amigavel: "Jogo amigável", liga: "Jogo da liga", taca: "Jogo da taça" };

export default function MatchView({ game, actions, onDone }) {
  const live = game.live;
  if (!live) return null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <Pill color="#2563eb">{KIND_LABEL[live.kind]}</Pill>
        <p className="text-xs text-[var(--t3)]">adversário: @{live.opp.user} · nível {live.opp.level}</p>
      </div>
      <MatchViewer2D
        live={live}
        club={game.club}
        onFinish={() => { actions.finishMatch(); onDone?.(); }}
      />
    </div>
  );
}
