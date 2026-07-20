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
const { xpForNext, totalSkill, talentCap, SKILL_CAP, trainCost, STARTING_MONEY } = await load("/src/engine/constants.js");
const { applyClubXp, applyUserResult } = await load("/src/engine/progress.js");
const { processTime } = await load("/src/engine/realtime.js");
const { genInitialSquad } = await load("/src/engine/generation.js");

const QUICK = process.argv.includes("quick");
let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ✔ ${name}`);
  else { failures++; console.error(`  ✘ FALHOU: ${name} ${detail}`); }
};

const mkBot = (level, id = "b0") => ({ id, user: "bot", team: "Bot FC", level, str: 72 + level * 4.5, xp: 0, wins: 0 });
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

/* ---------- 0. Geração de jogadores (escala 11x11) ---------- */
{
  console.log("\n[0] Plantel inicial (Skl estilo 11x11)");
  let min = 999, max = 0, sum = 0, n = 0, sevens = 0, gk = 0;
  for (let i = 0; i < 200; i++) {
    const squad = genInitialSquad(Math.random);
    if (squad.length !== 18) failures++;
    gk += squad.filter((p) => p.pos === "Gk").length;
    for (const p of squad) {
      const t = totalSkill(p);
      min = Math.min(min, t); max = Math.max(max, t); sum += t; n++;
      if (p.talent >= 7) sevens++;
    }
  }
  console.log(`  Skl: min=${min} máx=${max} média=${(sum / n).toFixed(0)} · talento 7+: ${(100 * sevens / n).toFixed(2)}% · GR/plantel=${gk / 200}`);
  check("Skl médio em [70, 95]", sum / n >= 70 && sum / n <= 95, `(${(sum / n).toFixed(0)})`);
  check("talento 7 MUITO raro (0,3%–4%, alvo ~1%)", sevens / n >= 0.003 && sevens / n < 0.04, `(${(100 * sevens / n).toFixed(2)}%)`);
  check("3 guarda-redes por plantel", gk === 600);
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

/* ---------- 3. XP do clube (curva nova: 100 / 300 / depois dobra sempre) ---------- */
{
  console.log("\n[3] XP do clube");
  check("nível 1→2 precisa de 100 XP", xpForNext(1) === 100, `(${xpForNext(1)})`);
  check("nível 2→3 precisa de 300 XP (3×)", xpForNext(2) === 300, `(${xpForNext(2)})`);
  check("nível 3→4 precisa de 600 XP (dobra)", xpForNext(3) === 600, `(${xpForNext(3)})`);
  check("nível 4→5 precisa de 1200 XP (dobra outra vez)", xpForNext(4) === 1200, `(${xpForNext(4)})`);

  const fake = { club: { level: 1, xp: 0, totalXp: 0 }, inbox: [] };
  for (let i = 0; i < 33; i++) applyClubXp(fake, 3); // 99 XP — ainda não chega aos 100
  check("99 XP ainda no nível 1", fake.club.level === 1 && fake.club.xp === 99, `(nv${fake.club.level} xp${fake.club.xp})`);
  applyClubXp(fake, 3); // 102 XP totais → sobe (gasta 100, sobra 2)
  check("ultrapassar 100 XP sobe para o nível 2", fake.club.level === 2 && fake.club.xp === 2, `(nv${fake.club.level} xp${fake.club.xp})`);
}

/* ---------- 4. XP de treino banked POR JOGO (talento manda) + distribuição manual ---------- */
{
  console.log("\n[4] Os jogadores ganham XP com os jogos (banked) — o treinador distribui à mão");
  const game = newGame();
  const beforeXp = new Map(game.players.map((p) => [p.id, p.trainingXp ?? 0]));
  const beforeSkills = new Map(game.players.map((p) => [p.id, totalSkill(p)]));
  const N = 12;
  for (let i = 0; i < N; i++) {
    const user = prepareUserTeam(game);
    const bot = prepareBotTeam(mkBot(1, "b9"), i);
    const result = simulateMatch({ home: user, away: bot });
    applyUserResult(game, { kind: "taca", userSide: "H", result, oppName: "Bot FC", isHome: true });
    for (const p of game.players) { p.fitness = 100; p.injuryMin = 0; p.suspension = 0; }
  }
  // as skills NÃO mudam sozinhas com os jogos — só o XP banked sobe
  const skillDrift = game.players.some((p) => totalSkill(p) !== beforeSkills.get(p.id));
  check("skills ficam intactas até o treinador gastar XP", !skillDrift);

  const growth = game.players
    .filter((p) => p.stats.games >= N * 0.6)
    .map((p) => ({ talent: p.talent, age: p.age, delta: (p.trainingXp ?? 0) - beforeXp.get(p.id) }));
  const avg = growth.reduce((s, g) => s + g.delta, 0) / Math.max(1, growth.length);
  const hi = growth.filter((g) => g.talent >= 5 && g.age <= 24);
  const lo = growth.filter((g) => g.talent <= 2);
  const hiAvg = hi.length ? hi.reduce((s, g) => s + g.delta, 0) / hi.length : 0;
  const loAvg = lo.length ? lo.reduce((s, g) => s + g.delta, 0) / lo.length : 1;
  console.log(`  ${N} jogos de taça: XP banked médio=+${avg.toFixed(1)} · talento alto jovem=+${hiAvg.toFixed(1)} · talento baixo=+${loAvg.toFixed(1)}`);
  check("titulares ganharam XP de treino com os jogos", avg > 0, `(+${avg.toFixed(2)})`);
  check("talento alto ganha mais XP por jogo que talento baixo", hi.length === 0 || lo.length === 0 || hiAvg > loAvg);

  // o treinador gasta agora manualmente o XP banked de UM jogador num atributo
  const p = game.players.find((pl) => (pl.trainingXp ?? 0) > 0);
  const skill = "passe";
  const startSkill = p.skills[skill] ?? 0;
  const startXp = p.trainingXp;
  let spent = 0, ups = 0;
  while (p.skills[skill] < SKILL_CAP) {
    const cost = trainCost(Math.floor(p.skills[skill]));
    if (p.trainingXp < cost) break;
    p.trainingXp -= cost;
    p.skills[skill] = Math.min(SKILL_CAP, Math.floor(p.skills[skill]) + 1);
    spent += cost;
    ups++;
  }
  check("gastar XP banked sobe o atributo escolhido", ups > 0 && p.skills[skill] === startSkill + ups, `(${startSkill}→${p.skills[skill]})`);
  check("XP gasto bate certo com o custo acumulado (crescente)", p.trainingXp === startXp - spent, `(sobra=${p.trainingXp})`);
  check("nunca ultrapassa o teto (25)", p.skills[skill] <= SKILL_CAP);

  let capped = 0;
  for (const pl of game.players) for (const v of Object.values(pl.skills)) if (v > talentCap(pl.talent) + 0.01) capped++;
  check("nenhuma sub-habilidade acima do teto (25)", capped === 0, `(${capped})`);
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
      for (const v of Object.values(p.skills)) if (v > 25) bad.push(`sub-skill ${v} acima do teto global`);
    }
  }
  const size = JSON.stringify(game).length;
  console.log(`  nível=${game.club.level} dinheiro=${Math.round(game.club.money)}€ plantel=${game.players.length} jogos=${game.account.wins + game.account.draws + game.account.losses} save=${(size / 1024).toFixed(0)}KB`);
  check("sem violações de invariantes", bad.length === 0, bad.slice(0, 5).join("; "));
  check("dinheiro nunca colapsa (sem salários)", game.club.money > 0);
  check("save < 1MB", size < 1024 * 1024, `(${(size / 1024).toFixed(0)}KB)`);
  check("inbox ≤60 e histórico ≤40", game.inbox.length <= 60 && game.history.length <= 40);
  check("XP bate certo com o registo (regra do anti-cheat)", game.club.totalXp === 3 * game.account.wins + game.account.draws);
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
