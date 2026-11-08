/* Testa uma época de liga completa: calendário, pontos, prémios, subidas e contas novas. */
process.env.ONZE_NO_ENV_FILE = "1";
import { createMemoryDb } from "../server/db.mjs";

const db = await createMemoryDb();
await db.exec(`
  CREATE TABLE users (id BIGINT PRIMARY KEY, club_name TEXT, emblem TEXT);
  CREATE TABLE saves (user_id BIGINT PRIMARY KEY, data TEXT, updated_at DOUBLE PRECISION);
`);
const club = await import("../server/club.mjs");
const league = await import("../server/league.mjs");
await club.initClub(db);
await league.initLeague(db);

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };
const EMB = JSON.stringify({ shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" });
const mk = async (id, name, now) => { await db.prepare("INSERT INTO users (id, club_name, emblem) VALUES (?, ?, ?)").run(id, name, EMB); await club.tickClub(id, now); };

const s0 = league.seasonOf(Date.now());
const start = league.seasonStart(s0);
const GROUP = 12, ROUNDS = 22;
const t0 = start + 3600 * 1000;

console.log("\n[1] Arranque da época");
await mk(1, "Alfa", t0); await mk(2, "Beta", t0);
await league.tickLeague(t0);
let a = await league.leagueFor(1, t0);
check("12 clubes na tabela", a.table.length === GROUP, `(${a.table.length})`);
check("22 jogos para cada clube", a.mine.length === ROUNDS, `(${a.mine.length})`);
check("os 2 managers reais estão no mesmo grupo", a.table.filter((c) => c.isUser).length === 2);
check("começa na última divisão", a.division === league.MAX_DIVISION);
check("os bots têm nomes de clube", a.table.filter((c) => !c.isUser).every((c) => !c.name.startsWith("Bot")));

console.log("\n[2] As jornadas fazem-se sozinhas e uma só vez");
const midT = start + 4 * 3600 * 1000 + 5 * 24 * 3600 * 1000 + 1000; // 6 jornadas
await league.tickLeague(midT);
await league.tickLeague(midT + 500);
a = await league.leagueFor(1, midT);
check("6 jogos disputados", a.table.find((c) => c.me).played === 6, `(${a.table.find((c) => c.me).played})`);
const g1 = await club.loadGame(1);
check("resultados contam no registo do clube", g1.account.wins + g1.account.draws + g1.account.losses === 6, `(${g1.account.wins + g1.account.draws + g1.account.losses})`);
const rep = await league.leagueMatch(1, 5, midT);
check("a última jornada fica disponível em 2D", Array.isArray(rep.result?.events), JSON.stringify(rep).slice(0, 100));
const oldRep = await league.leagueMatch(1, 0, midT);
check("as jornadas anteriores já não têm repetição", oldRep.error === "jogo-indisponivel", JSON.stringify(oldRep).slice(0, 100));
const myGames = a.mine.filter((m) => m.score);
check("todos os jogos jogados guardam estatísticas", myGames.every((m) => m.stats?.shots?.length === 2 && m.stats?.xg?.length === 2));
check("só a última jornada aparece para ver", myGames.filter((m) => m.watchable).length === 1 && myGames.find((m) => m.watchable).round === 5);
const size = await db.prepare("SELECT COUNT(result)::int AS replays, AVG(LENGTH(result))::int AS replay, AVG(LENGTH(stats))::int AS stats, COUNT(stats)::int AS n FROM league_fixtures").get();
check("só há repetições de uma jornada", size.replays <= 5, JSON.stringify(size));
console.log(`  · por jogo: repetição ${size.replay} bytes, estatísticas ${size.stats} bytes (${size.n} jogos com dados)`);

console.log("\n[3] Conta nova a meio da época ocupa a vaga de um bot");
await mk(3, "Gama", midT);
const c = await league.leagueFor(3, midT);
check("entrou no mesmo grupo", c.table.filter((x) => x.isUser).length === 3, `(${c.table.filter((x) => x.isUser).length})`);
check("continuam 12 clubes", c.table.length === GROUP);

console.log("\n[4] Fim da época: pontos, prémios, subidas");
const moneyBefore = (await club.loadGame(1)).club.money;
const endT = start + league.SEASON_MS + 3600 * 1000;
await db.prepare("UPDATE club SET money = 100000").run();
await league.tickLeague(start + league.SEASON_MS - 1000);
const final = await league.leagueFor(1, start + league.SEASON_MS - 1000);
const totalPts = final.table.reduce((s, x) => s + x.pts, 0), played = final.table.reduce((s, x) => s + x.played, 0);
check("todos jogaram até ao fim", final.table.every((x) => x.played === ROUNDS), JSON.stringify(final.table.map((x) => x.played)));
check("132 jogos no total", played === 264, `(${played})`);
check("pontos coerentes com os resultados", final.table.every((x) => x.pts === x.w * 3 + x.d));
check("soma de pontos plausível", totalPts >= 264 && totalPts <= 396, `(${totalPts})`);
check("o dinheiro era finito antes do fim", Number.isFinite(moneyBefore));
await league.tickLeague(endT);
const humanRanks = final.table.filter((x) => x.isUser);
const memo = await db.prepare("SELECT user_id, division FROM league_memo ORDER BY user_id").all();
for (const h of humanRanks) {
  const uid = h.name === "Alfa" ? 1 : h.name === "Beta" ? 2 : 3;
  const expected = h.rank <= 2 ? league.MAX_DIVISION - 1 : league.MAX_DIVISION;
  check(`${h.name} (${h.rank}.º) vai para a divisão certa`, memo.find((m) => Number(m.user_id) === uid)?.division === expected, JSON.stringify(memo));
  const g = await club.loadGame(uid);
  check(`${h.name} recebeu prémio e notícia`, g.inbox.some((n) => /Terminaste em/.test(n.text)));
}

console.log("\n[5] Nova época");
const next = await league.leagueFor(1, endT);
check("começa uma época nova", next.season === s0 + 1, `(${next.season})`);
check("tabela a zeros", next.table.every((x) => x.played === 0));
const left = await db.prepare("SELECT COUNT(*)::int AS n FROM leagues").get();
check("guarda poucas épocas antigas", left.n <= 8, `(${left.n})`);

console.log("\n[6] Regras da pirâmide");
const P = await import("../src/engine/pyramid.js");
check("2 000 jogadores precisam de 8 divisões", P.divisionsFor(2000) === 8);
check("mais de 3 060 abrem a 9.ª divisão", P.divisionsFor(3060) === 8 && P.divisionsFor(3061) === 9);
const nd = (rank) => P.nextDivision({ division: 5, rank, maxDivision: 8 });
check("sobem 2, 3.º e 8.º ficam, descem 4", nd(1) === 4 && nd(2) === 4 && nd(3) === 5 && nd(8) === 5 && nd(9) === 6 && nd(12) === 6);
check("entrada tardia não sobe", P.nextDivision({ division: 8, rank: 1, late: true, maxDivision: 8 }) === 8);
const crowd = Array.from({ length: 2000 }, (_, id) => ({ id, division: 8 }));
const placed = P.assignSeason(crowd, 8);
check("ninguém fica de fora", placed.flatMap((d) => d.groups.flat()).length === 2000);
check("nenhum grupo passa de 12", placed.every((d) => d.groups.every((g) => g.length <= GROUP)));
const clock = (t) => league.seasonOf(t);
check("a época dura 22 dias", clock(start + league.SEASON_MS - 1) === s0 && clock(start + league.SEASON_MS) === s0 + 1);

console.log(fails === 0 ? "\n✅ LIGA OK" : `\n❌ ${fails} falhas`);
await db.close();
process.exit(fails === 0 ? 0 : 1);
