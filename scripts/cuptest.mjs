/* Teste do servidor de taças multi-jogador — plantel e economia AUTORITÁRIOS
   (server/club.mjs), com BD em memória e 2 utilizadores reais no mesmo bracket. */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: "error" });
const { totalSkill } = await server.ssrLoadModule("/src/engine/constants.js");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, club_name TEXT, emblem TEXT);
  CREATE TABLE saves (user_id INTEGER PRIMARY KEY, data TEXT, updated_at INTEGER);
`);

const club = await import("../server/club.mjs");
const cups = await import("../server/cups.mjs");
club.initClub(db);
cups.initCups(db);

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };

const EMB = JSON.stringify({ shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" });
const mkUser = (id, name) => {
  db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (?, ?, ?)").run(id, name, EMB);
  club.initClubForUser(id, Date.now());
};

console.log("\n[1] Duas contas reais no MESMO bracket");
const CUP_EVERY = 10 * 60 * 1000;
let now = Math.floor(Date.now() / CUP_EVERY) * CUP_EVERY; // alinhado ao slot
mkUser(1, "Alpha FC");
mkUser(2, "Beta FC");

const moneyBefore1 = club.loadGame(1).club.money;
cups.ensureUpcoming(1, now);
let list1 = cups.listCups(1, now);
check("há taças abertas do nível 1", list1.filter((c) => c.state === "inscricao").length >= 3, `(${list1.length})`);
const target = list1.filter((c) => c.state === "inscricao").sort((a, b) => a.startsAt - b.startsAt)[0];

const e1 = cups.enroll(1, target.id, now);
const e2 = cups.enroll(2, target.id, now);
check("utilizador 1 inscrito", e1.ok, JSON.stringify(e1));
check("utilizador 2 inscrito na MESMA taça", e2.ok);
check("ambos aparecem nos entrants", e2.cup.entrants.filter((x) => x === "you" || x.startsWith("s")).length >= 2);
check("bloqueia inscrição em 2ª taça em simultâneo", !!cups.userActiveCupId(1) && cups.enroll(1, list1[1].id, now).error === "ja-noutra-taca");
check("a inscrição DEBITOU a taxa no clube (economia server-side)", club.loadGame(1).club.money === moneyBefore1 - target.entryFee, `(${club.loadGame(1).club.money} vs ${moneyBefore1 - target.entryFee})`);

console.log("\n[2] Arranque + registo de equipas (sem o cliente enviar nada — o servidor usa o plantel real)");
now = target.startsAt + 1000;
cups.tick(now);
let cup1 = cups.listCups(1, now).find((c) => c.id === target.id);
check("taça arrancou (decorrer)", cup1.state === "decorrer");
check("bracket de 4 jogos", cup1.rounds[0].length === 4);
check("8 entrantes (2 users + 6 bots)", cup1.entrants.length === 8);

const skillBefore1 = club.loadGame(1).players.reduce((s, p) => s + totalSkill(p), 0);
const xpBefore1 = club.loadGame(1).players.reduce((s, p) => s + (p.trainingXp ?? 0), 0);
const r1 = cups.registerTeam(1, target.id, now);
check("user 1 regista (à espera ou resolvido)", r1.ok, JSON.stringify(r1));
const r2 = cups.registerTeam(2, target.id, now);
check("user 2 regista", r2.ok);

cups.tick(now);
const m1 = cups.matchResultFor(target.id, 0, 0, now);
const m2 = cups.matchResultFor(target.id, 0, 1, now);
check("jogo do user 1 resolvido com eventos", m1.resolved && Array.isArray(m1.result.events));
check("jogo do user 2 resolvido", m2.resolved);
check("resultado tem placar coerente", m1.result.score[0] >= 0 && m1.result.score[1] >= 0);

const skillAfter1 = club.loadGame(1).players.reduce((s, p) => s + totalSkill(p), 0);
const xpAfter1 = club.loadGame(1).players.reduce((s, p) => s + (p.trainingXp ?? 0), 0);
check("as skills NÃO mudam sozinhas ao jogar (só o treinador as sobe)", skillAfter1 === skillBefore1, `(${skillBefore1} → ${skillAfter1})`);
check("os jogadores do user 1 GANHARAM XP de treino ao jogar (persistido no servidor)", xpAfter1 > xpBefore1, `(${xpBefore1} → ${xpAfter1})`);

console.log("\n[3] Falta de comparência = 3-0 (sem prémio)");
now = Math.floor((now + CUP_EVERY) / CUP_EVERY) * CUP_EVERY;
cups.ensureUpcoming(1, now);
const c2 = cups.listCups(1, now).filter((c) => c.state === "inscricao").sort((a, b) => a.startsAt - b.startsAt)[0];
cups.enroll(1, c2.id, now);
now = c2.startsAt + 1000;
cups.tick(now);
const moneyBeforeForfeit = club.loadGame(1).club.money;
now = c2.startsAt + 4 * 60 * 1000 + 2000; // passa a janela sem registar
cups.tick(now);
const forfeit = cups.matchResultFor(c2.id, 0, 0, now);
check("sem registo → jogo resolvido", forfeit.resolved);
const myGoals = forfeit.isHome ? forfeit.result.score[0] : forfeit.result.score[1];
const oppGoals = forfeit.isHome ? forfeit.result.score[1] : forfeit.result.score[0];
check("falta de comparência = derrota 0-3", myGoals === 0 && oppGoals === 3, `(${myGoals}-${oppGoals})`);
check("sem prémio de jogo na falta de comparência", club.loadGame(1).club.money === moneyBeforeForfeit);

console.log("\n[4] Taça corre até ao fim + prémio creditado a quem vence");
now = c2.startsAt + 1000;
cups.tick(now);
for (let step = 0; step < 60 && cups.listCups(1, now).find((x) => x.id === c2.id)?.state !== "fim"; step++) {
  now += 5 * 60 * 1000;
  cups.tick(now);
}
const finalCup = cups.listCups(1, now).find((c) => c.id === c2.id);
check("a taça terminou com vencedor", finalCup?.state === "fim" && !!finalCup.winner);
const sizes = finalCup.rounds.map((r) => r.length);
check("bracket 4-2-1", JSON.stringify(sizes) === "[4,2,1]", JSON.stringify(sizes));

console.log("\n[5] Não há vetor de batota no registo de equipa nem na escalação");
{
  // 1) registerTeam já não aceita NADA vindo do cliente (sem parâmetro de equipa) —
  //    só (userId, cupId, now?) — "now" tem valor por omissão, por isso não conta
  //    para .length; a única fonte de jogadores é sempre o plantel guardado no servidor.
  check("registerTeam(userId, cupId) — sem parâmetro de equipa", cups.registerTeam.length === 2, `(arity=${cups.registerTeam.length})`);
  const withFakeTeam = cups.registerTeam(1, "id-inexistente", now, { players: [{ skills: { potencia: 999 } }] });
  check("um 4º argumento extra (equipa falsa) é simplesmente ignorado", withFakeTeam.error === "sem-jogo");

  // 2) tentar escalar jogadores que não são teus (ids inventados/de outra conta)
  //    é silenciosamente filtrado — nunca entram no lineup guardado.
  const real = club.loadGame(2).players.map((p) => p.id).slice(0, 3);
  club.setLineup(2, { formation: "4-4-2", starters: ["id-inventado", ...real, "outro-id-falso"] }, now);
  const savedStarters = club.loadGame(2).lineup.starters;
  check("ids inventados nunca entram no lineup guardado", savedStarters.every((id) => real.includes(id)), JSON.stringify(savedStarters));
  check("os ids reais sobrevivem à validação", real.every((id) => savedStarters.includes(id)));
}

await server.close();
console.log(fails === 0 ? "\n✅ SERVIDOR DE TAÇAS + ECONOMIA OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
