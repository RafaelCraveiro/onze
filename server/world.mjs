/* Bots — simplificados: não há pool persistente de 140 managers com nomes
   próprios. Um bot é literalmente "uma conta do sistema": gerado na hora,
   com força derivada do nível pedido, para preencher vagas de taças ou
   servir de adversário num amigável. Fica com o troféu se ganhar a sério a
   equipas reais — não há mais conceito de identidade a preservar. */

import { genBot } from "../src/engine/generation.js";
import { mulberry32 } from "../src/engine/names.js";

export const synthBot = (level, seed, label = "") => genBot(mulberry32(seed >>> 0), level, label);

// para amigáveis: nível "por perto" do clube (±2), sem pool a escolher — só sorteia o nível.
export const synthBotNear = (level, seed) => {
  const rng = mulberry32(seed >>> 0);
  const delta = Math.floor(rng() * 5) - 2; // -2..+2
  const lvl = Math.max(1, level + delta);
  return genBot(rng, lvl);
};
