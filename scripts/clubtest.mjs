/* Teste do plantel + economia autoritários (server/club.mjs) em isolamento:
   torneira do mercado, desbloqueio por nível, comprar/vender, construções,
   boosters e migração de contas antigas (saves.data do cliente). */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: "error" });
const { MARKET_UNLOCK_LEVEL, STARTING_MONEY, buildingCost, totalSkill } = await server.ssrLoadModule("/src/engine/constants.js");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, club_name TEXT, emblem TEXT);
  CREATE TABLE saves (user_id INTEGER PRIMARY KEY, data TEXT, updated_at INTEGER);
`);
const club = await import("../server/club.mjs");
club.initClub(db);

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };
const EMB = JSON.stringify({ shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" });

console.log("\n[1] Criação de conta nova");
db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (1, 'Clube Novo', ?)").run(EMB);
let now = Date.now();
club.initClubForUser(1, now); // só cria — ainda sem nenhum tick
let g = club.loadGame(1);
check("dinheiro inicial correto", g.club.money === STARTING_MONEY, `(${g.club.money})`);
check("18 jogadores no plantel inicial", g.players.length === 18, `(${g.players.length})`);
check("nível 1", g.club.level === 1);
check("mercado sem tick ainda não gerou nada", g.market.listings.length === 0);

console.log("\n[2] Mercado: torneira de 3/dia (já corre desde a criação) + bloqueio até ao nível 3");
g = club.tickClub(1, now); // 1º tick — a torneira dispara logo (pedido pelo Rafael: "existe logo de início")
check("1º lote de 3 agentes livres chega já no 1º tick", g.market.listings.length === 3, `(${g.market.listings.length})`);
const buyBlocked = club.buyListing(1, g.market.listings[0].id, now);
check(`compra bloqueada abaixo do nível ${MARKET_UNLOCK_LEVEL}`, buyBlocked.error === "mercado-bloqueado", JSON.stringify(buyBlocked));

now += 24 * 60 * 60 * 1000 + 1000; // +1 dia
g = club.tickClub(1, now);
check("mais 3 agentes chegam ao fim de 1 dia (6 no total)", g.market.listings.length === 6, `(${g.market.listings.length})`);

console.log("\n[3] Compra/venda só depois do nível 3 (subir XP à força para testar)");
db.exec(`UPDATE club SET level = 3, xp = 0, total_xp = 903 WHERE user_id = 1`); // 100+300+... até nível 3, valor exato não importa aqui
g = club.tickClub(1, now);
check("nível agora é 3", g.club.level === 3);
// a academia pode ter gerado jovens durante o salto de +1 dia da secção anterior —
// medimos o crescimento RELATIVO à compra, não um número absoluto fixo.
const squadBeforeBuy = g.players.length;
const listing = g.market.listings[0];
const moneyBefore = g.club.money;
const buyOk = club.buyListing(1, listing.id, now);
check("compra aceite no nível 3", buyOk.ok, JSON.stringify(buyOk));
g = club.loadGame(1);
check("dinheiro debitado exatamente o preço", g.club.money === moneyBefore - listing.price, `(${g.club.money} vs ${moneyBefore - listing.price})`);
check("plantel cresceu exatamente +1 com a compra", g.players.length === squadBeforeBuy + 1, `(${squadBeforeBuy} → ${g.players.length})`);

const toSell = g.players[0];
const sellOk = club.sellPlayer(1, toSell.id, 5000, now);
check("colocar à venda aceite", sellOk.ok);
check("jogador marcado para venda", club.loadGame(1).players.find((p) => p.id === toSell.id)?.selling === 5000);
club.cancelSale(1, toSell.id, now);
check("retirar da venda funciona", club.loadGame(1).players.find((p) => p.id === toSell.id)?.selling === undefined);

const beforeCount = club.loadGame(1).players.length;
club.releasePlayer(1, toSell.id, now);
check("dispensar reduz o plantel em 1", club.loadGame(1).players.length === beforeCount - 1);

console.log("\n[4] Construções e boosters");
g = club.loadGame(1);
const lvl0 = g.club.buildings.treino;
const cost = buildingCost(lvl0 + 1);
const moneyBeforeUpgrade = g.club.money;
db.prepare("UPDATE club SET money = ? WHERE user_id = 1").run(Math.max(g.club.money, cost + 1000));
const upOk = club.upgradeBuilding(1, "treino", now);
check("melhoria aceite com dinheiro suficiente", upOk.ok, JSON.stringify(upOk));
check("nível do centro de treino subiu", club.loadGame(1).club.buildings.treino === lvl0 + 1);

const gBefore = club.loadGame(1);
for (const p of gBefore.players) p.fitness = 40;
club.persistGame(1, gBefore);
db.prepare("UPDATE club SET money = money + 10000 WHERE user_id = 1").run();
const boostOk = club.buyBooster(1, "energia", now);
check("booster de energia aceite", boostOk.ok);
check("energia de todo o plantel restaurada", club.loadGame(1).players.every((p) => p.fitness === 100));

console.log("\n[5] Migração de conta antiga (save.data do cliente pré-refactor)");
const legacySave = {
  club: {
    name: "Legado FC", level: 7, xp: 12, totalXp: 4200, money: 88000, morale: 60, fans: 500,
    buildings: { estadio: 3, treino: 2, medico: 1, academia: 4 },
  },
  players: [{
    id: "legacy-p1", name: "João Legado", nat: "PT", flag: "🇵🇹", pos: "Cf", age: 24, talent: 6,
    skills: { desarme: 10, marcacao: 8, drible: 15, controlo: 14, resistencia: 12, passe: 11, potencia: 18, precisao: 17 },
    fitness: 80, morale: 50, injuryMin: 0, suspension: 0, stats: { games: 20, goals: 10, assists: 3 },
  }],
  lineup: { formation: "4-3-3", starters: ["legacy-p1"] },
  tacticStyle: "ofensivo", trainingFocus: "ataque",
  market: { listings: [], nextDripAt: Date.now() },
  account: { wins: 15, draws: 3, losses: 5, trophies: [{ at: Date.now(), kind: "taca", label: "Taça Antiga", level: 5, icon: "🏆" }], createdAt: Date.now() - 999999 },
  inbox: [{ at: Date.now(), type: "welcome", title: "x", text: "y" }],
  history: [],
};
db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (99, 'Legado FC', ?)").run(EMB);
db.prepare("INSERT INTO saves (user_id, data, updated_at) VALUES (99, ?, ?)").run(JSON.stringify(legacySave), Date.now());
const migrated = club.tickClub(99, Date.now());
check("dinheiro migrado corretamente", migrated.club.money === 88000, `(${migrated.club.money})`);
check("nível migrado corretamente", migrated.club.level === 7);
check("jogador legado migrado", migrated.players.some((p) => p.id === "legacy-p1"));
check("registo (V-E-D) migrado", migrated.account.wins === 15 && migrated.account.losses === 5);
check("troféu migrado", migrated.account.trophies.length === 1);
check("Skl do jogador legado preservado", totalSkill(migrated.players.find((p) => p.id === "legacy-p1")) === 105);

await server.close();
console.log(fails === 0 ? "\n✅ CLUBE + ECONOMIA OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
