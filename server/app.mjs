/* API do Onze — contas online com base de dados SQLite.
   - Registo por EMAIL (único) + password encriptada (scrypt)
   - O nome do jogador É o nome do clube (único, sem distinção de maiúsculas)
   - Plantel, dinheiro, mercado, construções e taças são AUTORITÁRIOS no
     servidor (server/club.mjs + server/cups.mjs) — o cliente só vê o que o
     servidor manda; nenhuma ação económica é aceite vinda do cliente sem
     ser revalidada aqui.
   Exporta a app Express para ser usada pelo Vite em dev e pelo index.mjs em produção. */

import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initCups, listCups, enroll, registerTeam, matchResultFor } from "./cups.mjs";
import * as club from "./club.mjs";
import { synthBotNear } from "./world.mjs";
import { simulateMatch } from "../src/engine/match.js";
import { prepareBotTeam } from "../src/engine/team.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(path.join(__dirname, "onze.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    pass_salt TEXT NOT NULL,
    club_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    emblem TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS saves (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

club.initClub(db);
initCups(db);

const hashPass = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
const newToken = () => crypto.randomBytes(32).toString("hex");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const app = express();
app.use(express.json({ limit: "2mb" }));

/* middleware de autenticação por token (Authorization: Bearer …) */
const auth = (req, res, next) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "sem-sessao" });
  const row = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token);
  if (!row) return res.status(401).json({ error: "sessao-invalida" });
  req.userId = row.user_id;
  req.token = token;
  next();
};

/* devolve {error} do club.mjs como resposta HTTP 400, ou aplica res.json(out) */
const reply = (res, out) => (out?.error ? res.status(400).json(out) : res.json(out ?? { ok: true }));

/* ---------- registo: email único + nome de clube único ---------- */
app.post("/api/register", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const clubName = String(req.body?.clubName ?? "").trim();
  const emblem = req.body?.emblem;

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "email-invalido" });
  if (password.length < 6) return res.status(400).json({ error: "password-curta" });
  if (clubName.length < 3 || clubName.length > 26) return res.status(400).json({ error: "clube-invalido" });
  if (!emblem || typeof emblem !== "object") return res.status(400).json({ error: "emblema-invalido" });

  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email))
    return res.status(409).json({ error: "email-existe" });
  if (db.prepare("SELECT id FROM users WHERE club_name = ? COLLATE NOCASE").get(clubName))
    return res.status(409).json({ error: "clube-existe" });

  const salt = crypto.randomBytes(16).toString("hex");
  const info = db.prepare(
    "INSERT INTO users (email, pass_hash, pass_salt, club_name, emblem, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(email, hashPass(password, salt), salt, clubName, JSON.stringify(emblem), Date.now());

  const token = newToken();
  const userId = info.lastInsertRowid;
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, Date.now());
  const game = club.tickClub(userId, Date.now());
  res.json({ token, clubName, email, game });
});

/* ---------- login ---------- */
app.post("/api/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || hashPass(password, user.pass_salt) !== user.pass_hash)
    return res.status(401).json({ error: "credenciais" });

  const token = newToken();
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, user.id, Date.now());
  const game = club.tickClub(user.id, Date.now());
  res.json({ token, clubName: user.club_name, email: user.email, emblem: JSON.parse(user.emblem), game });
});

app.post("/api/logout", auth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.prepare("SELECT email, club_name, emblem FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ error: "conta" });
  res.json({ email: user.email, clubName: user.club_name, emblem: JSON.parse(user.emblem) });
});

/* ---------- estado do clube (plantel + economia — sempre a verdade do servidor) ---------- */
app.get("/api/state", auth, (req, res) => {
  res.json({ game: club.tickClub(req.userId, Date.now()) });
});

/* ---------- perfil público de outro manager (por nome de clube) ---------- */
app.get("/api/profile/:club", auth, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE club_name = ? COLLATE NOCASE").get(String(req.params.club ?? ""));
  const profile = user ? club.publicProfile(user.id) : null;
  if (!profile) return res.status(404).json({ error: "perfil-inexistente" });
  res.json({ profile });
});

app.post("/api/lineup", auth, (req, res) => {
  const { formation, starters } = req.body ?? {};
  reply(res, club.setLineup(req.userId, { formation, starters }, Date.now()));
});
app.post("/api/tactics", auth, (req, res) => {
  reply(res, club.setStyle(req.userId, String(req.body?.style ?? ""), Date.now()));
});

// distribuição manual de XP: sobe UM atributo de UM jogador, gastando o XP banked dele
app.post("/api/squad/:id/train", auth, (req, res) => {
  reply(res, club.trainSkill(req.userId, req.params.id, String(req.body?.skill ?? ""), Date.now()));
});

app.post("/api/market/buy", auth, (req, res) => {
  reply(res, club.buyListing(req.userId, String(req.body?.listingId ?? ""), Date.now()));
});
app.post("/api/market/sell", auth, (req, res) => {
  const price = Number(req.body?.price);
  if (!isFinite(price) || price <= 0) return res.status(400).json({ error: "preco-invalido" });
  reply(res, club.sellPlayer(req.userId, String(req.body?.playerId ?? ""), price, Date.now()));
});
app.post("/api/market/cancel", auth, (req, res) => {
  reply(res, club.cancelSale(req.userId, String(req.body?.playerId ?? ""), Date.now()));
});

/* ---------- mercado de transferências entre managers reais ---------- */
app.get("/api/transfers", auth, (req, res) => {
  const pos = req.query?.pos ? String(req.query.pos) : null;
  res.json({ transfers: club.listTransfers(req.userId, { pos }) });
});
app.post("/api/transfers/buy", auth, (req, res) => {
  reply(res, club.buyTransfer(req.userId, String(req.body?.listingId ?? ""), Date.now()));
});
app.post("/api/squad/release", auth, (req, res) => {
  reply(res, club.releasePlayer(req.userId, String(req.body?.playerId ?? ""), Date.now()));
});
app.post("/api/club/upgrade", auth, (req, res) => {
  reply(res, club.upgradeBuilding(req.userId, String(req.body?.key ?? ""), Date.now()));
});
app.post("/api/club/booster", auth, (req, res) => {
  reply(res, club.buyBooster(req.userId, String(req.body?.key ?? ""), Date.now()));
});

/* ---------- jogo amigável (resolvido de imediato, sem espera) ---------- */
app.post("/api/matches/friendly", auth, (req, res) => {
  const now = Date.now();
  const userTeam = club.buildXITeam(req.userId, now);
  const level = club.userLevel(req.userId, now);
  const oppBot = synthBotNear(level, Math.floor(now / 60000) ^ req.userId);
  const isHome = Math.random() < 0.5;
  const botTeam = prepareBotTeam(oppBot, Math.floor(now / 3600000) % 100000);
  const result = isHome ? simulateMatch({ home: userTeam, away: botTeam }) : simulateMatch({ home: botTeam, away: userTeam });
  club.applyMatchResult(req.userId, { kind: "amigavel", isHome, result, oppName: oppBot.team }, now);
  res.json({
    result, isHome,
    opp: { id: oppBot.id, team: oppBot.team, user: oppBot.user, emblem: oppBot.emblem, level: oppBot.level },
  });
});

/* ---------- taças multi-jogador (servidor autoritário) ---------- */
app.get("/api/cups", auth, (req, res) => {
  res.json({ cups: listCups(req.userId, Date.now()) });
});

app.post("/api/cups/:id/enroll", auth, (req, res) => {
  reply(res, enroll(req.userId, req.params.id, Date.now()));
});

app.post("/api/cups/:id/register", auth, (req, res) => {
  reply(res, registerTeam(req.userId, req.params.id, Date.now()));
});

app.get("/api/cups/:id/match/:round", auth, (req, res) => {
  const round = parseInt(req.params.round, 10) || 0;
  const slotRow = db.prepare("SELECT slot FROM cup_entrants WHERE cup_id = ? AND kind = 'user' AND user_id = ?").get(req.params.id, req.userId);
  if (!slotRow) return res.status(404).json({ error: "nao-inscrito" });
  res.json(matchResultFor(req.params.id, round, slotRow.slot, Date.now()));
});
