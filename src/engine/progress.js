/* Progressão: reputação do clube, resultados e evolução automática dos jogadores. */

import {
  XP_WIN, XP_DRAW, XP_LOSS, MAX_LEVEL, xpForNext, SKILLS, SKILL_CAP, RATING_WEIGHTS, lineOf, overallBase, growthCost,
  REWARD_WIN_BASE, REWARD_DRAW_BASE, REWARD_LOSS_BASE, REWARD_WIN_PER_LEVEL,
  FITNESS_MATCH_COST, gateIncome, INBOX_CAP, HISTORY_CAP,
  MATCH_XP_BASE, MATCH_XP_MULT, eliteCost, ELITE_DAYS, POT_HARD_CAP, HOUR_MS,
} from "./constants.js";

export const pushNews = (game, type, title, text, at = Date.now()) => {
  game.inbox.unshift({ at, type, title, text });
  if (game.inbox.length > INBOX_CAP) game.inbox.length = INBOX_CAP;
};

/* Soma reputação e devolve os níveis ganhos. */
export const applyClubXp = (game, xp) => {
  const c = game.club;
  c.xp += xp;
  c.totalXp = (c.totalXp ?? 0) + xp;
  let ups = 0;
  while (c.level < MAX_LEVEL && c.xp >= xpForNext(c.level)) {
    c.xp -= xpForNext(c.level);
    c.level++;
    ups++;
  }
  if (ups > 0) pushNews(game, "level", `Nível ${c.level}!`, `O clube subiu para o nível ${c.level}. A reputação do clube continua a crescer.`);
  return ups;
};

/* Evolução ganha por UM jogador num jogo: novos e com margem aprendem mais. */
const matchGrowth = (p, kind, trainLvl) => {
  const ageMult = p.age <= 21 ? 1.3 : p.age <= 25 ? 1 : p.age <= 29 ? 0.6 : 0.25;
  const room = Math.min(1.25, 0.55 + Math.max(0, (p.pot ?? 0) - overallBase(p)) * 0.05);
  return MATCH_XP_BASE * (MATCH_XP_MULT[kind] ?? 1) * ageMult * room * (1 + trainLvl * 0.06);
};

/* Converte a evolução acumulada em atributos, sem passar o potencial. Devolve true se subiu de qualidade. */
export const growPlayer = (p) => {
  const before = overallBase(p);
  if (before >= (p.pot ?? 0)) { p.trainingXp = 0; return false; }
  const w = RATING_WEIGHTS[lineOf(p.pos)];
  const auto = () => SKILLS.filter((k) => w[k] > 0 && p.skills[k] < SKILL_CAP).sort((a, b) => (p.skills[a] / w[a]) - (p.skills[b] / w[b]))[0];
  for (let guard = 0; guard < 8; guard++) {
    const attr = p.focus && p.skills[p.focus] < SKILL_CAP ? p.focus : auto();
    if (!attr) break;
    const cost = growthCost(p.skills[attr]);
    if ((p.trainingXp ?? 0) < cost) break;
    p.trainingXp -= cost;
    p.skills[attr] += 1;
    if (overallBase(p) >= p.pot) { p.trainingXp = 0; break; }
  }
  return overallBase(p) > before;
};

/* Aplica um resultado do utilizador ao estado (XP, dinheiro, energia, evolução…).
   kind: "amigavel" | "taca" | "liga". MUTA o game (chamar sobre uma cópia). */
export const applyUserResult = (game, { kind, userSide, result, oppName, isHome, auto = false, forfeit = false }) => {
  const now = Date.now();
  const [gh, ga] = result.score;
  const gU = userSide === "H" ? gh : ga;
  const gO = userSide === "H" ? ga : gh;
  const outcome = gU > gO ? "V" : gU < gO ? "D" : "E";
  const competitive = kind !== "amigavel";

  // reputação: os jogos oficiais valem mais
  const repMult = kind === "liga" ? 1.5 : kind === "taca" ? 1.25 : 1;
  applyClubXp(game, Math.round((outcome === "V" ? XP_WIN : outcome === "E" ? XP_DRAW : XP_LOSS) * repMult));

  // Dinheiro do jogo
  // Só a liga paga por jogo: os amigáveis são ilimitados e as taças já têm prémios.
  let reward = 0, tickets = 0;
  if (!forfeit && kind === "liga") {
    reward = Math.round((outcome === "V" ? REWARD_WIN_BASE + game.club.level * REWARD_WIN_PER_LEVEL : outcome === "E" ? REWARD_DRAW_BASE : REWARD_LOSS_BASE) * 1.4);
    // bilheteira: 1€ por adepto PRESENTE — limitado pelos lugares do estádio (começa em 0)
    if (isHome) tickets = gateIncome(game.club.buildings.estadio, game.club.fans ?? 0);
    game.club.money += reward + tickets;
  }

  // Moral e adeptos
  game.club.morale = Math.max(5, Math.min(100, game.club.morale + (outcome === "V" ? 6 : outcome === "E" ? -1 : -7)));
  game.club.fans = Math.max(0, (game.club.fans ?? 100) + (outcome === "V" ? 18 + game.club.level * 6 : outcome === "E" ? 5 : -8));

  // Jogadores: energia, estatísticas, lesões, castigos e evolução
  const xiIds = new Set((userSide === "H" ? result.homeXI : result.awayXI).map((x) => x.id));
  const userEvents = result.events.filter((e) => e.side === userSide);
  const goalsBy = {}, assistsBy = {};
  for (const e of userEvents) {
    if (e.type === "goal") {
      goalsBy[e.pid] = (goalsBy[e.pid] ?? 0) + 1;
      if (e.assistPid) assistsBy[e.assistPid] = (assistsBy[e.assistPid] ?? 0) + 1;
    }
  }
  const injuredMin = {};
  for (const inj of result.injuries) if (inj.side === userSide) injuredMin[inj.pid] = inj.minutes ?? (inj.days ?? 1) * 60;
  const suspended = {};
  for (const s of result.suspensions) if (s.side === userSide) suspended[s.pid] = s.matches;

  const moraleDelta = outcome === "V" ? 8 : outcome === "E" ? 3 : -6;
  let xpGained = 0;
  const improved = [];
  for (const p of game.players) {
    if (competitive && p.suspension > 0 && !xiIds.has(p.id)) p.suspension--; // cumpriu jogo de castigo
    if (!xiIds.has(p.id)) continue;
    p.fitness = Math.max(0, p.fitness - FITNESS_MATCH_COST);
    p.morale = Math.max(0, Math.min(100, (p.morale ?? 0) + moraleDelta));
    p.stats.games++;
    p.stats.goals += goalsBy[p.id] ?? 0;
    p.stats.assists += assistsBy[p.id] ?? 0;
    const xp = matchGrowth(p, kind, game.club.buildings.treino ?? 1);
    p.trainingXp = (p.trainingXp ?? 0) + xp;
    xpGained += xp;
    if (growPlayer(p)) improved.push(`${p.name} (${overallBase(p)})`);
    if (injuredMin[p.id]) {
      p.injuryMin = injuredMin[p.id];
      pushNews(game, "injury", "Lesão", `${p.name} lesionou-se — volta dentro de ${fmtDur(p.injuryMin)}.`);
    }
    if (competitive && suspended[p.id]) {
      p.suspension = suspended[p.id];
      pushNews(game, "card", "Expulsão", `${p.name} foi expulso — falha ${p.suspension} jogo(s) oficial(is).`);
    }
  }

  if (improved.length) pushNews(game, "squad", "Evolução", `Subiram de qualidade: ${improved.join(", ")}.`);

  // Registo da conta e histórico
  const acc = game.account;
  if (outcome === "V") acc.wins++; else if (outcome === "E") acc.draws++; else acc.losses++;
  game.history.unshift({ at: now, kind, opp: oppName, isHome, score: [gU, gO], outcome, auto });
  if (game.history.length > HISTORY_CAP) game.history.length = HISTORY_CAP;

  return { outcome, reward: reward + tickets, xpGained };
};

/* Treino de Elite: já validado com eliteBlock. Sobe o potencial e o jogador fica parado. */
export const startElite = (game, p, now = Date.now()) => {
  const cost = eliteCost(p);
  game.club.money -= cost;
  p.elite = (p.elite ?? 0) + 1;
  p.pot = Math.min(POT_HARD_CAP, p.pot + 1);
  p.eliteUntil = now + ELITE_DAYS * 24 * HOUR_MS;
  pushNews(game, "squad", "Treino de Elite", `${p.name} começou o programa: potencial ${p.pot}. Fica ${ELITE_DAYS} dias sem jogar.`, now);
  return cost;
};

export const fmtDur = (min) => {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, "0")}`;
};
