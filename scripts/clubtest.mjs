/* Teste do plantel + economia autoritários (server/club.mjs) em isolamento:
   torneira do mercado, desbloqueio por nível, comprar/vender, construções,
   boosters e migração de contas antigas (saves.data do cliente). */
import { createMemoryDb } from "../server/db.mjs";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: "error" });
const { MARKET_UNLOCK_LEVEL, STARTING_MONEY, buildingCost, overallBase, playerValue } = await server.ssrLoadModule("/src/engine/constants.js");

const db = await createMemoryDb();
await db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, club_name TEXT, emblem TEXT);
  CREATE TABLE saves (user_id INTEGER PRIMARY KEY, data TEXT, updated_at DOUBLE PRECISION);
`);
const club = await import("../server/club.mjs");
await club.initClub(db);

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };
const EMB = JSON.stringify({ shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" });

console.log("\n[1] Criação de conta nova");
await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (1, 'Clube Novo', ?)").run(EMB);
let now = Date.now();
await club.initClubForUser(1, now); // só cria — ainda sem nenhum tick
let g = await club.loadGame(1);
check("dinheiro inicial correto", g.club.money === STARTING_MONEY, `(${g.club.money})`);
check("20 jogadores no plantel inicial", g.players.length === 20, `(${g.players.length})`);
check("todos têm atributos 1-99, potencial e contrato", g.players.every((p) => p.skills.finalizacao >= 1 && p.skills.finalizacao <= 99 && p.pot >= overallBase(p) && p.contract >= 2));
check("nível 1", g.club.level === 1);
check("estádio começa no nível 0 (0 lugares)", g.club.buildings.estadio === 0, `(${g.club.buildings.estadio})`);
check("mercado sem tick ainda não gerou nada", g.market.listings.length === 0);

console.log("\n[2] Agentes livres: 3/dia desde o NÍVEL 1, compráveis logo; sem dono real");
g = await club.tickClub(1, now); // 1º tick — a torneira dispara logo (pedido pelo Rafael: "existe logo de início")
check("1º lote de 3 agentes livres chega já no 1º tick", g.market.listings.length === 3, `(${g.market.listings.length})`);
check("agentes livres não têm vendedor (não pertencem a treinadores reais)", g.market.listings.every((l) => l.seller === undefined));

// compra PERMITIDA no nível 1 (dinheiro à parte — garantimos fundos para o teste)
await db.prepare("UPDATE club SET money = money + 10000 WHERE user_id = 1").run();
g = await club.loadGame(1);
const squadBeforeBuy = g.players.length;
const listing = g.market.listings[0];
const moneyBefore = g.club.money;
const buyOk = await club.buyListing(1, listing.id, now);
check("compra de agente livre aceite JÁ no nível 1", buyOk.ok, JSON.stringify(buyOk));
g = await club.loadGame(1);
check("dinheiro debitado exatamente o preço", g.club.money === moneyBefore - listing.price, `(${g.club.money} vs ${moneyBefore - listing.price})`);
check("plantel cresceu exatamente +1 com a compra", g.players.length === squadBeforeBuy + 1, `(${squadBeforeBuy} → ${g.players.length})`);

const sellBlocked = await club.sellPlayer(1, g.players[0].id, 5000, now);
check(`venda bloqueada abaixo do nível ${MARKET_UNLOCK_LEVEL}`, sellBlocked.error === "mercado-bloqueado", JSON.stringify(sellBlocked));

now += 24 * 60 * 60 * 1000 + 1000; // +1 dia
g = await club.tickClub(1, now);
check("mais 3 agentes chegam ao fim de 1 dia", g.market.listings.length === 5, `(${g.market.listings.length})`);

console.log("\n[3] Venda só depois do nível 3 (subir XP à força para testar)");
await db.exec(`UPDATE club SET level = 3, xp = 0, total_xp = 903 WHERE user_id = 1`); // 100+300+... até nível 3, valor exato não importa aqui
g = await club.tickClub(1, now);
check("nível agora é 3", g.club.level === 3);

const toSell = g.players[0];
const sellOk = await club.sellPlayer(1, toSell.id, 5000, now);
check("colocar à venda aceite", sellOk.ok);
check("jogador marcado para venda", (await club.loadGame(1)).players.find((p) => p.id === toSell.id)?.selling === 5000);
await club.cancelSale(1, toSell.id, now);
check("retirar da venda funciona", (await club.loadGame(1)).players.find((p) => p.id === toSell.id)?.selling === undefined);

const beforeCount = (await club.loadGame(1)).players.length;
await club.releasePlayer(1, toSell.id, now);
check("dispensar reduz o plantel em 1", (await club.loadGame(1)).players.length === beforeCount - 1);

console.log("\n[4] Construções e boosters");
g = await club.loadGame(1);
const lvl0 = g.club.buildings.treino;
const cost = buildingCost(lvl0 + 1);
const moneyBeforeUpgrade = g.club.money;
await db.prepare("UPDATE club SET money = ? WHERE user_id = 1").run(Math.max(g.club.money, cost + 1000));
const upOk = await club.upgradeBuilding(1, "treino", now);
check("melhoria aceite com dinheiro suficiente", upOk.ok, JSON.stringify(upOk));
check("nível do centro de treino subiu", (await club.loadGame(1)).club.buildings.treino === lvl0 + 1);

const gBefore = await club.loadGame(1);
for (const p of gBefore.players) p.fitness = 40;
await club.persistGame(1, gBefore);
await db.prepare("UPDATE club SET money = money + 10000 WHERE user_id = 1").run();
const boostOk = await club.buyBooster(1, "energia", now);
check("booster de energia aceite", boostOk.ok);
check("energia de todo o plantel restaurada", (await club.loadGame(1)).players.every((p) => p.fitness === 100));

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
await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (99, 'Legado FC', ?)").run(EMB);
await db.prepare("INSERT INTO saves (user_id, data, updated_at) VALUES (99, ?, ?)").run(JSON.stringify(legacySave), Date.now());
const migrated = await club.tickClub(99, Date.now());
check("dinheiro migrado corretamente", migrated.club.money === 88000, `(${migrated.club.money})`);
check("nível migrado corretamente", migrated.club.level === 7);
check("jogador legado migrado", migrated.players.some((p) => p.id === "legacy-p1"));
check("registo (V-E-D) migrado", migrated.account.wins === 15 && migrated.account.losses === 5);
check("troféu migrado", migrated.account.trophies.length === 1);
const old = migrated.players.find((p) => p.id === "legacy-p1");
check("jogador antigo convertido para o modelo novo", old.skills.desarme === undefined && old.skills.finalizacao === Math.round(17.5 * 4) && old.pot >= overallBase(old) && old.contract >= 2, JSON.stringify(old.skills));
check("jogador antigo tem valor", playerValue(old) > 0);

console.log("\n[5b] Foco, renovação e salários");
const focusOk = await club.setFocus(1, g.players[1].id, "fisico", now);
check("definir foco aceite", focusOk.ok);
check("foco fica guardado", (await club.loadGame(1)).players.find((p) => p.id === g.players[1].id)?.focus === "fisico");
check("foco inválido recusado", (await club.setFocus(1, g.players[1].id, "voar", now)).error === "atributo-invalido");
await db.prepare("UPDATE club SET money = 900000 WHERE user_id = 1").run();
const before = (await club.loadGame(1)).players.find((p) => p.id === g.players[1].id).contract;
check("renovação aceite", (await club.renewPlayer(1, g.players[1].id, now)).ok);
check("renovação soma épocas", (await club.loadGame(1)).players.find((p) => p.id === g.players[1].id).contract === Math.min(5, before + 2));
const payT = now + 2 * 24 * 60 * 60 * 1000 + 1000;
const m0 = (await club.loadGame(1)).club.money;
const paid = await club.tickClub(1, payT);
check("salários são descontados com o tempo", paid.club.money < m0, `(${m0} → ${paid.club.money})`);
await db.prepare("UPDATE club SET money = 0 WHERE user_id = 1").run();
const broke = await club.tickClub(1, payT + 2 * 24 * 60 * 60 * 1000);
check("sem dinheiro não cria dívida", broke.club.money === 0, `(${broke.club.money})`);

console.log("\n[6] Calendário único de envelhecimento para todo o servidor");
const { AGE_MS, nextAgeBoundary } = await server.ssrLoadModule("/src/engine/constants.js");
const t0 = Date.now();
const B = nextAgeBoundary(t0);
await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (50, 'Ativo FC', ?), (51, 'Ausente FC', ?)").run(EMB, EMB);
check("conta nova fica na próxima data comum", (await club.tickClub(50, t0)).nextAgingAt === B);
await club.tickClub(51, t0);

// conta com o antigo relógio individual: não paga anos passados
const oldClock = t0 - 90 * 24 * 60 * 60 * 1000 + 1;
await db.prepare("UPDATE club SET next_aging_at = ? WHERE user_id = 51").run(oldClock);
const agesOf = async (id) => new Map((await club.loadGame(id)).players.map((p) => [p.id, p.age]));
const ages51 = await agesOf(51);
const realigned = await club.tickClub(51, t0);
check("relógio antigo passa para a data comum", realigned.nextAgingAt === B);
check("relógio antigo não cobra anos em atraso", realigned.players.filter((p) => ages51.has(p.id)).every((p) => p.age === ages51.get(p.id)));

const base50 = await agesOf(50), base51 = await agesOf(51);
const grewBy = async (id, base, years) => {
  const list = (await club.loadGame(id)).players.filter((p) => base.has(p.id));
  return list.length > 0 && list.every((p) => p.age === base.get(p.id) + years);
};
await club.ageWorldIfDue(B + 1000);
check("na data, a conta ativa faz +1 ano", await grewBy(50, base50, 1));
check("na data, a conta que não entrou também faz +1 ano", await grewBy(51, base51, 1));
await club.ageWorldIfDue(B + 2000);
check("repetir na mesma data não envelhece outra vez", await grewBy(50, base50, 1));
await club.ageWorldIfDue(B + 2 * AGE_MS + 1000);
check("duas datas depois: +3 anos na conta ativa", await grewBy(50, base50, 3));
check("duas datas depois: +3 anos na conta ausente, ao mesmo ritmo", await grewBy(51, base51, 3));
await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (52, 'Novato FC', ?)").run(EMB);
check("quem chega depois entra na data seguinte", (await club.tickClub(52, B + 2 * AGE_MS + 2000)).nextAgingAt === B + 3 * AGE_MS);

await server.close();
console.log(fails === 0 ? "\n✅ CLUBE + ECONOMIA OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
