/* Teste do MERCADO DE TRANSFERÊNCIAS entre managers reais (server/club.mjs):
   listar as vendas de outros, comprar (mover jogador + dinheiro), e as guardas
   (não comprar o próprio, sem dinheiro, listagem já ida, plantel cheio). */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: "error" });
const { SQUAD_CAP } = await server.ssrLoadModule("/src/engine/constants.js");

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

const now = Date.now();
db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (1, 'Vendedor FC', ?)").run(EMB);
db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (2, 'Comprador SC', ?)").run(EMB);
club.tickClub(1, now);
club.tickClub(2, now);
// vender exige nível 3; dar fundos ao comprador
db.prepare("UPDATE club SET level = 3 WHERE user_id = 1").run();
db.prepare("UPDATE club SET money = 100000 WHERE user_id = 2").run();

console.log("\n[1] Listar: só vê vendas de OUTROS managers");
const seller = club.loadGame(1);
const player = seller.players[5];
const PRICE = 4000;
const sellOk = club.sellPlayer(1, player.id, PRICE, now);
check("pôr à venda aceite (nível 3)", sellOk.ok, JSON.stringify(sellOk));

const forBuyer = club.listTransfers(2, {});
check("o comprador vê o jogador à venda", forBuyer.some((t) => t.player.id === player.id), `(${forBuyer.length} listagens)`);
const listing = forBuyer.find((t) => t.player.id === player.id);
check("listagem traz preço e vendedor", listing?.price === PRICE && listing?.sellerName === "Vendedor FC", JSON.stringify(listing && { price: listing.price, sellerName: listing.sellerName }));
check("id da listagem é sellerId:playerId", listing?.id === `1:${player.id}`, listing?.id);
const forSeller = club.listTransfers(1, {});
check("o vendedor NÃO vê a própria listagem", !forSeller.some((t) => t.player.id === player.id));

console.log("\n[2] Guardas antes da compra");
const selfBuy = club.buyTransfer(1, `1:${player.id}`, now);
check("não se compra o próprio jogador", selfBuy.error === "listagem-inexistente", JSON.stringify(selfBuy));
const ghost = club.buyTransfer(2, `1:nao-existe`, now);
check("listagem inexistente rejeitada", ghost.error === "listagem-inexistente", JSON.stringify(ghost));
db.prepare("UPDATE club SET money = 10 WHERE user_id = 2").run(); // sem dinheiro
const poor = club.buyTransfer(2, listing.id, now);
check("compra sem dinheiro rejeitada", poor.error === "dinheiro-insuficiente", JSON.stringify(poor));
db.prepare("UPDATE club SET money = 100000 WHERE user_id = 2").run();

console.log("\n[3] Compra: move jogador + dinheiro (soma zero)");
const sBefore = club.loadGame(1), bBefore = club.loadGame(2);
const sMoney = sBefore.club.money, bMoney = bBefore.club.money;
const sCount = sBefore.players.length, bCount = bBefore.players.length;
const buy = club.buyTransfer(2, listing.id, now);
check("compra aceite", buy.ok && buy.price === PRICE, JSON.stringify(buy));
const sAfter = club.loadGame(1), bAfter = club.loadGame(2);
check("vendedor recebeu exatamente o preço", sAfter.club.money === sMoney + PRICE, `(${sMoney} → ${sAfter.club.money})`);
check("comprador pagou exatamente o preço", bAfter.club.money === bMoney - PRICE, `(${bMoney} → ${bAfter.club.money})`);
check("vendedor perdeu 1 jogador", sAfter.players.length === sCount - 1, `(${sCount} → ${sAfter.players.length})`);
check("comprador ganhou 1 jogador", bAfter.players.length === bCount + 1, `(${bCount} → ${bAfter.players.length})`);
check("o jogador saiu do vendedor", !sAfter.players.some((p) => p.id === player.id));
check("o jogador entrou no comprador (sem flag de venda)", bAfter.players.some((p) => p.id === player.id && p.selling === undefined));
check("nenhum jogador duplicado (id único global preservado)", bAfter.players.filter((p) => p.id === player.id).length === 1);
check("a listagem desapareceu do mercado", !club.listTransfers(2, {}).some((t) => t.player.id === player.id) && !club.listTransfers(1, {}).some((t) => t.player.id === player.id));

console.log("\n[4] Comprar a mesma listagem duas vezes falha (já foi)");
const twice = club.buyTransfer(2, listing.id, now);
check("segunda compra rejeitada", !!twice.error, JSON.stringify(twice));

console.log("\n[5] Plantel cheio bloqueia a compra");
// enche o comprador até ao teto e tenta comprar outra venda
const seller2 = club.loadGame(1);
const p2 = seller2.players[3];
club.sellPlayer(1, p2.id, 500, now);
let buyer = club.loadGame(2);
while (buyer.players.length < SQUAD_CAP) { buyer.players.push({ ...buyer.players[0], id: `filler-${buyer.players.length}` }); }
club.persistGame(2, buyer);
db.prepare("UPDATE club SET money = 100000 WHERE user_id = 2").run();
const full = club.buyTransfer(2, `1:${p2.id}`, now);
check("compra bloqueada com plantel cheio", full.error === "plantel-cheio", JSON.stringify(full));

await server.close();
console.log(fails === 0 ? "\n✅ MERCADO DE TRANSFERÊNCIAS OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
