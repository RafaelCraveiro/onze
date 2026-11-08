/* Ligas: cada época dura 15 dias, igual ao ano do calendário comum.
   Grupos de 10 clubes (managers reais + bots), 18 jornadas, uma a cada 20 horas.
   Não é preciso estar online: joga-se com o último onze guardado.
   No fim: prémios, subidas (2 primeiros) e descidas (2 últimos). */

import { simulateMatch, simQuick } from "../src/engine/match.js";
import { prepareBotTeam } from "../src/engine/team.js";
import { AGE_EPOCH, AGE_MS, HOUR_MS } from "../src/engine/constants.js";
import { synthBot } from "./world.mjs";
import * as club from "./club.mjs";

export const MAX_DIVISION = 4;
const GROUP = 10;
const ROUNDS = 18;
const ROUND_MS = 20 * HOUR_MS;
const PRIZE_BASE = { 1: 12000, 2: 7000, 3: 4000, 4: 2200 };

export const seasonOf = (now) => Math.floor((now - AGE_EPOCH) / AGE_MS);
const seasonStart = (s) => AGE_EPOCH + s * AGE_MS;
const roundDue = (s, r) => seasonStart(s) + 10 * HOUR_MS + r * ROUND_MS;
const botLevelFor = (division) => (MAX_DIVISION - division) * 3 + 1;
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return {}; } };

let db;
let builtSeason = -1;
let nextDue = 0;

export const initLeague = async (database) => {
  db = database;
  builtSeason = -1; nextDue = 0;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY, season INT NOT NULL, division INT NOT NULL, grp INT NOT NULL, closed INT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_leagues_season ON leagues(season);
    CREATE TABLE IF NOT EXISTS league_clubs (
      league_id TEXT, slot INT, kind TEXT, user_id BIGINT, bot_id TEXT, club_name TEXT, emblem TEXT,
      level DOUBLE PRECISION, str DOUBLE PRECISION,
      pts INT NOT NULL DEFAULT 0, w INT NOT NULL DEFAULT 0, d INT NOT NULL DEFAULT 0, l INT NOT NULL DEFAULT 0,
      gf INT NOT NULL DEFAULT 0, ga INT NOT NULL DEFAULT 0,
      PRIMARY KEY (league_id, slot)
    );
    CREATE INDEX IF NOT EXISTS idx_league_clubs_user ON league_clubs(user_id);
    CREATE TABLE IF NOT EXISTS league_fixtures (
      league_id TEXT, round INT, midx INT, home_slot INT, away_slot INT, due_at DOUBLE PRECISION,
      home_score INT, away_score INT, result TEXT,
      PRIMARY KEY (league_id, round, midx)
    );
    CREATE INDEX IF NOT EXISTS idx_league_fixtures_due ON league_fixtures(due_at) WHERE home_score IS NULL;
    CREATE TABLE IF NOT EXISTS league_memo (user_id BIGINT PRIMARY KEY, division INT NOT NULL);
  `);
};

/* calendário todos-contra-todos, a duas voltas */
const roundRobin = (n) => {
  const ids = [...Array(n).keys()];
  const half = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      games.push(r % 2 ? [b, a] : [a, b]);
    }
    half.push(games);
    ids.splice(1, 0, ids.pop());
  }
  return [...half, ...half.map((g) => g.map(([a, b]) => [b, a]))];
};

const createGroup = async (season, division, grp, users) => {
  const id = `s${season}-d${division}-g${grp}`;
  await db.prepare("INSERT INTO leagues (id, season, division, grp) VALUES (?, ?, ?, ?)").run(id, season, division, grp);
  const rngSeed = (season * 7919 + division * 131 + grp * 17) >>> 0;
  const level = botLevelFor(division);
  for (let slot = 0; slot < GROUP; slot++) {
    if (users[slot] != null) {
      const info = await club.userInfoFor(users[slot]);
      await db.prepare("INSERT INTO league_clubs (league_id, slot, kind, user_id, club_name, emblem, level) VALUES (?, ?, 'user', ?, ?, ?, ?)")
        .run(id, slot, users[slot], info.clubName, info.emblem, info.level);
    } else {
      const b = synthBot(level, rngSeed + slot * 991, String(slot + 1));
      await db.prepare("INSERT INTO league_clubs (league_id, slot, kind, bot_id, club_name, emblem, level, str) VALUES (?, ?, 'bot', ?, ?, ?, ?, ?)")
        .run(id, slot, b.id, BOT_NAME(rngSeed, slot), JSON.stringify(b.emblem), b.level, b.str);
    }
  }
  const schedule = roundRobin(GROUP);
  for (let r = 0; r < ROUNDS; r++) {
    for (let m = 0; m < schedule[r].length; m++) {
      await db.prepare("INSERT INTO league_fixtures (league_id, round, midx, home_slot, away_slot, due_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, r, m, schedule[r][m][0], schedule[r][m][1], roundDue(season, r));
    }
  }
  return id;
};

const BOT_TOWNS = ["Vale Verde", "Monte Alto", "Porto Novo", "Serra Azul", "Ribeira", "Costa Brava", "Campo Largo", "Alto Mar", "Vila Sol", "Pedra Branca", "Rio Claro", "Lagoa"];
const BOT_KINDS = ["Atlético", "Sporting", "União", "Académica", "Desportivo", "Recreativo"];
const BOT_NAME = (seed, slot) => `${BOT_KINDS[(seed + slot * 7) % BOT_KINDS.length]} ${BOT_TOWNS[(seed + slot * 3) % BOT_TOWNS.length]}`;

const applyFixture = async (leagueId, f, hs, as) => {
  const upd = (slot, gf, ga) => db.prepare(`UPDATE league_clubs SET pts = pts + ?, w = w + ?, d = d + ?, l = l + ?, gf = gf + ?, ga = ga + ? WHERE league_id = ? AND slot = ?`)
    .run(gf > ga ? 3 : gf === ga ? 1 : 0, gf > ga ? 1 : 0, gf === ga ? 1 : 0, gf < ga ? 1 : 0, gf, ga, leagueId, slot);
  await upd(f.home_slot, hs, as);
  await upd(f.away_slot, as, hs);
};

const playFixture = async (f, clubs, now) => {
  const home = clubs.find((c) => c.slot === f.home_slot), away = clubs.find((c) => c.slot === f.away_slot);
  const seed = (Number(f.due_at) / 1000 + f.midx * 37) >>> 0;
  let hs, as, result = null;
  if (home.kind === "bot" && away.kind === "bot") {
    [hs, as] = simQuick(home.str, away.str);
  } else {
    const teamOf = async (c, s) => (c.kind === "user"
      ? club.buildXITeam(c.user_id, now)
      : prepareBotTeam({ id: c.bot_id, team: c.club_name, str: c.str, level: c.level }, s % 100000));
    result = simulateMatch({ home: await teamOf(home, seed), away: await teamOf(away, seed + 1) });
    [hs, as] = result.score;
    if (home.kind === "user") await club.applyMatchResult(home.user_id, { kind: "liga", isHome: true, result, oppName: away.club_name }, now);
    if (away.kind === "user") await club.applyMatchResult(away.user_id, { kind: "liga", isHome: false, result, oppName: home.club_name }, now);
  }
  await db.prepare("UPDATE league_fixtures SET home_score = ?, away_score = ?, result = ? WHERE league_id = ? AND round = ? AND midx = ?")
    .run(hs, as, result ? JSON.stringify(result) : null, f.league_id, f.round, f.midx);
  await applyFixture(f.league_id, f, hs, as);
};

const playDue = async (upTo, now, where = "") => {
  const due = await db.prepare(`SELECT * FROM league_fixtures WHERE home_score IS NULL AND due_at <= ? ${where} ORDER BY due_at, league_id, midx`).all(upTo);
  const cache = new Map();
  for (const f of due) {
    if (!cache.has(f.league_id)) cache.set(f.league_id, await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(f.league_id));
    await playFixture(f, cache.get(f.league_id), now);
    const fresh = await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(f.league_id);
    cache.set(f.league_id, fresh);
  }
};

const ranking = (clubs) => [...clubs].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.slot - b.slot);

const closeLeague = async (lg, now) => {
  const clubs = ranking(await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(lg.id));
  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    if (c.kind !== "user") continue;
    const rank = i + 1;
    const up = rank <= 2 && lg.division > 1;
    const down = rank >= GROUP - 1 && lg.division < MAX_DIVISION;
    const next = lg.division + (up ? -1 : down ? 1 : 0);
    await db.prepare("INSERT INTO league_memo (user_id, division) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET division = EXCLUDED.division").run(c.user_id, next);
    await club.creditSeasonOutcome(c.user_id, {
      prize: Math.round(PRIZE_BASE[lg.division] * (GROUP + 1 - rank) / GROUP),
      rank, division: lg.division, champion: rank === 1, promoted: up, relegated: down, season: lg.season,
    }, now);
  }
  await db.prepare("UPDATE leagues SET closed = 1 WHERE id = ?").run(lg.id);
};

const buildSeason = async (s, now) => {
  const users = (await db.prepare("SELECT user_id FROM club ORDER BY user_id").all()).map((u) => u.user_id);
  const memo = new Map((await db.prepare("SELECT user_id, division FROM league_memo").all()).map((m) => [m.user_id, m.division]));
  for (let d = 1; d <= MAX_DIVISION; d++) {
    const inDiv = users.filter((u) => (memo.get(u) ?? MAX_DIVISION) === d);
    for (let g = 0; g * GROUP < inDiv.length; g++) await createGroup(s, d, g, inDiv.slice(g * GROUP, (g + 1) * GROUP));
  }
  await db.prepare("DELETE FROM league_fixtures WHERE league_id IN (SELECT id FROM leagues WHERE season < ?)").run(s - 1);
  await db.prepare("DELETE FROM league_clubs WHERE league_id IN (SELECT id FROM leagues WHERE season < ?)").run(s - 1);
  await db.prepare("DELETE FROM leagues WHERE season < ?").run(s - 1);
  void now;
};

/* Chamado no início dos pedidos: fecha épocas, cria a nova e joga as jornadas em atraso. */
export const tickLeague = async (now = Date.now()) => {
  const s = seasonOf(now);
  if (builtSeason !== s) {
    await db.tx(async () => {
      const open = await db.prepare("SELECT * FROM leagues WHERE closed = 0 AND season < ?").all(s);
      if (open.length) {
        await playDue(seasonStart(s), now);
        for (const lg of open) await closeLeague(lg, now);
      }
      const exists = await db.prepare("SELECT id FROM leagues WHERE season = ? LIMIT 1").get(s);
      if (!exists) await buildSeason(s, now);
    });
    builtSeason = s;
    nextDue = 0;
  }
  if (now < nextDue) return;
  await db.tx(async () => {
    await playDue(now, now);
    const row = await db.prepare("SELECT MIN(due_at) AS t FROM league_fixtures WHERE home_score IS NULL").get();
    nextDue = row?.t ?? seasonStart(s + 1);
  });
};

/* Conta nova a meio da época: fica com a vaga de um bot da última divisão. */
export const ensureMember = async (userId, now = Date.now()) => {
  const s = seasonOf(now);
  const inLeague = await db.prepare(`SELECT l.id FROM league_clubs c JOIN leagues l ON l.id = c.league_id WHERE c.user_id = ? AND l.season = ? LIMIT 1`).get(userId, s);
  if (inLeague) return inLeague.id;
  await club.initClubForUser(userId, now);
  const memo = await db.prepare("SELECT division FROM league_memo WHERE user_id = ?").get(userId);
  const division = memo?.division ?? MAX_DIVISION;
  const slot = await db.prepare(`SELECT c.league_id, c.slot FROM league_clubs c JOIN leagues l ON l.id = c.league_id
    WHERE l.season = ? AND l.division = ? AND c.kind = 'bot' ORDER BY l.grp, c.slot LIMIT 1`).get(s, division);
  const info = await club.userInfoFor(userId, now);
  await db.prepare("INSERT INTO league_memo (user_id, division) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING").run(userId, division);
  if (slot) {
    await db.prepare("UPDATE league_clubs SET kind = 'user', user_id = ?, bot_id = NULL, club_name = ?, emblem = ?, level = ?, str = NULL WHERE league_id = ? AND slot = ?")
      .run(userId, info.clubName, info.emblem, info.level, slot.league_id, slot.slot);
    nextDue = 0;
    return slot.league_id;
  }
  const grp = (await db.prepare("SELECT COUNT(*)::int AS n FROM leagues WHERE season = ? AND division = ?").get(s, division)).n;
  const id = await createGroup(s, division, grp, [userId]);
  await playDue(now, now, `AND league_id = '${id}'`);
  nextDue = 0;
  return id;
};

export const leagueFor = async (userId, now = Date.now()) => {
  const id = await ensureMember(userId, now);
  const lg = await db.prepare("SELECT * FROM leagues WHERE id = ?").get(id);
  const clubs = ranking(await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(id));
  const me = clubs.find((c) => Number(c.user_id) === Number(userId));
  const fixtures = await db.prepare("SELECT league_id, round, midx, home_slot, away_slot, due_at, home_score, away_score, result IS NOT NULL AS has_result FROM league_fixtures WHERE league_id = ? ORDER BY round, midx").all(id);
  const nameOf = new Map(clubs.map((c) => [c.slot, c]));
  const row = (f) => ({
    round: f.round, dueAt: Number(f.due_at),
    home: nameOf.get(f.home_slot).club_name, away: nameOf.get(f.away_slot).club_name,
    homeEmblem: safeJSON(nameOf.get(f.home_slot).emblem), awayEmblem: safeJSON(nameOf.get(f.away_slot).emblem),
    score: f.home_score != null ? [f.home_score, f.away_score] : null,
    mine: f.home_slot === me.slot || f.away_slot === me.slot,
    watchable: !!f.has_result && (f.home_slot === me.slot || f.away_slot === me.slot),
  });
  const mine = fixtures.filter((f) => f.home_slot === me.slot || f.away_slot === me.slot).map(row);
  const nextRoundIdx = fixtures.find((f) => f.home_score == null)?.round ?? null;
  return {
    season: lg.season, division: lg.division, maxDivision: MAX_DIVISION, group: lg.grp, rounds: ROUNDS,
    endsAt: seasonStart(lg.season + 1),
    nextRound: nextRoundIdx,
    table: clubs.map((c, i) => ({
      rank: i + 1, name: c.club_name, emblem: safeJSON(c.emblem), isUser: c.kind === "user", me: c.slot === me.slot,
      played: c.w + c.d + c.l, w: c.w, d: c.d, l: c.l, gf: c.gf, ga: c.ga, pts: c.pts,
    })),
    mine,
    roundGames: nextRoundIdx != null ? fixtures.filter((f) => f.round === nextRoundIdx).map(row) : [],
    upTo: 2, downFrom: GROUP - 1,
  };
};

export const leagueMatch = async (userId, round, now = Date.now()) => {
  const id = await ensureMember(userId, now);
  const clubs = await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(id);
  const me = clubs.find((c) => Number(c.user_id) === Number(userId));
  const f = await db.prepare("SELECT * FROM league_fixtures WHERE league_id = ? AND round = ? AND (home_slot = ? OR away_slot = ?)").get(id, round, me.slot, me.slot);
  if (!f?.result) return { error: "jogo-indisponivel" };
  const isHome = f.home_slot === me.slot;
  const opp = clubs.find((c) => c.slot === (isHome ? f.away_slot : f.home_slot));
  return { isHome, result: JSON.parse(f.result), opp: { team: opp.club_name, user: opp.club_name, emblem: safeJSON(opp.emblem), level: opp.level } };
};
