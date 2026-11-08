/* Taças MULTI-JOGADOR reais — vivem no SERVIDOR.
   Contas reais do mesmo nível caem no mesmo bracket. O servidor:
   - agenda taças por nível (de 10 em 10 min) e enche vagas com bots ao início
   - recebe a CONFIRMAÇÃO de registo de cada jogador (janela de 4 min; falta = 3-0)
   - constrói a equipa de cada lado a partir do PLANTEL REAL guardado no servidor
     (server/club.mjs) — nunca confia em nada vindo do cliente
   - SIMULA os jogos com o motor puro (src/engine/match.js)
   - aplica XP/dinheiro/evolução dos jogadores DIRETAMENTE (server/club.mjs),
     assim que cada jogo resolve — nada fica pendente do lado do cliente
   - abre a ronda seguinte assim que todos os jogos da ronda estão feitos
   Processamento LAZY: await tick() corre no início de cada pedido /api/cups*. */

import { simulateMatch } from "../src/engine/match.js";
import { prepareBotTeam } from "../src/engine/team.js";
import {
  CUP_SIZE, CUP_EVERY_MS, CUP_REG_WINDOW_MS, CUP_UPCOMING, cupEntryFee, cupPrize, cupRunnerUp,
} from "../src/engine/constants.js";
import { synthBot } from "./world.mjs";
import * as club from "./club.mjs";

const CUP_ICONS = ["🏆", "🐘", "🦉", "🎯", "🥇", "⚡", "🌟", "🔔"];
const CUP_NAMES = ["ABC", "Elefante", "Coruja", "Relâmpago", "Aurora", "Titã", "Fénix", "Vulcão", "Meteoro", "Colosso"];

let db;
export const initCups = async (database) => {
  db = database;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cups (
      id TEXT PRIMARY KEY, level DOUBLE PRECISION, name TEXT, icon TEXT,
      starts_at DOUBLE PRECISION, round_ms DOUBLE PRECISION, reg_window_ms DOUBLE PRECISION, size INT,
      entry_fee DOUBLE PRECISION, prize DOUBLE PRECISION, runner_up DOUBLE PRECISION,
      state TEXT, round_idx INT, round_due_at DOUBLE PRECISION,
      winner_slot INT, finalist_slot INT, created_at DOUBLE PRECISION
    );
    CREATE INDEX IF NOT EXISTS idx_cups_state ON cups(state);
    CREATE TABLE IF NOT EXISTS cup_entrants (
      cup_id TEXT, slot INT, kind TEXT, user_id BIGINT, bot_id TEXT,
      club_name TEXT, emblem TEXT, level DOUBLE PRECISION, str DOUBLE PRECISION,
      PRIMARY KEY (cup_id, slot)
    );
    CREATE INDEX IF NOT EXISTS idx_cup_entrants_user ON cup_entrants(user_id);
    CREATE TABLE IF NOT EXISTS cup_matches (
      cup_id TEXT, round INT, midx INT,
      home_slot INT, away_slot INT, home_score INT, away_score INT,
      result TEXT, played_at DOUBLE PRECISION,
      PRIMARY KEY (cup_id, round, midx)
    );
    CREATE TABLE IF NOT EXISTS cup_regs (
      cup_id TEXT, round INT, slot INT, registered_at DOUBLE PRECISION,
      PRIMARY KEY (cup_id, round, slot)
    );
  `);
};

/* ---------- acesso ---------- */
const getCupRow = async (id) => await db.prepare("SELECT * FROM cups WHERE id = ?").get(id);
const entrantsOf = async (id) => await db.prepare("SELECT * FROM cup_entrants WHERE cup_id = ? ORDER BY slot").all(id);
const matchesOfRound = async (id, round) => await db.prepare("SELECT * FROM cup_matches WHERE cup_id = ? AND round = ? ORDER BY midx").all(id, round);
const regOf = async (id, round, slot) => await db.prepare("SELECT registered_at FROM cup_regs WHERE cup_id = ? AND round = ? AND slot = ?").get(id, round, slot);
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return {}; } };

const rndFrom = (seed) => {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/* ---------- agendamento ---------- */
export const ensureUpcoming = async (level, now) => {
  const slot0 = Math.floor(now / CUP_EVERY_MS);
  for (let k = 1; k <= CUP_UPCOMING; k++) {
    const startsAt = (slot0 + k) * CUP_EVERY_MS;
    const id = `L${level}-${startsAt}`;
    if (await getCupRow(id)) continue;
    const rng = rndFrom((startsAt / 1000 + level * 7919) >>> 0);
    const name = `Taça ${CUP_NAMES[Math.floor(rng() * CUP_NAMES.length)]}-${100000 + Math.floor(rng() * 900000)}`;
    const icon = CUP_ICONS[Math.floor(rng() * CUP_ICONS.length)];
    await db.prepare(`INSERT INTO cups (id, level, name, icon, starts_at, round_ms, reg_window_ms, size, entry_fee, prize, runner_up, state, round_idx, round_due_at, winner_slot, finalist_slot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inscricao', 0, ?, NULL, NULL, ?)`)
      .run(id, level, name, icon, startsAt, CUP_EVERY_MS / 2, CUP_REG_WINDOW_MS, CUP_SIZE, cupEntryFee(level), cupPrize(level), cupRunnerUp(level), startsAt, now);
  }
};

/* ---------- simulação de um jogo ---------- */
const isReady = async (cup, round, entrant) => entrant.kind === "bot" || !!await regOf(cup.id, round, entrant.slot);

const teamForSlot = async (entrant, seed) =>
  entrant.kind === "bot"
    ? prepareBotTeam({ id: entrant.bot_id, team: entrant.club_name, str: entrant.str, level: entrant.level }, seed % 100000)
    : await club.buildXITeam(entrant.user_id);

const forfeitResult = (score, both = false) => ({
  score, forfeit: true, bothAbsent: both,
  events: [], possession: [50, 50], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0],
  injuries: [], suspensions: [], mvp: null, homeXI: [], awayXI: [],
});

const playMatch = async (cup, round, m, entrants, now) => {
  const home = entrants.find((e) => e.slot === m.home_slot);
  const away = entrants.find((e) => e.slot === m.away_slot);
  const hReady = await isReady(cup, round, home);
  const aReady = await isReady(cup, round, away);
  const windowOver = now >= Number(cup.round_due_at) + Number(cup.reg_window_ms);
  if (!(hReady && aReady) && !windowOver) return false; // ainda dentro da janela

  const seed = (Number(cup.starts_at) / 1000 + round * 131 + m.midx * 17) >>> 0;
  let result, hs, as;
  if (hReady && aReady) {
    const hTeam = await teamForSlot(home, seed);
    const aTeam = await teamForSlot(away, seed + 1);
    result = simulateMatch({ home: hTeam, away: aTeam });
    [hs, as] = result.score;
    if (hs === as) { const homeAdv = rndFrom(seed)() < 0.5; result.penalties = homeAdv ? [4, 3] : [3, 4]; hs += homeAdv ? 1 : 0; as += homeAdv ? 0 : 1; result.score = [hs, as]; }
  } else if (hReady) { hs = 3; as = 0; result = forfeitResult([3, 0]); }
  else if (aReady) { hs = 0; as = 3; result = forfeitResult([0, 3]); }
  else { const ha = rndFrom(seed)() < 0.5; hs = ha ? 3 : 0; as = ha ? 0 : 3; result = forfeitResult([hs, as], true); }

  await db.prepare(`UPDATE cup_matches SET home_score = ?, away_score = ?, result = ?, played_at = ? WHERE cup_id = ? AND round = ? AND midx = ?`)
    .run(hs, as, JSON.stringify(result), now, cup.id, round, m.midx);

  // aplica XP/dinheiro/evolução SERVER-SIDE, uma única vez (guardado por m.result==null acima)
  if (home.kind === "user") await club.applyMatchResult(home.user_id, { kind: "taca", isHome: true, result, oppName: away.club_name }, now);
  if (away.kind === "user") await club.applyMatchResult(away.user_id, { kind: "taca", isHome: false, result, oppName: home.club_name }, now);
  return true;
};

/* ---------- ciclo de vida ---------- */
const startCup = async (cup, _now) => {
  const ents = await entrantsOf(cup.id);
  const rng = rndFrom((Number(cup.starts_at) / 1000) >>> 0);
  let slot = ents.length;
  while (slot < cup.size) {
    // bot gerado na hora — "literalmente uma conta do sistema", sem pool a esgotar
    const b = synthBot(cup.level * 3, Math.floor(rng() * 1e9), String(slot + 1));
    await db.prepare("INSERT INTO cup_entrants (cup_id, slot, kind, bot_id, club_name, emblem, level, str) VALUES (?, ?, 'bot', ?, ?, ?, ?, ?)")
      .run(cup.id, slot, b.id, b.team, JSON.stringify(b.emblem), b.level, b.str);
    slot++;
  }
  const order = [...Array(cup.size).keys()];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let i = 0; i < cup.size; i += 2) {
    await db.prepare("INSERT INTO cup_matches (cup_id, round, midx, home_slot, away_slot) VALUES (?, 0, ?, ?, ?)")
      .run(cup.id, i / 2, order[i], order[i + 1]);
  }
  await db.prepare("UPDATE cups SET state = 'decorrer', round_idx = 0, round_due_at = ? WHERE id = ?").run(Number(cup.starts_at), cup.id);
};

const advanceCup = async (cupRow, now) => {
  let cup = cupRow;
  for (let guard = 0; guard < 8; guard++) {
    cup = await getCupRow(cup.id);
    if (cup.state !== "decorrer" || now < Number(cup.round_due_at)) break;
    const ents = await entrantsOf(cup.id);
    const round = cup.round_idx;
    let allDone = true;
    for (const m of await matchesOfRound(cup.id, round)) {
      if (m.result != null) continue;
      if (!await playMatch(cup, round, m, ents, now)) allDone = false;
    }
    if (!allDone) break;

    const done = await matchesOfRound(cup.id, round);
    const winners = done.map((m) => (m.home_score > m.away_score ? m.home_slot : m.away_slot));
    if (winners.length === 1) {
      const fin = done[0];
      const winner = fin.home_score > fin.away_score ? fin.home_slot : fin.away_slot;
      const finalist = winner === fin.home_slot ? fin.away_slot : fin.home_slot;
      await db.prepare("UPDATE cups SET state = 'fim', winner_slot = ?, finalist_slot = ? WHERE id = ?").run(winner, finalist, cup.id);
      const winEnt = ents.find((e) => e.slot === winner);
      const finEnt = ents.find((e) => e.slot === finalist);
      if (winEnt?.kind === "user") await club.creditCupOutcome(winEnt.user_id, { prize: cup.prize, isWinner: true, cupName: cup.name, cupLevel: cup.level, cupIcon: cup.icon }, now);
      if (finEnt?.kind === "user") await club.creditCupOutcome(finEnt.user_id, { prize: cup.runner_up, isWinner: false, cupName: cup.name, cupLevel: cup.level, cupIcon: cup.icon }, now);
      break;
    }
    for (let i = 0; i < winners.length; i += 2) {
      await db.prepare("INSERT INTO cup_matches (cup_id, round, midx, home_slot, away_slot) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
        .run(cup.id, round + 1, i / 2, winners[i], winners[i + 1]);
    }
    // ronda seguinte abre JÁ (sem esperas)
    await db.prepare("UPDATE cups SET round_idx = ?, round_due_at = ? WHERE id = ?").run(round + 1, now, cup.id);
  }
};

export const tick = async (now = Date.now()) => {
  for (const cup of await db.prepare("SELECT * FROM cups WHERE state = 'inscricao' AND starts_at <= ?").all(now)) await startCup(cup, now);
  for (const cup of await db.prepare("SELECT * FROM cups WHERE state = 'decorrer'").all()) await advanceCup(cup, now);
};

/* ---------- utilizador ---------- */
const mySlotIn = async (cupId, userId) => {
  const r = await db.prepare("SELECT slot FROM cup_entrants WHERE cup_id = ? AND kind = 'user' AND user_id = ?").get(cupId, userId);
  return r ? r.slot : null;
};

const eliminated = async (cupId, roundIdx, slot) => {
  for (let r = roundIdx; r >= 0; r--) {
    const m = await db.prepare("SELECT * FROM cup_matches WHERE cup_id = ? AND round = ? AND (home_slot = ? OR away_slot = ?)").get(cupId, r, slot, slot);
    if (!m) continue;
    if (m.home_score == null) return false;
    const won = m.home_slot === slot ? m.home_score > m.away_score : m.away_score > m.home_score;
    return !won;
  }
  return false;
};

export const userActiveCupId = async (userId) => {
  const rows = await db.prepare(`SELECT c.id, c.state, c.round_idx FROM cups c
    JOIN cup_entrants e ON e.cup_id = c.id
    WHERE e.kind = 'user' AND e.user_id = ? AND c.state IN ('inscricao','decorrer')`).all(userId);
  for (const c of rows) {
    if (c.state === "inscricao") return c.id;
    if (!await eliminated(c.id, c.round_idx, await mySlotIn(c.id, userId))) return c.id;
  }
  return null;
};

/* ---------- serialização ---------- */
const slotId = (slot, mySlot) => (slot === mySlot ? "you" : `s${slot}`);

const serializeCup = async (cup, mySlot, _now) => {
  const ents = await entrantsOf(cup.id);
  const info = {};
  for (const e of ents) info[slotId(e.slot, mySlot)] = { name: e.club_name, emblem: safeJSON(e.emblem), level: e.level, isUser: e.kind === "user" };
  const out = {
    id: cup.id, name: cup.name, icon: cup.icon, level: cup.level, size: cup.size,
    entryFee: cup.entry_fee, prize: cup.prize, runnerUp: cup.runner_up,
    startsAt: Number(cup.starts_at), roundMs: Number(cup.round_ms), regWindowMs: Number(cup.reg_window_ms),
    state: cup.state, roundIdx: cup.round_idx, roundDueAt: Number(cup.round_due_at),
    entrants: ents.map((e) => slotId(e.slot, mySlot)), info,
    enrolled: mySlot != null,
    winner: cup.winner_slot != null ? slotId(cup.winner_slot, mySlot) : null,
    finalist: cup.finalist_slot != null ? slotId(cup.finalist_slot, mySlot) : null,
  };
  if (cup.state !== "inscricao") {
    const rounds = [];
    for (let r = 0; r <= cup.round_idx; r++) {
      const ms = await matchesOfRound(cup.id, r);
      if (!ms.length) break;
      rounds.push(ms.map((m) => ({
        h: slotId(m.home_slot, mySlot), a: slotId(m.away_slot, mySlot),
        score: m.home_score != null ? [m.home_score, m.away_score] : null,
      })));
    }
    out.rounds = rounds;
    if (mySlot != null) {
      out.eliminated = await eliminated(cup.id, cup.round_idx, mySlot);
      out.registered = !!await regOf(cup.id, cup.round_idx, mySlot);
    }
  }
  return out;
};

/* Resultado completo do jogo do utilizador numa ronda (eventos para o 2D). */
export const matchResultFor = async (cupId, round, slot, _now = Date.now()) => {
  const m = await db.prepare("SELECT * FROM cup_matches WHERE cup_id = ? AND round = ? AND (home_slot = ? OR away_slot = ?)").get(cupId, round, slot, slot);
  if (!m) return { resolved: false };
  if (m.result == null) return { resolved: false, registered: !!await regOf(cupId, round, slot) };
  const cup = await getCupRow(cupId);
  const ents = await entrantsOf(cupId);
  const isHome = m.home_slot === slot;
  const opp = ents.find((e) => e.slot === (isHome ? m.away_slot : m.home_slot));
  return {
    resolved: true, isHome, round,
    result: JSON.parse(m.result),
    opp: opp ? { team: opp.club_name, emblem: safeJSON(opp.emblem), level: opp.level, isUser: opp.kind === "user" } : { team: "Adversário", emblem: {}, level: cup.level },
    cup: { id: cup.id, name: cup.name, icon: cup.icon, level: cup.level, prize: cup.prize, runnerUp: cup.runner_up, roundIdx: round, size: cup.size, winner: cup.winner_slot === slot ? "you" : null, finalist: cup.finalist_slot === slot ? "you" : null, state: cup.state },
  };
};

/* ---------- API (endpoints) ---------- */
export const listCups = async (userId, now = Date.now()) => {
  const level = await club.cupTierFor(userId, now);
  await ensureUpcoming(level, now);
  await tick(now);
  const cups = [];
  for (const c of await db.prepare("SELECT * FROM cups WHERE level = ? AND state = 'inscricao' AND starts_at > ? ORDER BY starts_at").all(level, now))
    cups.push(await serializeCup(c, await mySlotIn(c.id, userId), now));
  for (const c of await db.prepare(`SELECT DISTINCT c.* FROM cups c JOIN cup_entrants e ON e.cup_id = c.id
    WHERE e.kind = 'user' AND e.user_id = ? ORDER BY c.starts_at DESC LIMIT 8`).all(userId)) {
    if (!cups.some((x) => x.id === c.id)) cups.push(await serializeCup(c, await mySlotIn(c.id, userId), now));
  }
  return cups;
};

export const enroll = async (userId, cupId, now = Date.now()) => {
  const level = await club.cupTierFor(userId, now);
  await ensureUpcoming(level, now);
  await tick(now);
  const cup = await getCupRow(cupId);
  if (!cup) return { error: "taca-inexistente" };
  if (cup.state !== "inscricao" || now >= Number(cup.starts_at)) return { error: "inscricoes-fechadas" };
  if (cup.level !== level) return { error: "nivel-errado" };
  if (await mySlotIn(cupId, userId) != null) return { error: "ja-inscrito" };
  if (await userActiveCupId(userId)) return { error: "ja-noutra-taca" };
  const ents = await entrantsOf(cupId);
  if (ents.length >= cup.size) return { error: "taca-cheia" };
  const info = await club.userInfoFor(userId, now);
  if (cup.entry_fee > 0) {
    // deduz a inscrição diretamente no clube (mesma via das outras ações económicas)
    const g = await club.tickClub(userId, now);
    if (g.club.money < cup.entry_fee) return { error: "dinheiro-insuficiente" };
    g.club.money -= cup.entry_fee;
    await club.persistGame(userId, g);
  }
  const slot = ents.length;
  await db.prepare("INSERT INTO cup_entrants (cup_id, slot, kind, user_id, club_name, emblem, level) VALUES (?, ?, 'user', ?, ?, ?, ?)")
    .run(cupId, slot, userId, info.clubName, info.emblem, info.level);
  return { ok: true, entryFee: cup.entry_fee, cup: await serializeCup(await getCupRow(cupId), slot, now) };
};

export const registerTeam = async (userId, cupId, now = Date.now()) => {
  await tick(now);
  const cup = await getCupRow(cupId);
  if (!cup || cup.state !== "decorrer") return { error: "sem-jogo" };
  const slot = await mySlotIn(cupId, userId);
  if (slot == null) return { error: "nao-inscrito" };
  const round = cup.round_idx;
  const m = await db.prepare("SELECT * FROM cup_matches WHERE cup_id = ? AND round = ? AND (home_slot = ? OR away_slot = ?)").get(cupId, round, slot, slot);
  if (!m) return { error: "sem-jogo" };
  if (m.result != null) return { error: "ja-jogado" };
  if (now < Number(cup.round_due_at)) return { error: "ainda-nao-abriu" };
  if (now >= Number(cup.round_due_at) + Number(cup.reg_window_ms)) return { error: "janela-fechada" };

  await db.prepare("INSERT INTO cup_regs (cup_id, round, slot, registered_at) VALUES (?, ?, ?, ?) ON CONFLICT (cup_id, round, slot) DO UPDATE SET registered_at = EXCLUDED.registered_at").run(cupId, round, slot, now);
  await advanceCup(await getCupRow(cupId), now); // tenta resolver já (vs bot ou vs humano já registado)
  return { ok: true, ...matchResultFor(cupId, round, slot, now) };
};
