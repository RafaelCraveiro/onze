/* Geração de jogadores (sub-habilidades estilo 11x11), plantéis, emblemas e mundo. */

import {
  INITIAL_TALENT_WEIGHTS, academyTalentWeights, talentCap,
  RATING_WEIGHTS, SKILLS, lineOf,
} from "./constants.js";
import { playerIdentity, mulberry32, pickFrom } from "./names.js";

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
   totalTarget: Skl alvo (soma das 8). Distribui com o mesmo viés de posição
   usado depois para AVALIAR o jogador (RATING_WEIGHTS, em constants.js),
   respeitando o teto (SKILL_CAP, hoje plano a 25 para todos). */
export const genSubskills = (rng, pos, totalTarget, talent) => {
  const bias = RATING_WEIGHTS[lineOf(pos)];
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

/* ---------- Bots ----------
   Simplificados de propósito: não são "managers" com nome/emblema próprios —
   são literalmente uma conta do sistema que joga os jogos sem adversário
   real e fica com o troféu se ganhar a sério. Gerados na hora (sem pool
   persistente), só precisam de força (derivada do nível) para simular. */
export const BOT_EMBLEM = { shape: "circulo", pattern: "liso", symbol: "🤖", c1: "#64748b", c2: "#f8fafc" };

export const genBot = (rng, level, label = "") => ({
  id: `bot-${Math.floor(rng() * 1e9).toString(36)}`,
  user: "Bot", team: label ? `Bot ${label}` : "Bot", emblem: BOT_EMBLEM,
  level, str: Math.round(72 + level * 4.5 + (rng() - 0.5) * 16),
});

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
