/* Geração de jogadores, plantéis, emblemas e bots. */

import {
  RATING_WEIGHTS, SKILLS, TRAITS, lineOf, overallBase,
} from "./constants.js";
import { playerIdentity, mulberry32, pickFrom } from "./names.js";

let nextId = 1;
export const newId = () => `p${Date.now().toString(36)}${(nextId++).toString(36)}`;

/* ---------- Emblemas ---------- */
export const EMBLEM_SHAPES = ["escudo", "redondo", "circulo", "losango"];
export const EMBLEM_PATTERNS = ["liso", "riscas", "metades", "faixa", "cruz"];
export const EMBLEM_SYMBOLS = ["⚽", "🦁", "🦅", "🐺", "🐉", "👑", "⚡", "🔥", "⭐", "🛡️", "⚓", "🌊"];
export const EMBLEM_COLORS = [
  "#dc2626", "#ea580c", "#f59e0b", "#facc15", "#84cc16", "#16a34a", "#0d9488",
  "#0ea5e9", "#2563eb", "#4f46e5", "#9333ea", "#db2777", "#0f172a", "#f8fafc", "#78716c",
];

export const randomEmblem = (rng) => ({
  shape: pickFrom(rng, EMBLEM_SHAPES),
  pattern: pickFrom(rng, EMBLEM_PATTERNS),
  symbol: pickFrom(rng, EMBLEM_SYMBOLS),
  c1: pickFrom(rng, EMBLEM_COLORS),
  c2: pickFrom(rng, EMBLEM_COLORS),
});

/* ---------- Atributos: os importantes para a posição ficam perto do alvo ---------- */
export const genAttrs = (rng, pos, target) => {
  const w = RATING_WEIGHTS[lineOf(pos)];
  const attrs = {};
  for (const k of SKILLS) {
    const v = w[k] >= 0.2 ? target + (rng() - 0.5) * 12
      : w[k] > 0 ? target * 0.78 + (rng() - 0.5) * 14
      : 6 + rng() * 16;
    attrs[k] = Math.round(Math.max(1, Math.min(99, v)));
  }
  // acerta o conjunto para o valor global ficar no alvo
  const gap = target - overallBase({ pos, skills: attrs });
  for (const k of SKILLS) if (w[k] > 0) attrs[k] = Math.round(Math.max(1, Math.min(99, attrs[k] + gap)));
  return attrs;
};

const rollTraits = (rng, pos) => {
  const pool = Object.entries(TRAITS).filter(([, t]) => t.lines.includes(lineOf(pos))).map(([k]) => k);
  const out = [];
  if (rng() < 0.42) out.push(pickFrom(rng, pool));
  if (rng() < 0.12) { const t = pickFrom(rng, pool); if (!out.includes(t)) out.push(t); }
  return out;
};

const rollPotential = (rng, age, ovr) => {
  const room = age <= 19 ? 26 : age <= 22 ? 16 : age <= 26 ? 7 : 2;
  let gap = rng() * room;
  if (age <= 23 && rng() < 0.04) gap += 12 + rng() * 10; // joia rara
  return Math.round(Math.min(97, ovr + gap));
};

/* ---------- Jogadores ---------- */
export const genPlayer = (rng, pos, { ovr = 48, spread = 12, ageMin = 18, ageMax = 34 } = {}) => {
  const age = ageMin + Math.floor(rng() * (ageMax - ageMin + 1));
  const skills = genAttrs(rng, pos, Math.max(20, Math.round(ovr + (rng() - 0.5) * spread)));
  const id = playerIdentity(rng);
  const p = {
    id: newId(), name: id.name, nat: id.nat, flag: id.flag,
    pos, age, skills, pot: 0, traits: rollTraits(rng, pos), focus: null,
    contract: 2 + Math.floor(rng() * 3),
    fitness: 100, morale: 50, injuryMin: 0, suspension: 0,
    stats: { games: 0, goals: 0, assists: 0 },
  };
  p.pot = rollPotential(rng, age, overallBase(p));
  return p;
};

/* Plantel inicial: 20 jogadores equilibrados por setor. */
export const genInitialSquad = (rng) => {
  const plan = ["Gk", "Gk", "Ld", "Ld", "Cd", "Cd", "Cd", "Rd", "Rd", "Lm", "Cm", "Cm", "Cm", "Rm", "Rm", "Lf", "Cf", "Cf", "Rf", "Cm"];
  return plan.map((pos) => genPlayer(rng, pos, { ovr: 48, spread: 14 }));
};

export const genYouth = (rng, academyLvl) =>
  genPlayer(rng, pickFrom(rng, ["Cd", "Lm", "Cm", "Rm", "Cf"]), { ovr: 34 + academyLvl * 2.2, spread: 8, ageMin: 16, ageMax: 18 });

/* ---------- Bots: uma conta do sistema, com força derivada do nível ---------- */
export const BOT_EMBLEM = { shape: "circulo", pattern: "liso", symbol: "🤖", c1: "#64748b", c2: "#f8fafc" };

export const genBot = (rng, level, label = "") => ({
  id: `bot-${Math.floor(rng() * 1e9).toString(36)}`,
  user: "Bot", team: label ? `Bot ${label}` : "Bot", emblem: BOT_EMBLEM,
  level, str: Math.round(42 + level * 2.6 + (rng() - 0.5) * 8),
});

/* XI sintético de um bot (determinístico por id+dia). */
export const botLineup = (bot, day) => {
  const rng = mulberry32((bot.id.charCodeAt(1) * 7919 + day * 131 + bot.level * 17) >>> 0);
  const plan = ["Gk", "Ld", "Cd", "Cd", "Rd", "Lm", "Cm", "Cm", "Rm", "Cf", "Cf"];
  return plan.map((pos, i) => {
    const idn = playerIdentity(rng);
    return {
      id: `${bot.id}x${i}`, name: idn.name, nat: idn.nat, flag: idn.flag,
      pos, age: 18 + Math.floor(rng() * 16), pot: 70, traits: [],
      skills: genAttrs(rng, pos, Math.max(20, Math.round(bot.str + (rng() - 0.5) * 8))),
      fitness: 88 + Math.floor(rng() * 12), morale: 55, injuryMin: 0, suspension: 0,
      stats: { games: 0, goals: 0, assists: 0 },
    };
  });
};

/* Agente livre no mercado: qualidade cresce devagar com o nível do clube. */
export const genMarketPlayer = (rng, clubLevel) =>
  genPlayer(rng, pickFrom(rng, ["Gk", "Ld", "Cd", "Cd", "Rd", "Lm", "Cm", "Cm", "Rm", "Lf", "Cf", "Cf", "Rf"]), {
    ovr: 47 + clubLevel * 1.8, spread: 12, ageMin: 17, ageMax: 33,
  });
