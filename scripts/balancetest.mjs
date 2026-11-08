/* Mede quanto do resultado vem da qualidade, da tática e da sorte (motor real).
   Uso: node scripts/balancetest.mjs [nº de jogos por cenário, 3000 por omissão] */
import { simulateMatch } from "../src/engine/match.js";
import { FORMATIONS, STYLES } from "../src/engine/constants.js";

const N = Number(process.argv[2] ?? 3000);
let nextId = 0;

const profile = (pos, base, focus = {}) => {
  const line = pos === "Gk" ? "GR" : pos.endsWith("d") ? "DF" : pos.endsWith("m") ? "MD" : "AV";
  const w = {
    GR: { finalizacao: 0.5, criacao: 0.6, velocidade: 0.4, fisico: 1, defesa: 0.3, reflexos: 1.055 },
    DF: { finalizacao: 0.55, criacao: 0.8, velocidade: 0.6, fisico: 1.1, defesa: 1.2, reflexos: 0.2 },
    MD: { finalizacao: 0.8, criacao: 1.25, velocidade: 1, fisico: 1.1, defesa: 0.85, reflexos: 0.2 },
    AV: { finalizacao: 1.25, criacao: 0.9, velocidade: 1.2, fisico: 1, defesa: 0.4, reflexos: 0.2 },
  }[line];
  const f = focus[line] ?? 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.max(1, Math.min(99, base * 4 * v * f))]));
};

const team = ({ base = 10, formation = "4-4-2", style = "equilibrado", focus = {}, misplaced = false, morale = 70, fitness = 100 }) => {
  const slots = FORMATIONS[formation].map(([p]) => p);
  const players = slots.map((slot) => {
    const pos = misplaced && slot !== "Gk" ? (/d$/.test(slot) ? "Cf" : /f$/.test(slot) ? "Cd" : slot) : slot;
    return { id: `p${++nextId}`, name: `J${nextId}`, pos, skills: profile(pos, base, focus), fitness, morale };
  });
  return { name: "T", players, bench: [], slots, style, morale, medicoLvl: 1 };
};

const run = (a, b) => {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, sf = 0, sa = 0, ps = 0, xgf = 0, xga = 0;
  for (let i = 0; i < N; i++) {
    // metade em casa, metade fora, para isolar a qualidade da vantagem de campo
    const home = i % 2 === 0;
    const r = home ? simulateMatch({ home: team(a), away: team(b) }) : simulateMatch({ home: team(b), away: team(a) });
    const [x, y] = home ? r.score : [r.score[1], r.score[0]];
    if (x > y) w++; else if (x === y) d++; else l++;
    gf += x; ga += y;
    sf += home ? r.shots[0] : r.shots[1]; sa += home ? r.shots[1] : r.shots[0];
    ps += home ? r.possession[0] : r.possession[1];
    if (r.xg) { xgf += home ? r.xg[0] : r.xg[1]; xga += home ? r.xg[1] : r.xg[0]; }
  }
  const pct = (v) => `${(100 * v / N).toFixed(1)}%`.padStart(6);
  const f = (v) => (v / N).toFixed(2);
  return `V ${pct(w)} E ${pct(d)} D ${pct(l)} | golos ${f(gf)}-${f(ga)} | remates ${f(sf)}-${f(sa)} | posse ${f(ps)}${xgf ? ` | xG ${f(xgf)}-${f(xga)}` : ""}`;
};

const show = (label, a, b) => console.log(`${label.padEnd(44)} ${run(a, b)}`);

console.log(`\n${N} jogos por cenário, equipa A primeiro\n\n— QUALIDADE (A melhor do que B) —`);
show("igual (10 vs 10)", { base: 10 }, { base: 10 });
show("+5% (10.5 vs 10)", { base: 10.5 }, { base: 10 });
show("+10% (11 vs 10)", { base: 11 }, { base: 10 });
show("+20% (12 vs 10)", { base: 12 }, { base: 10 });
show("+40% (14 vs 10)", { base: 14 }, { base: 10 });
show("+100% (20 vs 10)", { base: 20 }, { base: 10 });
show("nível alto: 22 vs 20", { base: 22 }, { base: 20 });

console.log("\n— ONDE ESTÁ A QUALIDADE (força total semelhante) —");
show("meio-campo forte vs equilibrada", { focus: { MD: 1.3, AV: 0.85, DF: 0.85 } }, {});
show("ataque forte vs equilibrada", { focus: { AV: 1.3, MD: 0.85, DF: 0.85 } }, {});
show("defesa forte vs equilibrada", { focus: { DF: 1.3, MD: 0.85, AV: 0.85 } }, {});
show("jogadores fora de posição vs bem colocados", { misplaced: true }, {});

console.log("\n— ESTILO (mesma qualidade) —");
const styles = Object.keys(STYLES);
for (const a of styles) for (const b of styles) if (a < b) show(`${a} vs ${b}`, { style: a }, { style: b });

console.log("\n— ESTATÍSTICAS DE UM JOGO EQUILIBRADO (alvos reais entre parênteses) —");
{
  let goals = 0, shots = 0, target = 0, corners = 0, set = 0, home = 0, draw = 0, away = 0, longs = 0, longGoals = 0, boxGoals = 0, boxShots = 0, cards = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch({ home: team({}), away: team({}) });
    goals += r.score[0] + r.score[1]; shots += r.shots[0] + r.shots[1]; target += r.onTarget[0] + r.onTarget[1]; corners += r.corners[0] + r.corners[1];
    if (r.score[0] > r.score[1]) home++; else if (r.score[0] === r.score[1]) draw++; else away++;
    for (const e of r.events) {
      if (e.type === "yellow") cards++;
      if (!["goal", "save", "miss"].includes(e.type) || e.penalty) { if (e.type === "goal") set++; continue; }
      if (e.goalType === "corner") { set++; continue; }
      const isLong = e.shot === "long";
      if (isLong) longs++; else boxShots++;
      if (e.type === "goal") { if (isLong) longGoals++; else boxGoals++; }
    }
  }
  console.log(`golos/jogo ${(goals / N).toFixed(2)} (2,7) · remates ${(shots / N).toFixed(1)} (24-26) · à baliza ${(100 * target / shots).toFixed(0)}% (33-35%) · cantos ${(corners / N).toFixed(1)} (10) · bolas paradas ${(100 * set / goals).toFixed(0)}% dos golos (24-28%)`);
  console.log(`área: ${(100 * boxShots / (boxShots + longs)).toFixed(0)}% dos remates (56-59%), conversão ${(100 * boxGoals / boxShots).toFixed(1)}% (13-15%) · fora da área: ${(100 * longGoals / longs).toFixed(1)}% (3,5%)`);
  console.log(`casa ${(100 * home / N).toFixed(1)}% · empate ${(100 * draw / N).toFixed(1)}% · fora ${(100 * away / N).toFixed(1)}% (cerca de 45/25/30)`);
}

console.log("\n— FORMAÇÃO (mesma qualidade) —");
const forms = Object.keys(FORMATIONS);
console.log("formações:", forms.join(", "));
for (const f of forms) if (f !== "4-4-2") show(`${f} vs 4-4-2`, { formation: f }, {});

console.log("\n— ESTADO DA EQUIPA —");
show("cansada (energia 55) vs fresca", { fitness: 55 }, {});
show("moral baixa (20) vs normal", { morale: 20 }, {});
