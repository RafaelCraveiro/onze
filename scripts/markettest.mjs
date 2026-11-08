/* Teste do MERCADO DE TRANSFERÊNCIAS entre managers reais (server/club.mjs):
   listar as vendas de outros, comprar (mover jogador + dinheiro), e as guardas
   (não comprar o próprio, sem dinheiro, listagem já ida, plantel cheio). */
import { createMemoryDb } from "../server/db.mjs";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: "error" });
const { SQUAD_CAP } = await server.ssrLoadModule("/src/engine/constants.js");

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

const now = Date.now();
await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (1, 'Vendedor FC', ?)").run(EMB);
await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (2, 'Comprador SC', ?)").run(EMB);
await club.tickClub(1, now);
await club.tickClub(2, now);
// vender exige nível 3; dar fundos ao comprador
await db.prepare("UPDATE club SET level = 3 WHERE user_id = 1").run();
await db.prepare("UPDATE club SET money = 100000 WHERE user_id = 2").run();

console.log("\n[1] Listar: só vê vendas de OUTROS managers");
const seller = await club.loadGame(1);
const player = seller.players[5];
const PRICE = 4000;
const sellOk = await club.sellPlayer(1, player.id, PRICE, now);
check("pôr à venda aceite (nível 3)", sellOk.ok, JSON.stringify(sellOk));

const forBuyer = await club.listTransfers(2, {});
check("o comprador vê o jogador à venda", forBuyer.some((t) => t.player.id === player.id), `(${forBuyer.length} listagens)`);
const listing = forBuyer.find((t) => t.player.id === player.id);
check("listagem traz preço e vendedor", listing?.price === PRICE && listing?.sellerName === "Vendedor FC", JSON.stringify(listing && { price: listing.price, sellerName: listing.sellerName }));
check("id da listagem é sellerId:playerId", listing?.id === `1:${player.id}`, listing?.id);
const forSeller = await club.listTransfers(1, {});
check("o vendedor NÃO vê a própria listagem", !forSeller.some((t) => t.player.id === player.id));

console.log("\n[2] Guardas antes da compra");
const selfBuy = await club.buyTransfer(1, `1:${player.id}`, now);
check("não se compra o próprio jogador", selfBuy.error === "listagem-inexistente", JSON.stringify(selfBuy));
const ghost = await club.buyTransfer(2, `1:nao-existe`, now);
check("listagem inexistente rejeitada", ghost.error === "listagem-inexistente", JSON.stringify(ghost));
await db.prepare("UPDATE club SET money = 10 WHERE user_id = 2").run(); // sem dinheiro
const poor = await club.buyTransfer(2, listing.id, now);
check("compra sem dinheiro rejeitada", poor.error === "dinheiro-insuficiente", JSON.stringify(poor));
await db.prepare("UPDATE club SET money = 100000 WHERE user_id = 2").run();

console.log("\n[3] Compra: move jogador + dinheiro (soma zero)");
const sBefore = await club.loadGame(1), bBefore = await club.loadGame(2);
const sMoney = sBefore.club.money, bMoney = bBefore.club.money;
const sCount = sBefore.players.length, bCount = bBefore.players.length;
const buy = await club.buyTransfer(2, listing.id, now);
check("compra aceite", buy.ok && buy.price === PRICE, JSON.stringify(buy));
const sAfter = await club.loadGame(1), bAfter = await club.loadGame(2);
check("vendedor recebeu exatamente o preço", sAfter.club.money === sMoney + PRICE, `(${sMoney} → ${sAfter.club.money})`);
check("comprador pagou exatamente o preço", bAfter.club.money === bMoney - PRICE, `(${bMoney} → ${bAfter.club.money})`);
check("vendedor perdeu 1 jogador", sAfter.players.length === sCount - 1, `(${sCount} → ${sAfter.players.length})`);
check("comprador ganhou 1 jogador", bAfter.players.length === bCount + 1, `(${bCount} → ${bAfter.players.length})`);
check("o jogador saiu do vendedor", !sAfter.players.some((p) => p.id === player.id));
check("o jogador entrou no comprador (sem flag de venda)", bAfter.players.some((p) => p.id === player.id && p.selling === undefined));
check("nenhum jogador duplicado (id único global preservado)", bAfter.players.filter((p) => p.id === player.id).length === 1);
check("a listagem desapareceu do mercado", !(await club.listTransfers(2, {})).some((t) => t.player.id === player.id) && !(await club.listTransfers(1, {})).some((t) => t.player.id === player.id));

console.log("\n[4] Comprar a mesma listagem duas vezes falha (já foi)");
const twice = await club.buyTransfer(2, listing.id, now);
check("segunda compra rejeitada", !!twice.error, JSON.stringify(twice));

console.log("\n[5] Plantel cheio bloqueia a compra");
// enche o comprador até ao teto e tenta comprar outra venda
const seller2 = await club.loadGame(1);
const p2 = seller2.players[3];
await club.sellPlayer(1, p2.id, 500, now);
let buyer = await club.loadGame(2);
while (buyer.players.length < SQUAD_CAP) { buyer.players.push({ ...buyer.players[0], id: `filler-${buyer.players.length}` }); }
await club.persistGame(2, buyer);
await db.prepare("UPDATE club SET money = 100000 WHERE user_id = 2").run();
const full = await club.buyTransfer(2, `1:${p2.id}`, now);
check("compra bloqueada com plantel cheio", full.error === "plantel-cheio", JSON.stringify(full));

await server.close();
console.log(fails === 0 ? "\n✅ MERCADO DE TRANSFERÊNCIAS OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
