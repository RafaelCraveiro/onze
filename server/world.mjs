/* Mundo de managers simulados — PARTILHADO por todo o servidor (uma só cópia
   em memória, não por conta). Usado pelas taças (server/cups.mjs) e pelos
   jogos amigáveis. As posições/força dos bots ficam fixas por processo —
   suficiente para preencher vagas; não precisam de persistência própria. */

import { genWorld } from "../src/engine/generation.js";

export const WORLD = genWorld(20260719);
export const botById = new Map(WORLD.bots.map((b) => [b.id, b]));

export const botsOfLevel = (level, exclude = new Set(), minCount = 8) => {
  let pool = WORLD.bots.filter((b) => b.level === level && !exclude.has(b.id));
  if (pool.length < minCount) pool = WORLD.bots.filter((b) => Math.abs(b.level - level) <= 1 && !exclude.has(b.id));
  if (pool.length < minCount) pool = WORLD.bots.filter((b) => !exclude.has(b.id));
  return pool;
};

export const pickBotNear = (level, rng = Math.random) => {
  const near = WORLD.bots.filter((b) => Math.abs(b.level - level) <= 2);
  const pool = near.length ? near : WORLD.bots;
  return pool[Math.floor(rng() * pool.length)];
};
