/* Invariantes do motor de coreografia (src/ui/components/pitchSim.js):
   corre o jogo até ao fim e garante que — apesar do movimento aleatório — o
   placar final bate certo com o resultado já decidido, os expulsos saem de
   campo, e nada rebenta (sem NaN, termina sempre). */
import { createPitchSim } from "../src/ui/components/pitchSim.js";

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };

const xi = (side) => {
  const plan = ["Gk", "Ld", "Cd", "Cd", "Rd", "Lm", "Cm", "Cm", "Rm", "Cf", "Cf"];
  return plan.map((pos, i) => ({ id: `p_${side}_${i}`, name: `${side.toUpperCase()}${i}`, pos }));
};

const makeResult = () => ({
  score: [2, 1],
  possession: [58, 42],
  homeXI: xi("h"), awayXI: xi("a"),
  penalties: null,
  events: [
    { min: 12, type: "goal", side: "H", pid: "p_h_9", name: "H9", goalType: "open", score: [1, 0] },
    { min: 27, type: "yellow", side: "A", pid: "p_a_3", name: "A3" },
    { min: 40, type: "corner", side: "H", pid: "p_h_10", name: "H10" },
    { min: 44, type: "save", side: "A", pid: "p_a_10", name: "A10", gkName: "H0" },
    { min: 58, type: "goal", side: "A", pid: "p_a_10", name: "A10", assistPid: "p_a_9", assistName: "A9", goalType: "counter", score: [1, 1] },
    { min: 70, type: "red", side: "H", pid: "p_h_5", name: "H5" },
    { min: 76, type: "miss", side: "H", pid: "p_h_10", name: "H10" },
    { min: 82, type: "goal", side: "H", pid: "p_h_10", name: "H10", goalType: "corner", score: [2, 1] },
    { min: 88, type: "injury", side: "A", pid: "p_a_7", name: "A7" },
  ],
});

const finite = (st) => {
  for (const s of ["H", "A"]) for (const a of st[s]) if (!Number.isFinite(a.pos[0]) || !Number.isFinite(a.pos[1])) return false;
  return Number.isFinite(st.ball.pos[0]) && Number.isFinite(st.ball.pos[1]);
};

console.log("\n[1] 30 jogos completos: placar final, expulsões, sem NaN, termina sempre, remates da zona certa");
let allFinite = true, allScore = true, redGone = 0, injGone = 0, terminated = 0, goalsSeen = 0;
let totalShots = 0, badShots = 0;
for (let run = 0; run < 30; run++) {
  const result = makeResult();
  const sim = createPitchSim(result);
  let steps = 0, sawGoalBanner = false;
  while (!sim.state.done && steps++ < 8000) {
    sim.step(0.05 * 4); // 4x para acelerar o teste
    if (!finite(sim.state)) allFinite = false;
    if (sim.state.banner?.kind === "goal") sawGoalBanner = true;
  }
  if (sim.state.done) terminated++;
  if (sim.state.score[0] === 2 && sim.state.score[1] === 1) allScore = true; else allScore = false;
  if (sim.state.H.find((a) => a.id === "p_h_5")?.off) redGone++;
  if (sim.state.A.find((a) => a.id === "p_a_7")?.off) injGone++;
  if (sawGoalBanner) goalsSeen++;
  // remates: a casa (H, ataca à direita) tem de rematar do lado direito (x>=0.5);
  // os visitantes (A, atacam à esquerda) do lado esquerdo (x<=0.5). Nunca da própria defesa.
  for (const s of sim.state.shots) {
    totalShots++;
    if ((s.side === "H" && s.x < 0.5) || (s.side === "A" && s.x > 0.5)) badShots++;
  }
}
check("termina sempre (30/30)", terminated === 30, `(${terminated})`);
check("placar final = resultado [2,1]", allScore);
check("nunca há NaN nas posições", allFinite);
check("o expulso (red) saiu de campo em todos", redGone === 30, `(${redGone}/30)`);
check("o lesionado sem suplente saiu em todos", injGone === 30, `(${injGone}/30)`);
check("houve celebração de golo (banner) em todos", goalsSeen === 30, `(${goalsSeen}/30)`);
check("nenhum remate nasce na própria metade defensiva", badShots === 0, `(${badShots}/${totalShots} maus)`);
check("houve remates registados", totalShots > 0, `(${totalShots})`);

console.log("\n[2] Empate 0-0 (sem eventos) também termina e fica 0-0");
{
  const r = { score: [0, 0], possession: [50, 50], homeXI: xi("h"), awayXI: xi("a"), penalties: null, events: [] };
  const sim = createPitchSim(r);
  let steps = 0;
  while (!sim.state.done && steps++ < 8000) sim.step(0.05 * 4);
  check("termina", sim.state.done);
  check("placar 0-0", sim.state.score[0] === 0 && sim.state.score[1] === 0, JSON.stringify(sim.state.score));
}

console.log("\n[3] skip() salta para o fim e devolve o relato restante");
{
  const sim = createPitchSim(makeResult());
  sim.step(0.05); // um passo só
  const nf = sim.skip();
  check("skip termina o jogo", sim.state.done);
  check("skip fixa o placar final", sim.state.score[0] === 2 && sim.state.score[1] === 1);
  check("skip devolve itens de relato", Array.isArray(nf) && nf.length > 0, `(${nf?.length})`);
}

console.log(fails === 0 ? "\n✅ MOTOR 2D OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
