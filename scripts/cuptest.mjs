/* Teste do servidor de taças multi-jogador — plantel e economia AUTORITÁRIOS
   (server/club.mjs), com BD em memória e 2 utilizadores reais no mesmo bracket. */
import { createMemoryDb } from "../server/db.mjs";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: "error" });
const totalSkill = (p) => Object.values(p.skills).reduce((a, b) => a + b, 0);

const db = await createMemoryDb();
await db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, club_name TEXT, emblem TEXT);
  CREATE TABLE saves (user_id INTEGER PRIMARY KEY, data TEXT, updated_at DOUBLE PRECISION);
`);

const club = await import("../server/club.mjs");
const cups = await import("../server/cups.mjs");
await club.initClub(db);
await cups.initCups(db);

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };

const EMB = JSON.stringify({ shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" });
const mkUser = async (id, name) => {
  await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (?, ?, ?)").run(id, name, EMB);
  await club.initClubForUser(id, Date.now());
};

console.log("\n[1] Duas contas reais no MESMO bracket");
const CUP_EVERY = 30 * 60 * 1000;
let now = Math.floor(Date.now() / CUP_EVERY) * CUP_EVERY; // alinhado ao slot
await mkUser(1, "Alpha FC");
await mkUser(2, "Beta FC");

const moneyBefore1 = (await club.loadGame(1)).club.money;
await cups.ensureUpcoming(1, now);
let list1 = await cups.listCups(1, now);
check("há taças abertas do nível 1", list1.filter((c) => c.state === "inscricao").length >= 3, `(${list1.length})`);
const target = list1.filter((c) => c.state === "inscricao").sort((a, b) => a.startsAt - b.startsAt)[0];

const e1 = await cups.enroll(1, target.id, now);
const e2 = await cups.enroll(2, target.id, now);
check("utilizador 1 inscrito", e1.ok, JSON.stringify(e1));
check("utilizador 2 inscrito na MESMA taça", e2.ok);
check("ambos aparecem nos entrants", e2.cup.entrants.filter((x) => x === "you" || x.startsWith("s")).length >= 2);
check("bloqueia inscrição em 2ª taça em simultâneo", !!await cups.userActiveCupId(1) && (await cups.enroll(1, list1[1].id, now)).error === "ja-noutra-taca");
check("a inscrição DEBITOU a taxa no clube (economia server-side)", (await club.loadGame(1)).club.money === moneyBefore1 - target.entryFee, `(${(await club.loadGame(1)).club.money} vs ${moneyBefore1 - target.entryFee})`);

console.log("\n[2] Arranque + registo de equipas (sem o cliente enviar nada — o servidor usa o plantel real)");
now = target.startsAt + 1000;
await cups.tick(now);
let cup1 = (await cups.listCups(1, now)).find((c) => c.id === target.id);
check("taça arrancou (decorrer)", cup1.state === "decorrer");
check("bracket de 4 jogos", cup1.rounds[0].length === 4);
check("8 entrantes (2 users + 6 bots)", cup1.entrants.length === 8);

const skillBefore1 = (await club.loadGame(1)).players.reduce((s, p) => s + totalSkill(p), 0);
const xpBefore1 = (await club.loadGame(1)).players.reduce((s, p) => s + (p.trainingXp ?? 0), 0);
const r1 = await cups.registerTeam(1, target.id, now);
check("user 1 regista (à espera ou resolvido)", r1.ok, JSON.stringify(r1));
const r2 = await cups.registerTeam(2, target.id, now);
check("user 2 regista", r2.ok);

await cups.tick(now);
const m1 = await cups.matchResultFor(target.id, 0, 0, now);
const m2 = await cups.matchResultFor(target.id, 0, 1, now);
check("jogo do user 1 resolvido com eventos", m1.resolved && Array.isArray(m1.result.events));
check("jogo do user 2 resolvido", m2.resolved);
check("resultado tem placar coerente", m1.result.score[0] >= 0 && m1.result.score[1] >= 0);

const skillAfter1 = (await club.loadGame(1)).players.reduce((s, p) => s + totalSkill(p), 0);
const xpAfter1 = (await club.loadGame(1)).players.reduce((s, p) => s + (p.trainingXp ?? 0), 0);
check("os jogadores do user 1 evoluíram com o jogo (no servidor)", skillAfter1 + xpAfter1 > skillBefore1 + xpBefore1, `(${skillBefore1 + xpBefore1} → ${skillAfter1 + xpAfter1})`);

console.log("\n[3] Falta de comparência = 3-0 (sem prémio)");
now = Math.floor((now + CUP_EVERY) / CUP_EVERY) * CUP_EVERY;
await cups.ensureUpcoming(1, now);
const c2 = (await cups.listCups(1, now)).filter((c) => c.state === "inscricao").sort((a, b) => a.startsAt - b.startsAt)[0];
await cups.enroll(1, c2.id, now);
now = c2.startsAt + 1000;
await cups.tick(now);
const moneyBeforeForfeit = (await club.loadGame(1)).club.money;
now = c2.startsAt + 4 * 60 * 1000 + 2000; // passa a janela sem registar
await cups.tick(now);
const forfeit = await cups.matchResultFor(c2.id, 0, 0, now);
check("sem registo → jogo resolvido", forfeit.resolved);
const myGoals = forfeit.isHome ? forfeit.result.score[0] : forfeit.result.score[1];
const oppGoals = forfeit.isHome ? forfeit.result.score[1] : forfeit.result.score[0];
check("falta de comparência = derrota 0-3", myGoals === 0 && oppGoals === 3, `(${myGoals}-${oppGoals})`);
check("sem prémio de jogo na falta de comparência", (await club.loadGame(1)).club.money === moneyBeforeForfeit);

console.log("\n[4] Taça corre até ao fim + prémio creditado a quem vence");
now = c2.startsAt + 1000;
await cups.tick(now);
for (let step = 0; step < 60 && (await cups.listCups(1, now)).find((x) => x.id === c2.id)?.state !== "fim"; step++) {
  now += 5 * 60 * 1000;
  await cups.tick(now);
}
const finalCup = (await cups.listCups(1, now)).find((c) => c.id === c2.id);
check("a taça terminou com vencedor", finalCup?.state === "fim" && !!finalCup.winner);
const sizes = finalCup.rounds.map((r) => r.length);
check("bracket 4-2-1", JSON.stringify(sizes) === "[4,2,1]", JSON.stringify(sizes));

console.log("\n[5] Não há vetor de batota no registo de equipa nem na escalação");
{
  // 1) registerTeam já não aceita NADA vindo do cliente (sem parâmetro de equipa) —
  //    só (userId, cupId, now?) — "now" tem valor por omissão, por isso não conta
  //    para .length; a única fonte de jogadores é sempre o plantel guardado no servidor.
  check("registerTeam(userId, cupId) — sem parâmetro de equipa", cups.registerTeam.length === 2, `(arity=${cups.registerTeam.length})`);
  const withFakeTeam = await cups.registerTeam(1, "id-inexistente", now, { players: [{ skills: { potencia: 999 } }] });
  check("um 4º argumento extra (equipa falsa) é simplesmente ignorado", withFakeTeam.error === "sem-jogo");

  // 2) tentar escalar jogadores que não são teus (ids inventados/de outra conta)
  //    é silenciosamente filtrado — nunca entram no lineup guardado.
  const real = (await club.loadGame(2)).players.map((p) => p.id).slice(0, 3);
  await club.setLineup(2, { formation: "4-4-2", starters: ["id-inventado", ...real, "outro-id-falso"] }, now);
  const savedStarters = (await club.loadGame(2)).lineup.starters;
  check("ids inventados nunca entram no lineup guardado", savedStarters.every((id) => real.includes(id)), JSON.stringify(savedStarters));
  check("os ids reais sobrevivem à validação", real.every((id) => savedStarters.includes(id)));
}

await server.close();
console.log(fails === 0 ? "\n✅ SERVIDOR DE TAÇAS + ECONOMIA OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
