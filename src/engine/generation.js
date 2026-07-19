/* Geração de jogadores (sub-habilidades estilo 11x11), plantéis, emblemas e mundo. */

import {
  INITIAL_TALENT_WEIGHTS, academyTalentWeights, talentCap,
  WORLD_BOTS, SKILLS, lineOf,
} from "./constants.js";
import { playerIdentity, clubName, managerName, mulberry32, pickFrom } from "./names.js";

let nextId = 1;
export const newId = () => `p${Date.now().toString(36)}${(nextId++).toString(36)}`;

export const weightedPick = (rng, weights) => {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of weights) {
    r -= w;
    if (r <= 0) return v;
  }
  return weights[weights.length - 1][0];
};

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

/* ---------- Sub-habilidades ----------
   totalTarget: Skl alvo (soma das 8). Distribui com viés da posição, respeitando o teto do talento. */
const POS_BIAS = {
  GR: { desarme: 1.1, marcacao: 1.2, controlo: 1.3, resistencia: 1.2, passe: 0.9, drible: 0.6, potencia: 0.6, precisao: 0.7 },
  DF: { desarme: 1.5, marcacao: 1.5, resistencia: 1.2, controlo: 0.9, passe: 0.9, drible: 0.7, potencia: 0.7, precisao: 0.6 },
  MD: { passe: 1.4, controlo: 1.3, drible: 1.1, resistencia: 1.1, desarme: 0.9, marcacao: 0.8, potencia: 0.8, precisao: 0.8 },
  AV: { potencia: 1.5, precisao: 1.5, drible: 1.2, controlo: 1.1, passe: 0.8, resistencia: 0.9, desarme: 0.5, marcacao: 0.5 },
};

export const genSubskills = (rng, pos, totalTarget, talent) => {
  const bias = POS_BIAS[lineOf(pos)];
  const cap = talentCap(talent);
  const weights = SKILLS.map((s) => bias[s] * (0.75 + rng() * 0.5));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const skills = {};
  for (let i = 0; i < SKILLS.length; i++) {
    skills[SKILLS[i]] = Math.max(1, Math.min(cap, Math.round((totalTarget * weights[i]) / wSum)));
  }
  return skills;
};

/* ---------- Jogadores ---------- */
export const genPlayer = (rng, pos, { talentWeights = INITIAL_TALENT_WEIGHTS, skillLevel = 80, ageMin = 18, ageMax = 35 } = {}) => {
  const talent = weightedPick(rng, talentWeights);
  const age = ageMin + Math.floor(rng() * (ageMax - ageMin + 1));
  const total = Math.max(45, Math.round(skillLevel + (rng() - 0.5) * 40));
  const id = playerIdentity(rng);
  return {
    id: newId(), name: id.name, nat: id.nat, flag: id.flag,
    pos, age, talent,
    skills: genSubskills(rng, pos, total, talent),
    fitness: 100, morale: 0, injuryMin: 0, suspension: 0,
    stats: { games: 0, goals: 0, assists: 0 },
  };
};

/* Plantel inicial: 18 jogadores (3 Gk), Skl ~60–106 como no 11x11, sorte ocasional de um talento 7. */
export const genInitialSquad = (rng) => {
  const plan = ["Gk", "Gk", "Gk", "Ld", "Cd", "Cd", "Rd", "Lm", "Cm", "Cm", "Rm", "Lf", "Cf", "Cf", "Rf", "Cd", "Cm", "Cf"];
  return plan.map((pos) => genPlayer(rng, pos, { skillLevel: 82 }));
};

export const genYouth = (rng, academyLvl) =>
  genPlayer(rng, pickFrom(rng, ["Cd", "Lm", "Cm", "Rm", "Cf"]), {
    talentWeights: academyTalentWeights(academyLvl),
    skillLevel: 55 + academyLvl * 3, ageMin: 16, ageMax: 18,
  });

/* ---------- Mundo de managers simulados ---------- */
export const genWorld = (seed) => {
  const rng = mulberry32(seed);
  const bots = [];
  for (let i = 0; i < WORLD_BOTS; i++) {
    const r = rng();
    const level = r < 0.3 ? 1 : r < 0.5 ? 2 : r < 0.65 ? 3 : r < 0.76 ? 4 : r < 0.84 ? 5 : r < 0.9 ? 6 + Math.floor(rng() * 3) : 9 + Math.floor(rng() * 8);
    bots.push({
      id: `b${i}`,
      user: managerName(rng),
      team: clubName(rng),
      emblem: randomEmblem(rng),
      level,
      xp: Math.floor(rng() * 8),
      // força ≈ Skl médio do plantel para o nível
      str: Math.round(72 + level * 4.5 + (rng() - 0.5) * 16),
      wins: Math.floor(level * (4 + rng() * 6)),
    });
  }
  return { seed, bots };
};

/* XI sintético de um bot (determinístico por id+dia). */
export const botLineup = (bot, day) => {
  const rng = mulberry32((bot.id.charCodeAt(1) * 7919 + day * 131 + bot.level * 17) >>> 0);
  const plan = ["Gk", "Ld", "Cd", "Cd", "Rd", "Lm", "Cm", "Cm", "Rm", "Cf", "Cf"];
  return plan.map((pos, i) => {
    const total = Math.max(45, Math.round(bot.str + (rng() - 0.5) * 20));
    const talent = Math.min(9, 1 + Math.floor(bot.level / 3) + Math.floor(rng() * 3));
    const idn = playerIdentity(rng);
    return {
      id: `${bot.id}x${i}`, name: idn.name, nat: idn.nat, flag: idn.flag,
      pos, age: 18 + Math.floor(rng() * 16), talent,
      skills: genSubskills(rng, pos, total, Math.max(talent, 5)),
      fitness: 88 + Math.floor(rng() * 12), morale: 20, injuryMin: 0, suspension: 0,
      stats: { games: 0, goals: 0, assists: 0 },
    };
  });
};

/* Jogador à venda no mercado (agente livre). Talento 7/8/9 muito raros —
   crescem devagar com o nível de quem os vê, nunca dominam a lista. */
export const genMarketPlayer = (rng, clubLevel) => {
  const talentWeights = [
    [1, 10], [2, 17], [3, 23], [4, 20], [5, 15], [6, 8],
    [7, Math.max(1, Math.floor(clubLevel / 3))],
    [8, Math.max(0, Math.floor((clubLevel - 6) / 3))],
    [9, Math.max(0, Math.floor((clubLevel - 15) / 5))],
  ];
  return genPlayer(rng, pickFrom(rng, ["Gk", "Ld", "Cd", "Cd", "Rd", "Lm", "Cm", "Cm", "Rm", "Lf", "Cf", "Cf", "Rf"]), {
    talentWeights, skillLevel: 72 + clubLevel * 5, ageMin: 17, ageMax: 33,
  });
};
