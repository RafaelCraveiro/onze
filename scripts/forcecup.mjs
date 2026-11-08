/* Ferramenta de TESTE: antecipa o arranque de uma taça e (opcionalmente) força
   o emparelhamento dos dois utilizadores reais na ronda 0.
   Uso: node scripts/forcecup.mjs <cupId> [--pair] */
import { openDatabase } from "../server/db.mjs";

const db = await openDatabase();

const cupId = process.argv[2];
const pair = process.argv.includes("--pair");
if (!cupId) { console.error("indica o cupId"); process.exit(1); }

const cup = await db.prepare("SELECT * FROM cups WHERE id = ?").get(cupId);
if (!cup) { console.error("taça não encontrada"); process.exit(1); }

if (cup.state === "inscricao") {
  const t = Date.now() - 1000;
  await db.prepare("UPDATE cups SET starts_at = ?, round_due_at = ? WHERE id = ?").run(t, t, cupId);
  console.log("⏩ arranque antecipado para agora — faz um pedido /api/cups para o tick arrancar a taça");
} else {
  console.log("estado atual:", cup.state, "ronda", cup.round_idx);
}

if (pair) {
  const ms = await db.prepare("SELECT * FROM cup_matches WHERE cup_id = ? AND round = 0 ORDER BY midx").all(cupId);
  const users = (await db.prepare("SELECT slot FROM cup_entrants WHERE cup_id = ? AND kind = 'user' ORDER BY slot").all(cupId)).map((r) => r.slot);
  if (ms.length && users.length >= 2) {
    const [u1, u2] = users;
    const rest = [...Array(8).keys()].filter((s) => s !== u1 && s !== u2);
    const pairs = [[u1, u2], [rest[0], rest[1]], [rest[2], rest[3]], [rest[4], rest[5]]];
    // limpa resultados/registos da ronda 0 (senão ficam colados ao emparelhamento antigo)
    await db.prepare("UPDATE cup_matches SET home_score = NULL, away_score = NULL, result = NULL, played_at = NULL WHERE cup_id = ? AND round = 0").run(cupId);
    await db.prepare("DELETE FROM cup_regs WHERE cup_id = ? AND round = 0").run(cupId);
    await db.prepare("DELETE FROM cup_matches WHERE cup_id = ? AND round > 0").run(cupId);
    await db.prepare("UPDATE cups SET round_idx = 0, state = 'decorrer', winner_slot = NULL, finalist_slot = NULL, round_due_at = ? WHERE id = ?").run(Date.now() - 1000, cupId);
    for (const [i, [h, a]] of pairs.entries()) {
      await db.prepare("UPDATE cup_matches SET home_slot = ?, away_slot = ? WHERE cup_id = ? AND round = 0 AND midx = ?").run(h, a, cupId, i);
    }
    console.log(`🤝 ronda 0 reposta e forçada: slots ${u1} vs ${u2} no jogo 0`);
  } else {
    console.log("(ainda não há bracket ou não há 2 utilizadores)");
  }
}
const after = await db.prepare("SELECT state, round_idx FROM cups WHERE id = ?").get(cupId);
console.log("taça:", after.state, "ronda", after.round_idx);
