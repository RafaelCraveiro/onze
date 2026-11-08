/* Testes de simulação headless — corre os módulos REAIS via Vite SSR.
   Uso: node scripts/simtest.mjs [quick] */

import { createServer } from "vite";

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  logLevel: "error",
});

const load = (p) => server.ssrLoadModule(p);
const { simulateMatch } = await load("/src/engine/match.js");
const { prepareBotTeam, prepareUserTeam, autoPickXI } = await load("/src/engine/team.js");
const { buildTimeline } = await load("/src/engine/timeline.js");
const { xpForNext, overallBase, SKILL_CAP, STARTING_MONEY } = await load("/src/engine/constants.js");
const { applyClubXp, applyUserResult, growPlayer } = await load("/src/engine/progress.js");
const { processTime } = await load("/src/engine/realtime.js");
const { genInitialSquad } = await load("/src/engine/generation.js");

const QUICK = process.argv.includes("quick");
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ✔ ${name}`);
  else { failures++; console.error(`  ✘ FALHOU: ${name} ${detail}`); }
};

const mkBot = (level, id = "b0") => ({ id, user: "bot", team: "Bot FC", level, str: 42 + level * 2.6, xp: 0, wins: 0 });
const EMB = { shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" };

/* Réplica em memória do que server/club.mjs monta a partir da BD — o motor é
   o mesmo dos dois lados, só muda de onde o objeto "game" vem. */
const newGame = () => {
  const now = Date.now();
  const players = genInitialSquad(Math.random);
  return {
    club: {
      name: "Teste FC", emblem: EMB, level: 1, xp: 0, totalXp: 0, money: STARTING_MONEY,
      morale: 70, fans: 100, buildings: { estadio: 0, treino: 1, medico: 1, academia: 1 },
    },
    players,
    lineup: { formation: "4-4-2", starters: autoPickXI(players, "4-4-2") },
    tacticStyle: "equilibrado", trainingFocus: "misto",
    market: { listings: [], nextDripAt: now },
    account: { wins: 0, draws: 0, losses: 0, trophies: [], createdAt: now },
    inbox: [], history: [], flags: { trainBoostUntil: 0 },
    nextYouthAt: 0, nextAgingAt: 0, lastTick: now, lastHourly: now,
  };
};

/* ---------- 0. Geração de jogadores ---------- */
{
  console.log("\n[0] Plantel inicial");
  let min = 999, max = 0, sum = 0, n = 0, gems = 0, gk = 0, traits = 0;
  for (let i = 0; i < 200; i++) {
    const squad = genInitialSquad(Math.random);
    if (squad.length !== 20) failures++;
    gk += squad.filter((p) => p.pos === "Gk").length;
    for (const p of squad) {
      const t = overallBase(p);
      min = Math.min(min, t); max = Math.max(max, t); sum += t; n++;
      if (p.pot >= 80) gems++;
      traits += p.traits.length;
      if (p.pot < t) failures++;
    }
  }
  console.log(`  qualidade: min=${min} máx=${max} média=${(sum / n).toFixed(1)} · joias: ${(100 * gems / n).toFixed(1)}% · características/jogador: ${(traits / n).toFixed(2)}`);
  check("qualidade média em [44, 54]", sum / n >= 44 && sum / n <= 54, `(${(sum / n).toFixed(1)})`);
  check("joias raras (até 12%)", gems / n < 0.12, `(${(100 * gems / n).toFixed(1)}%)`);
  check("2 guarda-redes por plantel", gk === 400);
}

/* ---------- 1. Calibração estatística ---------- */
{
  console.log("\n[1] Calibração do motor");
  const N = QUICK ? 600 : 3000;
  let goals = 0, shots = 0, badPoss = 0, badShots = 0, reds = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch({ home: prepareBotTeam(mkBot(3, "b1"), i), away: prepareBotTeam(mkBot(3, "b2"), i + 1) });
    goals += r.score[0] + r.score[1];
    shots += r.shots[0] + r.shots[1];
    reds += r.events.filter((e) => e.type === "red" || e.type === "red2").length;
    if (r.possession[0] + r.possession[1] !== 100) badPoss++;
    if (r.onTarget[0] > r.shots[0] || r.score[0] > r.onTarget[0] || r.score[1] > r.onTarget[1]) badShots++;
  }
  const g = goals / N;
  console.log(`  golos/jogo=${g.toFixed(2)} remates/jogo=${(shots / N).toFixed(1)} vermelhos=${(reds / N).toFixed(3)}`);
  check("golos/jogo em [1.8, 3.6]", g >= 1.8 && g <= 3.6, `(${g.toFixed(2)})`);
  check("posse soma 100; onTarget/golos coerentes", badPoss === 0 && badShots === 0);
}

/* ---------- 2. Invariante do cartão vermelho ---------- */
{
  console.log("\n[2] Expulsos nunca voltam a aparecer");
  const N = QUICK ? 2000 : 8000;
  let violations = 0, redsSeen = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch({ home: prepareBotTeam(mkBot(4, "b5"), i), away: prepareBotTeam(mkBot(4, "b6"), i) });
    const redAt = new Map();
    for (const e of r.events) {
      if (e.type === "red" || e.type === "red2") {
        redsSeen++;
        if (redAt.has(e.pid)) violations++;
        redAt.set(e.pid, e.min);
        if (e.type === "red2" && !(e.firstYellowMin < e.min)) violations++;
      }
    }
    for (const e of r.events) {
      for (const id of [e.pid, e.assistPid].filter(Boolean)) {
        if (redAt.has(id) && e.min > redAt.get(id)) violations++;
      }
    }
  }
  console.log(`  vermelhos observados: ${redsSeen} em ${N} jogos`);
  check("zero violações", violations === 0, `(${violations})`);
}

/* ---------- 3. Reputação do clube ---------- */
{
  console.log("\n[3] Reputação do clube");
  check("curva cresce sempre", [1, 2, 3, 5, 10, 20].every((l) => xpForNext(l + 1) > xpForNext(l)));
  const fake = { club: { level: 1, xp: 0, totalXp: 0 }, inbox: [] };
  applyClubXp(fake, xpForNext(1) - 1);
  check("um ponto a menos não sobe", fake.club.level === 1);
  applyClubXp(fake, 3);
  check("ao passar a meta sobe e guarda o resto", fake.club.level === 2 && fake.club.xp === 2, `(nv${fake.club.level} xp${fake.club.xp})`);
}

/* ---------- 4. Evolução automática ---------- */
{
  console.log("\n[4] Os jogadores evoluem a jogar, sem passar o potencial");
  const game = newGame();
  const before = new Map(game.players.map((p) => [p.id, overallBase(p)]));
  for (let i = 0; i < 60; i++) {
    const result = simulateMatch({ home: prepareUserTeam(game), away: prepareBotTeam(mkBot(1, "b9"), i) });
    applyUserResult(game, { kind: "liga", userSide: "H", result, oppName: "Bot FC", isHome: true });
    for (const p of game.players) { p.fitness = 100; p.injuryMin = 0; p.suspension = 0; }
  }
  const played = game.players.filter((p) => p.stats.games >= 30);
  const grew = (f) => { const l = played.filter(f); return l.length ? l.reduce((s, p) => s + overallBase(p) - before.get(p.id), 0) / l.length : null; };
  const young = grew((p) => p.age <= 21 && p.pot - before.get(p.id) >= 6), old = grew((p) => p.age >= 30);
  console.log(`  60 jogos: jovens com margem +${young?.toFixed(1)} · veteranos +${old?.toFixed(1)}`);
  check("jovens com margem evoluem", young === null || young > 0.8, `(${young})`);
  check("jovens evoluem mais do que veteranos", young === null || old === null || young > old);
  check("ninguém passa o potencial", game.players.every((p) => overallBase(p) <= Math.max(p.pot, before.get(p.id) ?? 0)));
  check("nenhum atributo acima do teto", game.players.every((p) => Object.values(p.skills).every((v) => v <= SKILL_CAP)));
  const f = { pos: "Cf", pot: 90, age: 19, focus: "fisico", trainingXp: 300, skills: { finalizacao: 50, criacao: 50, velocidade: 50, fisico: 50, defesa: 10, reflexos: 10 } };
  growPlayer(f);
  check("o foco escolhido é o atributo que sobe", f.skills.fisico > 50 && f.skills.finalizacao === 50, JSON.stringify(f.skills));
}

/* ---------- 5. (As taças são multi-jogador e vivem no servidor: scripts/cuptest.mjs) ---------- */

/* ---------- 6. Auditoria longa: 5 dias de relógio (manutenção local + jogos) ---------- */
{
  console.log("\n[6] Auditoria de 5 dias em tempo real (manutenção local + jogos)");
  const game = newGame();
  let now = Date.now();
  const steps = QUICK ? 6 * 24 : 6 * 24 * 5; // passos de 10 min
  let bad = [];
  for (let s = 0; s < steps; s++) {
    now += 10 * 60 * 1000;
    processTime(game, now, Math.random);

    // joga um jogo a cada ~3 passos (como se fossem rondas de taça)
    if (s % 3 === 0) {
      const user = prepareUserTeam(game);
      const bot = prepareBotTeam(mkBot(game.club.level, "bx"), s);
      const isHome = s % 2 === 0;
      const result = isHome ? simulateMatch({ home: user, away: bot }) : simulateMatch({ home: bot, away: user });
      applyUserResult(game, { kind: "taca", userSide: isHome ? "H" : "A", result, oppName: "Rival FC", isHome });
    }

    if (!isFinite(game.club.money)) bad.push("dinheiro não finito");
    if (game.players.length < 11 || game.players.length > 26) bad.push(`plantel=${game.players.length}`);
    if (game.club.level > 30) bad.push("nível>30");
    for (const p of game.players) {
      if (p.fitness < 0 || p.fitness > 100) bad.push("energia fora de [0,100]");
      for (const v of Object.values(p.skills)) if (v > 99) bad.push(`atributo ${v} acima do teto`);
    }
  }
  const size = JSON.stringify(game).length;
  console.log(`  nível=${game.club.level} dinheiro=${Math.round(game.club.money)}€ plantel=${game.players.length} jogos=${game.account.wins + game.account.draws + game.account.losses} save=${(size / 1024).toFixed(0)}KB`);
  check("sem violações de invariantes", bad.length === 0, bad.slice(0, 5).join("; "));
  check("dinheiro nunca fica negativo", game.club.money >= 0, `(${game.club.money})`);
  check("save < 1MB", size < 1024 * 1024, `(${(size / 1024).toFixed(0)}KB)`);
  check("inbox ≤60 e histórico ≤40", game.inbox.length <= 60 && game.history.length <= 40);
}

/* ---------- 7. Timeline 2D ---------- */
{
  console.log("\n[7] Timeline do viewer 2D");
  let bad = 0;
  for (let i = 0; i < (QUICK ? 100 : 300); i++) {
    const r = simulateMatch({ home: prepareBotTeam(mkBot(5, "b7"), i), away: prepareBotTeam(mkBot(5, "b8"), i) });
    const tl = buildTimeline(r);
    if (tl.scenes.filter((s) => s.kind === "goal").length !== r.score[0] + r.score[1]) bad++;
    const last = tl.scenes[tl.scenes.length - 1];
    if (last.kind !== "fulltime" || last.score[0] !== r.score[0] || last.score[1] !== r.score[1]) bad++;
  }
  check("cenas de golo = golos; placar final coerente", bad === 0, `(${bad})`);
}

await server.close();
console.log(failures === 0 ? "\n✅ TODOS OS TESTES PASSARAM" : `\n❌ ${failures} teste(s) falharam`);
process.exit(failures === 0 ? 0 : 1);
