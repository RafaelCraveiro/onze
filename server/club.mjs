/* Plantel + economia AUTORITÁRIOS no servidor.
   O cliente já não guarda dinheiro nem jogadores — só vê o que o servidor
   manda. Toda a ação económica (comprar/vender, construir, boosters,
   registar a equipa, aplicar o resultado de um jogo) passa por aqui, e o
   servidor usa as mesmas funções puras do motor (src/engine) que já eram
   testadas no cliente — só muda de onde correm.

   Esquema: club (1 linha/conta), players (N linhas/conta), market (1/conta),
   meta (1/conta — registo, inbox, histórico). O antigo `saves.data` (blob
   do cliente) só é lido UMA VEZ, para migrar contas antigas na primeira
   visita pós-upgrade. */

import {
  STARTING_MONEY, SQUAD_MIN, SQUAD_CAP, BUILDINGS, buildingCost, BOOSTERS,
  TRAIN_BOOST_MS, MARKET_UNLOCK_LEVEL, FORMATIONS, STYLES,
  SKILLS, SKILL_CAP, trainCost, totalSkill, playerValue, lastAgeBoundary,
} from "../src/engine/constants.js";
import { genInitialSquad } from "../src/engine/generation.js";
import { autoPickXI, prepareUserTeam } from "../src/engine/team.js";
import { canBuy, canSell } from "../src/engine/market.js";
import { processTime } from "../src/engine/realtime.js";
import { applyUserResult, pushNews } from "../src/engine/progress.js";

let db;
export const initClub = async (database) => {
  db = database;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS club (
      user_id BIGINT PRIMARY KEY,
      money DOUBLE PRECISION NOT NULL, level DOUBLE PRECISION NOT NULL, xp DOUBLE PRECISION NOT NULL, total_xp DOUBLE PRECISION NOT NULL,
      morale DOUBLE PRECISION NOT NULL, fans DOUBLE PRECISION NOT NULL,
      bld_estadio DOUBLE PRECISION NOT NULL, bld_treino DOUBLE PRECISION NOT NULL, bld_medico DOUBLE PRECISION NOT NULL, bld_academia DOUBLE PRECISION NOT NULL,
      train_boost_until DOUBLE PRECISION NOT NULL DEFAULT 0,
      tactic_style TEXT NOT NULL DEFAULT 'equilibrado', training_focus TEXT NOT NULL DEFAULT 'misto',
      formation TEXT NOT NULL DEFAULT '4-4-2', starters TEXT NOT NULL DEFAULT '[]',
      next_youth_at DOUBLE PRECISION NOT NULL DEFAULT 0, next_aging_at DOUBLE PRECISION NOT NULL DEFAULT 0,
      last_tick DOUBLE PRECISION NOT NULL, last_hourly DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, user_id BIGINT NOT NULL,
      name TEXT, nat TEXT, flag TEXT, pos TEXT, age DOUBLE PRECISION, talent DOUBLE PRECISION,
      skills TEXT NOT NULL, fitness DOUBLE PRECISION NOT NULL, morale DOUBLE PRECISION NOT NULL,
      injury_min DOUBLE PRECISION NOT NULL, suspension DOUBLE PRECISION NOT NULL, stats TEXT NOT NULL, selling DOUBLE PRECISION,
      training_xp DOUBLE PRECISION NOT NULL DEFAULT 0,
      seq INT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_players_user ON players(user_id);
    CREATE INDEX IF NOT EXISTS idx_players_selling ON players(user_id) WHERE selling IS NOT NULL;
    CREATE TABLE IF NOT EXISTS market (
      user_id BIGINT PRIMARY KEY, listings TEXT NOT NULL, next_drip_at DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      user_id BIGINT PRIMARY KEY, account TEXT NOT NULL, inbox TEXT NOT NULL, history TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_clock (
      id INT PRIMARY KEY, aged_until DOUBLE PRECISION NOT NULL
    );
  `);
};

const safeJSON = (s, fallback = {}) => { try { return JSON.parse(s); } catch { return fallback; } };

/* ---------- conversão linha <-> objeto do motor ---------- */
const rowToPlayer = (row) => ({
  id: row.id, name: row.name, nat: row.nat, flag: row.flag, pos: row.pos, age: row.age, talent: row.talent,
  skills: safeJSON(row.skills, {}),
  fitness: row.fitness, morale: row.morale, injuryMin: row.injury_min, suspension: row.suspension,
  stats: safeJSON(row.stats, { games: 0, goals: 0, assists: 0 }),
  trainingXp: row.training_xp ?? 0,
  ...(row.selling != null ? { selling: row.selling } : {}),
});

const identityOf = async (userId) => {
  const u = await db.prepare("SELECT club_name, emblem FROM users WHERE id = ?").get(userId);
  return { clubName: u?.club_name ?? "Clube", emblem: safeJSON(u?.emblem, {}) };
};

// um único INSERT com todas as linhas: cada ida ao Supabase custa tempo de rede
const insertPlayers = async (userId, players) => {
  if (!players.length) return;
  const row = `(${Array(17).fill("?").join(", ")})`;
  const params = players.flatMap((p, seq) => [
    p.id, userId, p.name, p.nat, p.flag, p.pos, p.age, p.talent, JSON.stringify(p.skills ?? {}),
    p.fitness ?? 100, p.morale ?? 0, p.injuryMin ?? 0, p.suspension ?? 0,
    JSON.stringify(p.stats ?? { games: 0, goals: 0, assists: 0 }), p.selling ?? null, Math.max(0, Math.round(p.trainingXp ?? 0)), seq,
  ]);
  await db.prepare(`INSERT INTO players (id, user_id, name, nat, flag, pos, age, talent, skills, fitness, morale, injury_min, suspension, stats, selling, training_xp, seq)
    VALUES ${players.map(() => row).join(", ")}`).run(...params);
};

/* ---------- criação / migração ---------- */
export const hasClub = async (userId) => !!await db.prepare("SELECT user_id FROM club WHERE user_id = ?").get(userId);

const migrateLegacy = async (userId, save, now) => {
  const c = save.club ?? {};
  const b = c.buildings ?? {};
  await db.prepare(`INSERT INTO club (user_id, money, level, xp, total_xp, morale, fans, bld_estadio, bld_treino, bld_medico, bld_academia, train_boost_until, tactic_style, training_focus, formation, starters, next_youth_at, next_aging_at, last_tick, last_hourly)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    userId, Math.round(c.money ?? STARTING_MONEY), c.level ?? 1, Math.floor(c.xp ?? 0), Math.floor(c.totalXp ?? 0),
    c.morale ?? 70, Math.round(c.fans ?? 100), b.estadio ?? 1, b.treino ?? 1, b.medico ?? 1, b.academia ?? 1,
    save.flags?.trainBoostUntil ?? 0, save.tacticStyle ?? "equilibrado", save.trainingFocus ?? "misto",
    save.lineup?.formation ?? "4-4-2", JSON.stringify(save.lineup?.starters ?? []),
    save.nextYouthAt ?? 0, save.nextAgingAt ?? 0, save.lastTick ?? now, save.lastHourly ?? now
  );
  await insertPlayers(userId, save.players ?? []);
  await db.prepare("INSERT INTO market (user_id, listings, next_drip_at) VALUES (?, ?, ?)")
    .run(userId, JSON.stringify(save.market?.listings ?? []), save.market?.nextDripAt ?? now);
  await db.prepare("INSERT INTO meta (user_id, account, inbox, history, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    JSON.stringify({
      wins: save.account?.wins ?? 0, draws: save.account?.draws ?? 0, losses: save.account?.losses ?? 0,
      trophies: save.account?.trophies ?? [], createdAt: save.account?.createdAt ?? save.createdAt ?? now,
    }),
    JSON.stringify(save.inbox ?? []), JSON.stringify(save.history ?? []), save.createdAt ?? now
  );
};

export const initClubForUser = async (userId, now = Date.now()) => {
  if (await hasClub(userId)) return;
  const legacy = await db.prepare("SELECT data FROM saves WHERE user_id = ?").get(userId);
  if (legacy) {
    try { await migrateLegacy(userId, JSON.parse(legacy.data), now); return; } catch { /* cai para criação nova */ }
  }
  const players = genInitialSquad(Math.random);
  const starters = autoPickXI(players, "4-4-2");
  await db.prepare(`INSERT INTO club (user_id, money, level, xp, total_xp, morale, fans, bld_estadio, bld_treino, bld_medico, bld_academia, train_boost_until, tactic_style, training_focus, formation, starters, next_youth_at, next_aging_at, last_tick, last_hourly)
    VALUES (?, ?, 1, 0, 0, 70, 100, 0, 1, 1, 1, 0, 'equilibrado', 'misto', '4-4-2', ?, 0, 0, ?, ?)`)
    .run(userId, STARTING_MONEY, JSON.stringify(starters), now, now);
  await insertPlayers(userId, players);
  await db.prepare("INSERT INTO market (user_id, listings, next_drip_at) VALUES (?, '[]', ?)").run(userId, now);
  await db.prepare("INSERT INTO meta (user_id, account, inbox, history, created_at) VALUES (?, ?, '[]', '[]', ?)").run(
    userId,
    JSON.stringify({ wins: 0, draws: 0, losses: 0, trophies: [], createdAt: now }),
    now
  );
  const meta = await db.prepare("SELECT inbox FROM meta WHERE user_id = ?").get(userId);
  const inbox = safeJSON(meta.inbox, []);
  inbox.unshift({
    at: now, type: "welcome", title: "Bem-vindo!",
    text: "A tua conta está online. As taças do teu nível abrem de 10 em 10 minutos e são partilhadas com outros managers reais — inscreve-te (uma de cada vez!) e aparece à hora dos jogos: tens 4 minutos para registar a equipa, senão perdes 3-0. Os jogadores ganham XP a jogar e tu distribui-lo no treino. Tens 3 agentes livres novos por dia desde já; vender jogadores abre no nível 3. O estádio começa com 0 lugares — constrói-o para ganhares bilheteira.",
  });
  await db.prepare("UPDATE meta SET inbox = ? WHERE user_id = ?").run(JSON.stringify(inbox), userId);
};

/* ---------- carregar / gravar o estado completo ---------- */
export const loadGame = async (userId) => {
  const identity = await identityOf(userId);
  const c = await db.prepare("SELECT * FROM club WHERE user_id = ?").get(userId);
  const players = (await db.prepare("SELECT * FROM players WHERE user_id = ? ORDER BY seq, id").all(userId)).map(rowToPlayer);
  const m = await db.prepare("SELECT * FROM market WHERE user_id = ?").get(userId);
  const meta = await db.prepare("SELECT * FROM meta WHERE user_id = ?").get(userId);
  return {
    club: {
      name: identity.clubName, emblem: identity.emblem,
      level: c.level, xp: c.xp, totalXp: c.total_xp, money: c.money, morale: c.morale, fans: c.fans,
      buildings: { estadio: c.bld_estadio, treino: c.bld_treino, medico: c.bld_medico, academia: c.bld_academia },
    },
    players,
    lineup: { formation: c.formation, starters: safeJSON(c.starters, []) },
    tacticStyle: c.tactic_style,
    trainingFocus: c.training_focus,
    market: { listings: safeJSON(m.listings, []), nextDripAt: m.next_drip_at },
    account: safeJSON(meta.account, { wins: 0, draws: 0, losses: 0, trophies: [], createdAt: Date.now() }),
    inbox: safeJSON(meta.inbox, []),
    history: safeJSON(meta.history, []),
    flags: { trainBoostUntil: c.train_boost_until },
    nextYouthAt: c.next_youth_at, nextAgingAt: c.next_aging_at,
    lastTick: c.last_tick, lastHourly: c.last_hourly,
  };
};

export const persistGame = async (userId, game) => {
  const c = game.club;
  await db.prepare(`UPDATE club SET money=?, level=?, xp=?, total_xp=?, morale=?, fans=?,
    bld_estadio=?, bld_treino=?, bld_medico=?, bld_academia=?, train_boost_until=?,
    tactic_style=?, training_focus=?, formation=?, starters=?, next_youth_at=?, next_aging_at=?, last_tick=?, last_hourly=?
    WHERE user_id=?`).run(
    Math.round(c.money), c.level, Math.floor(c.xp), Math.floor(c.totalXp), c.morale, Math.round(c.fans),
    c.buildings.estadio, c.buildings.treino, c.buildings.medico, c.buildings.academia,
    game.flags?.trainBoostUntil ?? 0, game.tacticStyle, game.trainingFocus,
    game.lineup.formation, JSON.stringify(game.lineup.starters),
    game.nextYouthAt ?? 0, game.nextAgingAt ?? 0, game.lastTick ?? Date.now(), game.lastHourly ?? Date.now(),
    userId
  );
  await db.prepare("DELETE FROM players WHERE user_id = ?").run(userId);
  await insertPlayers(userId, game.players);
  await db.prepare("UPDATE market SET listings = ?, next_drip_at = ? WHERE user_id = ?")
    .run(JSON.stringify(game.market.listings), game.market.nextDripAt ?? Date.now(), userId);
  await db.prepare("UPDATE meta SET account = ?, inbox = ?, history = ? WHERE user_id = ?")
    .run(JSON.stringify(game.account), JSON.stringify(game.inbox), JSON.stringify(game.history), userId);
};

/* ---------- tick de manutenção (energia, mercado, academia, envelhecimento) ---------- */
export const tickClub = async (userId, now = Date.now()) => {
  await initClubForUser(userId, now);
  const game = await loadGame(userId);
  processTime(game, now, Math.random);
  await persistGame(userId, game);
  return game;
};

/* ---------- calendário único: ao passar uma data de aniversário, TODAS as contas são
   processadas de uma vez, para perfis e mercado mostrarem idades certas mesmo de quem
   não entra. Corre no primeiro pedido depois da data (a memória evita idas à base). ---------- */
let worldAgedUntil = 0;
export const ageWorldIfDue = async (now = Date.now()) => {
  const boundary = lastAgeBoundary(now);
  if (worldAgedUntil >= boundary) return;
  const clock = await db.prepare("SELECT aged_until FROM world_clock WHERE id = 1").get();
  if (clock && clock.aged_until >= boundary) { worldAgedUntil = boundary; return; }
  await db.tx(async () => {
    for (const { user_id } of await db.prepare("SELECT user_id FROM club ORDER BY user_id").all()) await tickClub(user_id, now);
    await db.prepare("INSERT INTO world_clock (id, aged_until) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET aged_until = EXCLUDED.aged_until").run(boundary);
  });
};

/* leituras leves (sem tick pesado) para outros módulos do servidor ---------- */
export const userLevel = async (userId, now = Date.now()) => {
  await initClubForUser(userId, now);
  return (await db.prepare("SELECT level FROM club WHERE user_id = ?").get(userId))?.level ?? 1;
};
export const userInfoFor = async (userId, now = Date.now()) => {
  await initClubForUser(userId, now);
  const identity = await identityOf(userId);
  const level = (await db.prepare("SELECT level FROM club WHERE user_id = ?").get(userId))?.level ?? 1;
  return { clubName: identity.clubName, emblem: JSON.stringify(identity.emblem), level };
};

/* ---------- equipa para simular (taças + amigáveis) ---------- */
export const buildXITeam = async (userId, now = Date.now()) => prepareUserTeam(await tickClub(userId, now));

/* ---------- perfil PÚBLICO de um manager (visível por qualquer conta) ----------
   Só informação não sensível: emblema, nível, registo, troféus e plantel
   (sem preços de venda, dinheiro, XP banked nem inbox). */
export const publicProfile = async (userId) => {
  if (!await hasClub(userId)) return null;
  const game = await loadGame(userId);
  return {
    clubName: game.club.name,
    emblem: game.club.emblem,
    level: game.club.level,
    fans: Math.round(game.club.fans ?? 0),
    record: { wins: game.account.wins, draws: game.account.draws, losses: game.account.losses },
    trophies: game.account.trophies ?? [],
    createdAt: game.account.createdAt,
    squad: game.players.map((p) => ({
      name: p.name, nat: p.nat, flag: p.flag, pos: p.pos, age: p.age, talent: p.talent, skills: p.skills,
      fitness: Math.round(p.fitness), morale: Math.round(p.morale ?? 0), stats: p.stats,
    })),
  };
};

/* ---------- aplicar o resultado de um jogo (evolução + XP + dinheiro) ---------- */
export const applyMatchResult = async (userId, { kind, isHome, result, oppName }, now = Date.now()) => {
  const game = await tickClub(userId, now);
  const outcome = applyUserResult(game, { kind, userSide: isHome ? "H" : "A", result, oppName, isHome, forfeit: !!result.forfeit });
  await persistGame(userId, game);
  return outcome;
};

export const creditCupOutcome = async (userId, { prize, isWinner, cupName, cupLevel, cupIcon }, now = Date.now()) => {
  const game = await tickClub(userId, now);
  game.club.money += prize;
  if (isWinner) {
    game.account.trophies.push({ at: now, kind: "taca", label: cupName, level: cupLevel, icon: cupIcon });
    pushNews(game, "trophy", "TAÇA CONQUISTADA! 🏆", `Venceste a ${cupName}! Prémio: ${prize}€. Entra no teu palmarés.`);
  } else {
    pushNews(game, "cup", "Finalista", `Perdeste a final da ${cupName}. Prémio de finalista: ${prize}€.`);
  }
  await persistGame(userId, game);
};

/* ---------- ações económicas (todas re-validadas aqui, nunca no cliente) ---------- */
/* Agentes livres: compráveis desde o NÍVEL 1 (não pertencem a treinadores reais). */
export const buyListing = async (userId, listingId, now = Date.now()) => {
  const game = await tickClub(userId, now);
  const listing = game.market.listings.find((l) => l.id === listingId);
  if (!listing) return { error: "listagem-inexistente" };
  const block = canBuy(game, listing);
  if (block) return { error: "nao-permitido", detail: block };
  game.club.money -= listing.price;
  game.players.push(listing.player);
  game.market.listings = game.market.listings.filter((l) => l.id !== listingId);
  pushNews(game, "transfer", "Contratação", `${listing.player.name} chegou ao clube como agente livre, por ${listing.price}€.`);
  await persistGame(userId, game);
  return { ok: true };
};

/* Pôr à venda no mercado de transferências: só a partir de MARKET_UNLOCK_LEVEL.
   O jogador fica no plantel (ainda jogável) mas visível para todos os outros
   managers em listTransfers — sai só quando alguém o comprar (buyTransfer). */
export const sellPlayer = async (userId, playerId, price, now = Date.now()) => {
  const game = await tickClub(userId, now);
  if (game.club.level < MARKET_UNLOCK_LEVEL) return { error: "mercado-bloqueado" };
  const block = canSell(game);
  if (block) return { error: "nao-permitido", detail: block };
  const p = game.players.find((p) => p.id === playerId);
  if (!p) return { error: "jogador-inexistente" };
  // teto generoso (evita "lavar" dinheiro entre contas com preços absurdos)
  const cap = Math.max(20000, playerValue(p) * 30);
  p.selling = Math.max(50, Math.min(cap, Math.round(price)));
  await persistGame(userId, game);
  return { ok: true };
};

export const cancelSale = async (userId, playerId, now = Date.now()) => {
  const game = await tickClub(userId, now);
  const p = game.players.find((p) => p.id === playerId);
  if (p) delete p.selling;
  await persistGame(userId, game);
  return { ok: true };
};

/* ---------- MERCADO DE TRANSFERÊNCIAS (global, entre managers reais) ----------
   A fonte de verdade de uma listagem é o próprio jogador com `selling` definido.
   Não há comprador simulado: qualquer manager pode comprar o jogador de outro,
   e a transferência move a linha do vendedor para o comprador (o dinheiro passa
   de um para o outro — soma zero). O id da listagem é `${sellerId}:${playerId}`
   (os ids de jogador não contêm ":"). */
const publicPlayer = (p) => ({
  id: p.id, name: p.name, nat: p.nat, flag: p.flag, pos: p.pos, age: p.age,
  talent: p.talent, skills: p.skills, fitness: Math.round(p.fitness),
  morale: Math.round(p.morale ?? 0), stats: p.stats,
  injuryMin: p.injuryMin ?? 0, suspension: p.suspension ?? 0,
});

export const listTransfers = async (buyerId, { pos, limit = 120 } = {}) => {
  const rows = await db.prepare(`
    SELECT p.*, u.club_name AS seller_name, u.emblem AS seller_emblem
    FROM players p JOIN users u ON u.id = p.user_id
    WHERE p.selling IS NOT NULL AND p.user_id != ?
  `).all(buyerId);
  let items = rows.map((row) => {
    const p = rowToPlayer(row);
    return {
      id: `${row.user_id}:${row.id}`,
      sellerName: row.seller_name,
      sellerEmblem: safeJSON(row.seller_emblem, {}),
      price: row.selling,
      player: publicPlayer(p),
    };
  });
  if (pos) items = items.filter((it) => it.player.pos === pos);
  items.sort((a, b) => totalSkill(b.player) - totalSkill(a.player)); // melhores primeiro
  return items.slice(0, Math.max(1, Math.min(200, limit)));
};

export const buyTransfer = async (buyerId, listingId, now = Date.now()) => {
  const sep = String(listingId).indexOf(":");
  if (sep < 0) return { error: "listagem-inexistente" };
  const sellerId = Number(String(listingId).slice(0, sep));
  const playerId = String(listingId).slice(sep + 1);
  if (!Number.isInteger(sellerId) || sellerId === buyerId) return { error: "listagem-inexistente" };

  // valida a listagem contra a fonte de verdade (o jogador do vendedor, com selling)
  const row = await db.prepare("SELECT selling FROM players WHERE user_id = ? AND id = ?").get(sellerId, playerId);
  if (!row || row.selling == null) return { error: "listagem-inexistente" };

  const buyer = await tickClub(buyerId, now);
  if (buyer.players.length >= SQUAD_CAP) return { error: "plantel-cheio" };
  if (buyer.club.money < row.selling) return { error: "dinheiro-insuficiente" };

  const seller = await tickClub(sellerId, now);
  const sp = seller.players.find((x) => x.id === playerId);
  if (!sp || sp.selling == null) return { error: "listagem-inexistente" }; // mudou durante o tick
  if (seller.players.length <= SQUAD_MIN) {
    // vender deixaria o vendedor abaixo do mínimo — retira a listagem em vez de vender
    delete sp.selling;
    await persistGame(sellerId, seller);
    return { error: "listagem-indisponivel" };
  }

  const soldPrice = sp.selling;
  const bought = { ...sp };
  delete bought.selling;

  // sai do vendedor
  seller.players = seller.players.filter((x) => x.id !== playerId);
  seller.lineup.starters = (seller.lineup.starters ?? []).filter((id) => id !== playerId);
  seller.club.money += soldPrice;
  pushNews(seller, "transfer", "Jogador vendido", `${bought.name} foi transferido para ${buyer.club.name} por ${soldPrice}€.`);

  // entra no comprador
  buyer.players.push(bought);
  buyer.club.money -= soldPrice;
  pushNews(buyer, "transfer", "Contratação", `${bought.name} chegou de ${seller.club.name} por ${soldPrice}€.`);

  // ORDEM CRÍTICA: `players.id` é PK global — apagar do vendedor ANTES de inserir
  // no comprador, ou a mesma linha colidiria. Tudo numa transação (atomicidade).
  await db.tx(async () => {
    await persistGame(sellerId, seller);
    await persistGame(buyerId, buyer);
  });
  return { ok: true, player: bought.name, price: soldPrice };
};

export const releasePlayer = async (userId, playerId, now = Date.now()) => {
  const game = await tickClub(userId, now);
  if (game.players.length <= SQUAD_MIN) return { error: "nao-permitido", detail: "Plantel no mínimo." };
  const p = game.players.find((p) => p.id === playerId);
  if (!p) return { error: "jogador-inexistente" };
  game.players = game.players.filter((x) => x.id !== playerId);
  pushNews(game, "squad", "Dispensa", `${p.name} deixou o clube.`);
  await persistGame(userId, game);
  return { ok: true };
};

export const upgradeBuilding = async (userId, key, now = Date.now()) => {
  const game = await tickClub(userId, now);
  const b = BUILDINGS[key];
  if (!b) return { error: "invalido" };
  const lvl = game.club.buildings[key];
  const cost = buildingCost(lvl + 1);
  if (lvl >= b.max) return { error: "nivel-maximo" };
  if (game.club.money < cost) return { error: "dinheiro-insuficiente" };
  game.club.money -= cost;
  game.club.buildings[key] = lvl + 1;
  pushNews(game, "club", "Obra concluída", `${b.label} melhorado para o nível ${lvl + 1}.`);
  await persistGame(userId, game);
  return { ok: true };
};

export const buyBooster = async (userId, key, now = Date.now()) => {
  const game = await tickClub(userId, now);
  const b = BOOSTERS[key];
  if (!b) return { error: "invalido" };
  if (game.club.money < b.price) return { error: "dinheiro-insuficiente" };
  if (key === "treino" && (game.flags.trainBoostUntil ?? 0) > now) return { error: "ja-ativo" };
  game.club.money -= b.price;
  if (key === "energia") for (const p of game.players) p.fitness = 100;
  if (key === "moral") game.club.morale = Math.min(100, game.club.morale + 18);
  if (key === "treino") game.flags.trainBoostUntil = now + TRAIN_BOOST_MS;
  pushNews(game, "boost", b.label, `${b.icon} ${b.desc}`);
  await persistGame(userId, game);
  return { ok: true };
};

export const setLineup = async (userId, { formation, starters }, now = Date.now()) => {
  const game = await tickClub(userId, now);
  if (formation && FORMATIONS[formation]) game.lineup.formation = formation;
  if (Array.isArray(starters)) {
    const owned = new Set(game.players.map((p) => p.id));
    game.lineup.starters = starters.filter((id) => owned.has(id)).slice(0, 11);
  }
  await persistGame(userId, game);
  return { ok: true };
};

export const setStyle = async (userId, style, now = Date.now()) => {
  const game = await tickClub(userId, now);
  if (STYLES[style]) game.tacticStyle = style;
  await persistGame(userId, game);
  return { ok: true };
};

/* Distribuição manual de XP: o treinador escolhe QUAL atributo sobe, gastando
   o XP banked do jogador (ganho a jogar — ver matchTrainingXp em progress.js).
   Custo cresce com o valor atual (trainCost); teto plano SKILL_CAP (=25). */
export const trainSkill = async (userId, playerId, skill, now = Date.now()) => {
  const game = await tickClub(userId, now);
  if (!SKILLS.includes(skill)) return { error: "atributo-invalido" };
  const p = game.players.find((p) => p.id === playerId);
  if (!p) return { error: "jogador-inexistente" };
  const cur = p.skills[skill] ?? 0;
  if (cur >= SKILL_CAP) return { error: "teto-atingido" };
  const cost = trainCost(cur);
  if ((p.trainingXp ?? 0) < cost) return { error: "xp-insuficiente" };
  p.trainingXp -= cost;
  p.skills[skill] = Math.min(SKILL_CAP, Math.floor(cur) + 1);
  await persistGame(userId, game);
  return { ok: true, newValue: p.skills[skill], remainingXp: p.trainingXp };
};
