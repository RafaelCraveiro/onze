/* Táticas — formação, estilo e escolha do onze (editor partilhado com o pré-jogo). */

import { Section } from "../components/bits.jsx";
import LineupEditor from "../components/LineupEditor.jsx";

export default function TacticsView({ game, actions }) {
  return (
    <div className="flex flex-col gap-3">
      <Section title="O teu onze" right={<span className="text-[11px] text-[var(--t3)]">toca num jogador para o trocar</span>}>
        <LineupEditor game={game} actions={actions} />
      </Section>
    </div>
  );
}
