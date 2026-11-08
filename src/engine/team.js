/* Seleção de onze, validação e preparação de equipas para o simulador. */

import { FORMATIONS, overallAt, lineOf } from "./constants.js";
import { botLineup } from "./generation.js";
import { mulberry32 } from "./names.js";

export const isAvailable = (p) => (p.injuryMin ?? 0) <= 0 && p.suspension <= 0;

/* Escolhe o melhor XI disponível para a formação (guloso por overall no slot). */
export const autoPickXI = (players, formation) => {
  const slots = FORMATIONS[formation];
  const pool = players.filter(isAvailable);
  const used = new Set();
  const xi = [];
  // primeiro passa por posição natural, depois preenche com o que houver
  for (const [pos] of slots) {
    let best = null, bestV = -1;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const v = overallAt(p, pos) + (p.pos === pos ? 1000 : lineOf(p.pos) === lineOf(pos) ? 500 : 0);
      if (v > bestV) { bestV = v; best = p; }
    }
    if (best) { used.add(best.id); xi.push(best.id); }
  }
  return xi;
};

/* Constrói o objeto "team" para simulateMatch a partir do estado do jogador. */
export const prepareUserTeam = (game) => {
  const { players, lineup, club } = game;
  const slots = FORMATIONS[lineup.formation].map(([pos]) => pos);
  const byId = new Map(players.map((p) => [p.id, p]));
  let ids = lineup.starters.filter((id) => byId.has(id) && isAvailable(byId.get(id)));
  if (ids.length < slots.length) {
    const auto = autoPickXI(players, lineup.formation);
    for (const id of auto) if (!ids.includes(id) && ids.length < slots.length) ids.push(id);
  }
  ids = ids.slice(0, slots.length);
  const starters = ids.map((id) => byId.get(id));
  const bench = players.filter((p) => isAvailable(p) && !ids.includes(p.id)).slice(0, 7);
  return {
    name: club.name, players: starters, bench,
    slots: slots.slice(0, starters.length),
    style: game.tacticStyle, morale: club.morale,
    medicoLvl: club.buildings.medico,
  };
};

export const prepareBotTeam = (bot, day) => {
  const players = botLineup(bot, day);
  const rng = mulberry32((day * 977 + bot.id.length * 31) >>> 0);
  const bench = botLineup({ ...bot, id: bot.id + "s" }, day + 1).slice(4, 9);
  return {
    name: bot.team, players, bench,
    slots: players.map((p) => p.pos),
    style: ["defensivo", "equilibrado", "ofensivo", "posse", "pressao", "contra"][Math.floor(rng() * 6)],
    morale: 70, medicoLvl: Math.min(10, 1 + Math.floor(bot.level / 2)),
    botId: bot.id,
  };
};
