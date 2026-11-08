/* O RELÓGIO DO JOGO (server-side) — plantel, dinheiro, mercado e taças vivem
   TODOS no servidor agora. As TAÇAS ficam em server/cups.mjs (multi-jogador,
   com um mundo de bots partilhado e global); aqui tratamos apenas do que é
   local a UM clube: energia que regenera ao minuto, torneira do mercado,
   academia, envelhecimento. processTime(game, now, rng) muta o game (montado
   pelo servidor a partir da base de dados) e faz catch-up do offline.
   Os helpers de leitura de taças abaixo operam sobre a lista de taças que o
   cliente recebe do servidor (game.cups). */

import {
  HOUR_MS, YOUTH_EVERY_MS, AGE_MS, isAgeBoundary, nextAgeBoundary, CUP_REG_WINDOW_MS,
  FITNESS_REGEN_PER_MIN, SQUAD_CAP, SKILLS,
} from "./constants.js";
import { YOU } from "./competitions.js";
import { genYouth } from "./generation.js";
import { refreshMarket } from "./market.js";
import { pushNews } from "./progress.js";

export const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* ============ helpers de leitura das taças (dados do servidor) ============ */

export const cupRoundDue = (cup) => cup.roundDueAt ?? cup.startsAt + cup.roundIdx * (cup.roundMs ?? 0);

export const userEliminated = (cup) => {
  if (cup.eliminated != null) return cup.eliminated; // o servidor já diz
  if (!cup.rounds || !cup.entrants?.includes(YOU)) return false;
  for (let i = cup.rounds.length - 1; i >= 0; i--) {
    const m = cup.rounds[i].find((m) => m.h === YOU || m.a === YOU);
    if (!m) continue;
    if (!m.score) return false;
    const won = m.h === YOU ? m.score[0] > m.score[1] : m.score[1] > m.score[0];
    return !won;
  }
  return false;
};

// A taça em que ainda estás VIVO (só podes ter uma; eliminado = livre para outra).
export const userActiveCup = (game) =>
  (game.cups ?? []).find(
    (c) =>
      c.entrants?.includes(YOU) &&
      (c.state === "inscricao" || (c.state === "decorrer" && !userEliminated(c)))
  ) ?? null;

/* Jogo do utilizador jogável AGORA (janela de registo aberta e por jogar). */
export const userCupMatch = (cup, now = Date.now()) => {
  if (cup.state !== "decorrer" || !cup.rounds) return null;
  const due = cupRoundDue(cup);
  if (now < due || now >= due + (cup.regWindowMs ?? CUP_REG_WINDOW_MS)) return null;
  if (cup.registered) return null; // já registaste esta ronda — à espera do resultado
  const round = cup.rounds[cup.roundIdx];
  return round?.find((m) => (m.h === YOU || m.a === YOU) && !m.score) ?? null;
};

export const cupRoundName = (idx) => ["Quartos-de-final", "Meias-finais", "FINAL"][idx] ?? `Ronda ${idx + 1}`;

/* ==================== MANUTENÇÃO CONTÍNUA ==================== */

const MAX_OFFLINE_YOUTHS = 4; // jovens da academia recebidos no máximo ao voltar de uma ausência

const processUpkeep = (game, now, rng) => {
  let changed = false;

  // energia e lesões regeneram ao minuto
  const lastTick = game.lastTick ?? now;
  const elapsedMin = Math.max(0, (now - lastTick) / 60000);
  if (elapsedMin >= 0.2) {
    const regen = elapsedMin * (FITNESS_REGEN_PER_MIN + game.club.buildings.medico * 0.03);
    for (const p of game.players) {
      if (p.fitness < 100) p.fitness = Math.min(100, +(p.fitness + regen).toFixed(2));
      if ((p.injuryMin ?? 0) > 0) p.injuryMin = Math.max(0, +(p.injuryMin - elapsedMin).toFixed(1));
    }
    game.lastTick = now;
    changed = true;
  }

  // tick horário: moral (com teto para regressos de offline).
  // Vender jogadores é agora 100% entre managers reais (server/club.mjs:
  // listTransfers/buyTransfer) — já não há comprador simulado a "comer" as
  // listagens, por isso um jogador só sai quando outro treinador o compra.
  let hourTicks = 0;
  let lastHourly = game.lastHourly ?? now;
  while (now - lastHourly >= HOUR_MS && hourTicks < 48) { hourTicks++; lastHourly += HOUR_MS; }
  if (now - lastHourly >= HOUR_MS) lastHourly = now; // offline muito longo: perdoa o resto
  if (hourTicks > 0) {
    game.club.morale = Math.round(Math.max(5, Math.min(100, game.club.morale + (game.club.morale < 65 ? 1.5 : -1) * Math.min(hourTicks, 6))) * 10) / 10;
    for (const p of game.players) p.morale = Math.min(100, (p.morale ?? 0) + hourTicks);
    changed = true;
  }
  game.lastHourly = lastHourly;

  // mercado renova continuamente
  const beforeIds = game.market.listings.map((l) => l.id).join();
  game.market = refreshMarket(game.market, rng, game.club.level, now);
  if (game.market.listings.map((l) => l.id).join() !== beforeIds) changed = true;

  // academia: um jovem de X em X horas
  if (!game.nextYouthAt) { game.nextYouthAt = now + YOUTH_EVERY_MS; changed = true; }
  let youthsDue = 0;
  while (now >= game.nextYouthAt) {
    if (youthsDue >= MAX_OFFLINE_YOUTHS) { game.nextYouthAt = now + YOUTH_EVERY_MS; break; } // offline longo: perdoa o resto
    youthsDue++;
    game.nextYouthAt += YOUTH_EVERY_MS;
    if (game.players.length >= SQUAD_CAP) continue;
    const youth = genYouth(rng, game.club.buildings.academia);
    game.players.push(youth);
    const star = youth.talent >= 7 ? " 🌟 UMA PÉROLA!" : youth.talent >= 5 ? " Grande promessa!" : "";
    pushNews(game, "academy", "Jovem da academia", `${youth.name} (${youth.pos}, ${youth.age} anos, talento ${youth.talent})${star}`);
    changed = true;
  }

  // envelhecimento: calendário único do servidor. Contas novas, ou ainda com o antigo
  // relógio individual, entram na próxima data comum sem pagar anos passados.
  if (!game.nextAgingAt || !isAgeBoundary(game.nextAgingAt)) { game.nextAgingAt = nextAgeBoundary(now); changed = true; }
  while (now >= game.nextAgingAt) {
    game.nextAgingAt += AGE_MS;
    for (const p of game.players) {
      p.age++;
      if (p.age >= 30) for (const s of SKILLS) p.skills[s] = Math.max(1, p.skills[s] - 0.6);
    }
    const retiring = game.players.filter((p) => p.age >= 36);
    if (retiring.length && game.players.length - retiring.length >= 11) {
      game.players = game.players.filter((p) => p.age < 36);
      pushNews(game, "squad", "Fim de carreira", `${retiring.map((p) => p.name).join(", ")} pendurou(aram) as botas.`);
    }
    pushNews(game, "squad", "Aniversários", "O plantel envelheceu um ano.");
    changed = true;
  }

  return changed;
};

/* ============================= MASTER ============================= */

export const processTime = (game, now = Date.now(), rng = Math.random) => {
  game.cups = game.cups ?? [];
  return processUpkeep(game, now, rng);
};
