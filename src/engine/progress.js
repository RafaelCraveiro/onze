/* Progressão: XP/nível do clube, aplicação de resultados, EVOLUÇÃO POR JOGO.
   O jogo é online — não há dias: notícias e histórico usam timestamps reais,
   e os jogadores evoluem consoante o talento e os jogos que fazem. */

import {
  XP_WIN, XP_DRAW, MAX_LEVEL, xpForNext,
  REWARD_WIN_BASE, REWARD_DRAW_BASE, REWARD_LOSS_BASE, FRIENDLY_REWARD_MULT,
  FITNESS_MATCH_COST, stadiumIncome, INBOX_CAP, HISTORY_CAP, overallBase, fitnessFactor,
  MATCH_XP_BASE, MATCH_XP_MULT, talentGrowth, talentCap, SKILLS, lineOf,
} from "./constants.js";

/* Cada foco de treino direciona a experiência de jogo para certas sub-habilidades. */
export const FOCUS_SKILLS = {
  ataque: ["potencia", "precisao"],
  defesa: ["desarme", "marcacao"],
  tecnica: ["passe", "controlo", "drible"],
  fisico: ["resistencia"],
};

export const pushNews = (game, type, title, text, at = Date.now()) => {
  game.inbox.unshift({ at, type, title, text });
  if (game.inbox.length > INBOX_CAP) game.inbox.length = INBOX_CAP;
};

/* Vitória +3 XP, empate +1 — devolve níveis ganhos. */
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
  if (ups > 0) pushNews(game, "level", `Nível ${c.level}!`, `O clube subiu para o nível ${c.level}. As próximas taças já serão do teu novo nível.`);
  return ups;
};

/* Estimativa de força do plantel (para simulações rápidas sem eventos). */
export const userStrength = (game) => {
  const overs = game.players
    .filter((p) => (p.injuryMin ?? 0) <= 0)
    .map((p) => overallBase(p) * fitnessFactor(p.fitness))
    .sort((a, b) => b - a)
    .slice(0, 11);
  if (overs.length === 0) return 40;
  const avg = overs.reduce((s, v) => s + v, 0) / overs.length;
  return avg * Math.min(1, overs.length / 11);
};

/* Experiência de jogo de UM jogador (chamada por cada jogo disputado). */
const growFromMatch = (p, kind, focus, treinoLvl, boosted, minutesRating = 1) => {
  const ageMult = p.age <= 20 ? 1.35 : p.age <= 24 ? 1.05 : p.age <= 28 ? 0.75 : 0.35;
  const gain =
    MATCH_XP_BASE * (MATCH_XP_MULT[kind] ?? 1) * talentGrowth(p.talent) * ageMult *
    (1 + treinoLvl * 0.08) * (boosted ? 2 : 1) * minutesRating;
  const cap = talentCap(p.talent);
  const add = (skill, mult) => {
    p.skills[skill] = Math.min(cap, +(p.skills[skill] + gain * mult).toFixed(2));
  };
  const targets = FOCUS_SKILLS[focus];
  // viés da posição: guarda-redes desenvolvem o seu ofício independentemente do foco
  if (lineOf(p.pos) === "GR") {
    add("controlo", 0.35); add("resistencia", 0.3); add("marcacao", 0.25); add("desarme", 0.2);
  } else if (!targets) {
    for (const s of SKILLS) add(s, 0.16); // misto
  } else {
    for (const s of targets) add(s, 0.45);
    for (const s of SKILLS) if (!targets.includes(s)) add(s, 0.07);
  }
  return gain;
};

/* Aplica um resultado do utilizador ao estado (XP, dinheiro, energia, evolução…).
   kind: "amigavel" | "liga" | "taca". MUTA o game (chamar sobre uma cópia). */
export const applyUserResult = (game, { kind, userSide, result, oppName, isHome, auto = false, forfeit = false }) => {
  const now = Date.now();
  const [gh, ga] = result.score;
  const gU = userSide === "H" ? gh : ga;
  const gO = userSide === "H" ? ga : gh;
  const outcome = gU > gO ? "V" : gU < gO ? "D" : "E";
  const competitive = kind !== "amigavel";

  // XP do clube — TODAS as vitórias dão 3, empates 1 (como no 11x11)
  applyClubXp(game, outcome === "V" ? XP_WIN : outcome === "E" ? XP_DRAW : 0);

  // Dinheiro (sem salários — o rendimento vem dos jogos, prémios e vendas)
  // Falta de comparência: nem prémio de jogo nem bilheteira.
  let reward = 0, tickets = 0;
  if (!forfeit) {
    reward = outcome === "V" ? REWARD_WIN_BASE + game.club.level * 220 : outcome === "E" ? REWARD_DRAW_BASE : REWARD_LOSS_BASE;
    if (kind === "amigavel") reward = Math.round(reward * FRIENDLY_REWARD_MULT);
    if (isHome) tickets = Math.round(stadiumIncome(game.club.buildings.estadio, game.club.level) * (kind === "amigavel" ? 0.4 : 1));
    game.club.money += reward + tickets;
  }

  // Moral e adeptos
  game.club.morale = Math.max(5, Math.min(100, game.club.morale + (outcome === "V" ? 6 : outcome === "E" ? -1 : -7)));
  game.club.fans = Math.max(0, (game.club.fans ?? 100) + (outcome === "V" ? 18 + game.club.level * 6 : outcome === "E" ? 5 : -8));

  // Jogadores: energia, estatísticas, lesões, castigos e EVOLUÇÃO POR JOGO
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

  const boosted = (game.flags?.trainBoostUntil ?? 0) > now;
  const moraleDelta = outcome === "V" ? 8 : outcome === "E" ? 3 : -6;
  let grew = 0;
  for (const p of game.players) {
    if (competitive && p.suspension > 0 && !xiIds.has(p.id)) p.suspension--; // cumpriu jogo de castigo
    if (!xiIds.has(p.id)) continue;
    p.fitness = Math.max(0, p.fitness - FITNESS_MATCH_COST);
    p.morale = Math.max(0, Math.min(100, (p.morale ?? 0) + moraleDelta));
    p.stats.games++;
    p.stats.goals += goalsBy[p.id] ?? 0;
    p.stats.assists += assistsBy[p.id] ?? 0;
    grew += growFromMatch(p, kind, game.trainingFocus, game.club.buildings.treino, boosted);
    if (injuredMin[p.id]) {
      p.injuryMin = injuredMin[p.id];
      pushNews(game, "injury", "Lesão", `${p.name} lesionou-se — volta dentro de ${fmtDur(p.injuryMin)}.`);
    }
    if (competitive && suspended[p.id]) {
      p.suspension = suspended[p.id];
      pushNews(game, "card", "Expulsão", `${p.name} foi expulso — falha ${p.suspension} jogo(s) oficial(is).`);
    }
  }

  // Registo da conta e histórico
  const acc = game.account;
  if (outcome === "V") acc.wins++; else if (outcome === "E") acc.draws++; else acc.losses++;
  game.history.unshift({ at: now, kind, opp: oppName, isHome, score: [gU, gO], outcome, auto });
  if (game.history.length > HISTORY_CAP) game.history.length = HISTORY_CAP;

  return { outcome, reward: reward + tickets, xpGained: grew };
};

export const fmtDur = (min) => {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, "0")}`;
};
