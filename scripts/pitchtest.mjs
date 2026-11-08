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

console.log("\n[4] Jogos reais do motor: variedade e fluidez");
{
  const { simulateMatch } = await import("../src/engine/match.js");
  const { FORMATIONS } = await import("../src/engine/constants.js");
  const team = (formation, style) => {
    const slots = FORMATIONS[formation].map(([p]) => p);
    return { name: "T", slots, style, morale: 70, bench: [], medicoLvl: 1, players: slots.map((pos, i) => ({ id: `${formation}${style}${i}`, name: `J${i}`, pos, fitness: 100, morale: 70, skills: { desarme: 10, marcacao: 10, drible: 10, controlo: 10, resistencia: 10, passe: 10, potencia: 10, precisao: 10 } })) };
  };
  const styles = ["equilibrado", "ofensivo", "defensivo", "posse", "pressao", "contra"];
  const forms = Object.keys(FORMATIONS);
  let done = 0, wrong = 0, maxJump = 0, maxPlayer = 0, kinds = {}, runs = 40, stuck = 0, shotCells = new Set(), repeats = 0, seqs = 0, nan = 0, secs = 0, offSide = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateMatch({ home: team(forms[i % forms.length], styles[i % 6]), away: team(forms[(i + 2) % forms.length], styles[(i + 3) % 6]) });
    const sim = createPitchSim(r), st = sim.state;
    let prev = [...st.ball.pos], still = 0, n = 0, prevP = st.H.concat(st.A).map((a) => [...a.pos]);
    while (!st.done && n++ < 12000) {
      sim.step(0.033); secs += 0.033;
      if (!finite(st)) nan++;
      const jump = Math.hypot(st.ball.pos[0] - prev[0], st.ball.pos[1] - prev[1]);
      maxJump = Math.max(maxJump, jump);
      still = jump < 1e-5 ? still + 1 : 0;
      if (still > 400) stuck++;
      prev = [...st.ball.pos];
      const all = st.H.concat(st.A);
      all.forEach((a, k) => { if (!a.off) maxPlayer = Math.max(maxPlayer, Math.hypot(a.pos[0] - prevP[k][0], a.pos[1] - prevP[k][1])); prevP[k] = [...a.pos]; });
    }
    if (st.done) done++;
    if (st.score[0] !== r.score[0] || st.score[1] !== r.score[1]) wrong++;
    for (const k of st.passLog) kinds[k] = (kinds[k] ?? 0) + 1;
    for (let j = 3; j < st.passLog.length; j++) { seqs++; if (st.passLog[j] === st.passLog[j - 1] && st.passLog[j] === st.passLog[j - 2] && st.passLog[j] === st.passLog[j - 3]) repeats++; }
    for (const s of st.shots) { shotCells.add(`${Math.round(s.x * 20)}:${Math.round(s.y * 10)}`); if ((s.side === "H" && s.x < 0.5) || (s.side === "A" && s.x > 0.5)) offSide++; }
  }
  const total = Object.values(kinds).reduce((s, v) => s + v, 0);
  console.log("  tipos de ação:", Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join(", "));
  console.log(`  duração média a 1x: ${(secs / runs).toFixed(0)}s · maior salto da bola por frame: ${maxJump.toFixed(3)} · maior salto de jogador: ${maxPlayer.toFixed(3)} · zonas de remate: ${shotCells.size}`);
  check("todos os jogos terminam", done === runs, `(${done}/${runs})`);
  check("o placar final bate sempre certo", wrong === 0, `(${wrong})`);
  check("sem NaN", nan === 0, `(${nan})`);
  check("a bola nunca teletransporta", maxJump < 0.1, `(${maxJump.toFixed(3)})`);
  check("os jogadores nunca teletransportam", maxPlayer < 0.03, `(${maxPlayer.toFixed(3)})`);
  check("a bola não fica parada muito tempo", stuck === 0, `(${stuck})`);
  check("pelo menos 6 tipos de ação diferentes", Object.keys(kinds).length >= 6, JSON.stringify(Object.keys(kinds)));
  check("nenhum tipo domina (> 45%)", Math.max(...Object.values(kinds)) / total <= 0.45);
  check("raramente 4 ações iguais seguidas (< 8%)", repeats / seqs < 0.08, `(${(100 * repeats / seqs).toFixed(1)}%)`);
  check("remates de pelo menos 25 zonas diferentes", shotCells.size >= 25, `(${shotCells.size})`);
  check("remates sempre no meio-campo ofensivo", offSide === 0, `(${offSide})`);
}

console.log(fails === 0 ? "\n✅ MOTOR 2D OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
