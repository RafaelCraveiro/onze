/* Ligas: cada época tem o seu relógio, separado do envelhecimento dos jogadores.
   Pirâmide automática (src/engine/pyramid.js): grupos de 12, sem inscrições.
   22 jornadas, uma por dia às 04:00 UTC, jogadas com o último onze guardado. */

import { simulateMatch, simQuick } from "../src/engine/match.js";
import { prepareBotTeam } from "../src/engine/team.js";
import { AGE_EPOCH, AGE_MS, HOUR_MS } from "../src/engine/constants.js";
import { synthBot } from "./world.mjs";
import * as club from "./club.mjs";
import {
  GROUP_SIZE as GROUP, ROUNDS, SEASON_DAYS, PROMOTED, DOWN_RANK, MIN_DIVISIONS, INACTIVE_DAYS, LATE_JOIN_ROUND,
  divisionsFor, botLevelFor, seasonPrize, nextDivision, assignSeason,
} from "../src/engine/pyramid.js";

export const MAX_DIVISION = MIN_DIVISIONS;
const ROUND_MS = 24 * HOUR_MS;
const FIRST_ROUND_MS = 4 * HOUR_MS;
export const SEASON_MS = SEASON_DAYS * ROUND_MS;
const INACTIVE_MS = INACTIVE_DAYS * ROUND_MS;

/* a numeração continua a da época que estava a decorrer quando o relógio foi separado */
const FIRST_SEASON = 20;
const LEAGUE_EPOCH = AGE_EPOCH + FIRST_SEASON * AGE_MS;
export const seasonOf = (now) => FIRST_SEASON + Math.floor((now - LEAGUE_EPOCH) / SEASON_MS);
export const seasonStart = (s) => LEAGUE_EPOCH + (s - FIRST_SEASON) * SEASON_MS;
const roundDue = (s, r) => seasonStart(s) + FIRST_ROUND_MS + r * ROUND_MS;
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
    ALTER TABLE league_memo ADD COLUMN IF NOT EXISTS last_rank INT;
    ALTER TABLE league_memo ADD COLUMN IF NOT EXISTS last_seen DOUBLE PRECISION;
    ALTER TABLE league_clubs ADD COLUMN IF NOT EXISTS late INT NOT NULL DEFAULT 0;
    ALTER TABLE league_fixtures ADD COLUMN IF NOT EXISTS stats TEXT;
    CREATE INDEX IF NOT EXISTS idx_league_fixtures_replay ON league_fixtures(due_at) WHERE result IS NOT NULL;
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

const insertMany = async (head, rowLen, rows) => {
  if (!rows.length) return;
  const row = `(${Array(rowLen).fill("?").join(", ")})`;
  await db.prepare(`${head} VALUES ${rows.map(() => row).join(", ")}`).run(...rows.flat());
};

const clubInfo = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await db.prepare(`SELECT u.id, u.club_name, u.emblem, c.level FROM users u JOIN club c ON c.user_id = u.id WHERE u.id IN (${ids.map(() => "?").join(", ")})`).all(...ids);
  return new Map(rows.map((r) => [Number(r.id), r]));
};

const createGroup = async (season, division, grp, users, info) => {
  const id = `s${season}-d${division}-g${grp}`;
  await db.prepare("INSERT INTO leagues (id, season, division, grp) VALUES (?, ?, ?, ?)").run(id, season, division, grp);
  const rngSeed = (season * 7919 + division * 131 + grp * 17) >>> 0;
  const level = botLevelFor(division);
  const clubs = [];
  for (let slot = 0; slot < GROUP; slot++) {
    if (users[slot] != null) {
      const u = info.get(Number(users[slot]));
      clubs.push([id, slot, "user", users[slot], null, u.club_name, u.emblem, u.level, null]);
    } else {
      const b = synthBot(level, rngSeed + slot * 991, String(slot + 1));
      clubs.push([id, slot, "bot", null, b.id, BOT_NAME(rngSeed, slot), JSON.stringify(b.emblem), b.level, b.str]);
    }
  }
  await insertMany("INSERT INTO league_clubs (league_id, slot, kind, user_id, bot_id, club_name, emblem, level, str)", 9, clubs);
  const schedule = roundRobin(GROUP);
  const fixtures = [];
  for (let r = 0; r < ROUNDS; r++) schedule[r].forEach(([h, a], m) => fixtures.push([id, r, m, h, a, roundDue(season, r)]));
  await insertMany("INSERT INTO league_fixtures (league_id, round, midx, home_slot, away_slot, due_at)", 6, fixtures);
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

/* o que fica para sempre de cada jogo; a repetição 2D (result) só existe na última jornada */
const matchStats = (r) => ({
  possession: r.possession, shots: r.shots, onTarget: r.onTarget, corners: r.corners, fouls: r.fouls, xg: r.xg,
  mvp: r.mvp?.name ?? null,
});

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
  await db.prepare("UPDATE league_fixtures SET home_score = ?, away_score = ?, result = ?, stats = ? WHERE league_id = ? AND round = ? AND midx = ?")
    .run(hs, as, result ? JSON.stringify(result) : null, result ? JSON.stringify(matchStats(result)) : null, f.league_id, f.round, f.midx);
  await applyFixture(f.league_id, f, hs, as);
};

const playDue = async (upTo, now, where = "") => {
  const due = await db.prepare(`SELECT * FROM league_fixtures WHERE home_score IS NULL AND due_at <= ? ${where} ORDER BY due_at, league_id, midx`).all(upTo);
  const cache = new Map();
  for (const f of due) {
    if (!cache.has(f.league_id)) cache.set(f.league_id, await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(f.league_id));
    await playFixture(f, cache.get(f.league_id), now);
  }
  if (due.length) {
    /* todos os grupos têm o mesmo calendário: apaga as repetições anteriores à última jornada jogada */
    const last = await db.prepare("SELECT MAX(due_at) AS t FROM league_fixtures WHERE home_score IS NOT NULL").get();
    await db.prepare("UPDATE league_fixtures SET result = NULL WHERE result IS NOT NULL AND due_at < ?").run(last.t);
  }
};

const ranking = (clubs) => [...clubs].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.slot - b.slot);

/* só contam contas ativas: as abandonadas não podem criar divisões a mais */
const activeCount = async (now) => (await db.prepare(`SELECT COUNT(*)::int AS n FROM club c LEFT JOIN league_memo m ON m.user_id = c.user_id
  WHERE m.last_seen IS NULL OR m.last_seen >= ?`).get(now - INACTIVE_MS)).n;

const closeLeague = async (lg, now, maxDivision) => {
  const clubs = ranking(await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(lg.id));
  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    if (c.kind !== "user") continue;
    const rank = i + 1;
    const next = nextDivision({ division: lg.division, rank, late: !!c.late, maxDivision });
    await db.prepare("INSERT INTO league_memo (user_id, division, last_rank, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET division = EXCLUDED.division, last_rank = EXCLUDED.last_rank")
      .run(c.user_id, next, rank, now);
    await club.creditSeasonOutcome(c.user_id, {
      prize: seasonPrize(lg.division, rank), rank, division: lg.division, champion: rank === 1,
      promoted: next < lg.division, relegated: next > lg.division, season: lg.season,
    }, now);
  }
  await db.prepare("UPDATE leagues SET closed = 1 WHERE id = ?").run(lg.id);
};

const buildSeason = async (s, now) => {
  const ids = (await db.prepare("SELECT user_id FROM club ORDER BY user_id").all()).map((u) => Number(u.user_id));
  const memo = new Map((await db.prepare("SELECT * FROM league_memo").all()).map((m) => [Number(m.user_id), m]));
  const maxDivision = divisionsFor(await activeCount(now));
  const cutoff = now - INACTIVE_MS;
  const active = [];
  for (const id of ids) {
    const m = memo.get(id);
    if (m?.last_seen != null && m.last_seen < cutoff) continue; // inativo: sai da pirâmide
    if (m?.last_seen == null) await db.prepare("INSERT INTO league_memo (user_id, division, last_seen) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET division = EXCLUDED.division, last_seen = EXCLUDED.last_seen").run(id, maxDivision, now);
    active.push({ id, division: Math.min(m?.last_seen == null ? maxDivision : m.division, maxDivision), lastRank: m?.last_rank ?? null });
  }
  const info = await clubInfo(active.map((u) => u.id));
  for (const { division, groups } of assignSeason(active, Math.max(maxDivision, divisionsFor(active.length)))) {
    for (let g = 0; g < groups.length; g++) await createGroup(s, division, g, groups[g], info);
  }
  await db.prepare("DELETE FROM league_fixtures WHERE league_id IN (SELECT id FROM leagues WHERE season < ?)").run(s - 1);
  await db.prepare("DELETE FROM league_clubs WHERE league_id IN (SELECT id FROM leagues WHERE season < ?)").run(s - 1);
  await db.prepare("DELETE FROM leagues WHERE season < ?").run(s - 1);
};

/* Chamado no início dos pedidos: fecha épocas, cria a nova e joga as jornadas em atraso. */
export const tickLeague = async (now = Date.now()) => {
  const s = seasonOf(now);
  if (builtSeason !== s) {
    await db.tx(async () => {
      const open = await db.prepare("SELECT * FROM leagues WHERE closed = 0 AND season < ?").all(s);
      if (open.length) {
        await playDue(seasonStart(s), now);
        const maxDivision = divisionsFor(await activeCount(now));
        for (const lg of open) await closeLeague(lg, now, maxDivision);
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
  const memo = await db.prepare("SELECT * FROM league_memo WHERE user_id = ?").get(userId);
  const maxDivision = divisionsFor(await activeCount(now));
  const away = memo?.last_seen != null && memo.last_seen < now - INACTIVE_MS;
  const wanted = memo?.last_seen == null ? maxDivision : Math.min(maxDivision, memo.division + (away ? 2 : 0));
  await db.prepare("INSERT INTO league_memo (user_id, division, last_seen) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET division = EXCLUDED.division, last_seen = EXCLUDED.last_seen").run(userId, wanted, now);
  const late = Math.floor((now - seasonStart(s) - FIRST_ROUND_MS) / ROUND_MS) + 1 >= LATE_JOIN_ROUND ? 1 : 0;
  const findSlot = (d) => db.prepare(`SELECT c.league_id, c.slot FROM league_clubs c JOIN leagues l ON l.id = c.league_id
    WHERE l.season = ? AND l.division = ? AND c.kind = 'bot' ORDER BY l.grp, c.slot LIMIT 1`).get(s, d);
  const slot = (await findSlot(wanted)) ?? (wanted !== maxDivision ? await findSlot(maxDivision) : null);
  const info = await clubInfo([Number(userId)]);
  const u = info.get(Number(userId));
  if (slot) {
    await db.prepare("UPDATE league_clubs SET kind = 'user', user_id = ?, bot_id = NULL, club_name = ?, emblem = ?, level = ?, str = NULL, late = ? WHERE league_id = ? AND slot = ?")
      .run(userId, u.club_name, u.emblem, u.level, late, slot.league_id, slot.slot);
    nextDue = 0;
    return slot.league_id;
  }
  const grp = (await db.prepare("SELECT COUNT(*)::int AS n FROM leagues WHERE season = ? AND division = ?").get(s, maxDivision)).n;
  const id = await createGroup(s, maxDivision, grp, [userId], info);
  await db.prepare("UPDATE league_clubs SET late = ? WHERE league_id = ? AND user_id = ?").run(late, id, userId);
  await playDue(now, now, `AND league_id = '${id}'`);
  nextDue = 0;
  return id;
};

export const leagueFor = async (userId, now = Date.now()) => {
  const id = await ensureMember(userId, now);
  await db.prepare("UPDATE league_memo SET last_seen = ? WHERE user_id = ?").run(now, userId);
  const lg = await db.prepare("SELECT * FROM leagues WHERE id = ?").get(id);
  const clubs = ranking(await db.prepare("SELECT * FROM league_clubs WHERE league_id = ?").all(id));
  const me = clubs.find((c) => Number(c.user_id) === Number(userId));
  const fixtures = await db.prepare("SELECT league_id, round, midx, home_slot, away_slot, due_at, home_score, away_score, stats, result IS NOT NULL AS has_result FROM league_fixtures WHERE league_id = ? ORDER BY round, midx").all(id);
  const nameOf = new Map(clubs.map((c) => [c.slot, c]));
  const row = (f) => ({
    round: f.round, dueAt: Number(f.due_at),
    home: nameOf.get(f.home_slot).club_name, away: nameOf.get(f.away_slot).club_name,
    homeEmblem: safeJSON(nameOf.get(f.home_slot).emblem), awayEmblem: safeJSON(nameOf.get(f.away_slot).emblem),
    score: f.home_score != null ? [f.home_score, f.away_score] : null,
    mine: f.home_slot === me.slot || f.away_slot === me.slot,
    watchable: !!f.has_result && (f.home_slot === me.slot || f.away_slot === me.slot),
    stats: f.stats ? safeJSON(f.stats) : null,
  });
  const mine = fixtures.filter((f) => f.home_slot === me.slot || f.away_slot === me.slot).map(row);
  const nextRoundIdx = fixtures.find((f) => f.home_score == null)?.round ?? null;
  return {
    season: lg.season, division: lg.division, maxDivision: divisionsFor(await activeCount(now)), group: lg.grp, rounds: ROUNDS,
    endsAt: seasonStart(lg.season + 1),
    nextRound: nextRoundIdx,
    table: clubs.map((c, i) => ({
      rank: i + 1, name: c.club_name, emblem: safeJSON(c.emblem), isUser: c.kind === "user", me: c.slot === me.slot,
      played: c.w + c.d + c.l, w: c.w, d: c.d, l: c.l, gf: c.gf, ga: c.ga, pts: c.pts,
    })),
    mine,
    roundGames: nextRoundIdx != null ? fixtures.filter((f) => f.round === nextRoundIdx).map(row) : [],
    upTo: PROMOTED, downFrom: DOWN_RANK,
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
