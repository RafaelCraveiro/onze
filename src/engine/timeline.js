/* Constrói a linha temporal do viewer 2D a partir do resultado JÁ simulado.
   Cenografia pura: nada aqui altera o resultado. Coordenadas do campo em 0..1
   (x: baliza da casa à esquerda → baliza visitante à direita). */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Espelha coordenada x para a equipa visitante (ataca da direita para a esquerda)
const mx = (x, sideKey) => (sideKey === "H" ? x : 1 - x);

const rnd = (rng, a, b) => a + rng() * (b - a);

/* Cadeia procedural de passes até à zona de finalização — cada jogo é único. */
const buildAttack = (rng, sideKey, endX, endY) => {
  const n = 2 + Math.floor(rng() * 2); // 2–3 passes antes do lance final
  const pts = [];
  let x = rnd(rng, 0.3, 0.45), y = rnd(rng, 0.2, 0.8);
  pts.push([mx(x, sideKey), y]);
  for (let i = 1; i <= n; i++) {
    x = clamp(x + rnd(rng, 0.08, 0.2), 0, 0.92);
    y = clamp(y + rnd(rng, -0.3, 0.3), 0.08, 0.92);
    pts.push([mx(x, sideKey), y]);
  }
  pts.push([mx(endX, sideKey), endY]);
  return pts;
};

// converte lista de pontos em keyframes [t,x,y] com tempos uniformes
const toPath = (pts, t0 = 0, t1 = 1) =>
  pts.map((p, i) => [t0 + ((t1 - t0) * i) / (pts.length - 1), p[0], p[1]]);

const GOAL_TEXT = {
  open: ["Que jogada trabalhada! GOLO de", "Combinação perfeita e GOLO de", "Bola no fundo da rede! Marca"],
  counter: ["Contra-ataque letal! GOLO de", "Transição rápida e GOLO de"],
  longshot: ["QUE MÍSSIL de fora da área!", "Remate colocado de longe! GOLO de"],
  header: ["Cabeceamento imparável de", "Sobe mais alto que todos! GOLO de"],
  corner: ["Do canto resulta GOLO! Marca", "Ao segundo poste, GOLO de"],
};
const pickT = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/* Gera as cenas do jogo completo.
   result: saída de simulateMatch. Devolve { scenes, totalDur } — durações a 1x, em segundos. */
export const buildTimeline = (result, rng = Math.random) => {
  const scenes = [];
  const evs = [...result.events].sort((a, b) => a.min - b.min);
  let lastMin = 0;
  let score = [0, 0];

  const pushFlow = (fromMin, toMin) => {
    const gap = toMin - fromMin;
    if (gap <= 0) return;
    // posse alternada ponderada pela posse real
    const chunks = Math.max(1, Math.round(gap / 7));
    for (let c = 0; c < chunks; c++) {
      const side = rng() * 100 < result.possession[0] ? "H" : "A";
      const m0 = fromMin + (gap * c) / chunks;
      const m1 = fromMin + (gap * (c + 1)) / chunks;
      const pts = [];
      let x = rnd(rng, 0.3, 0.7), y = rnd(rng, 0.25, 0.75);
      const passes = 3 + Math.floor(rng() * 3);
      for (let i = 0; i <= passes; i++) {
        pts.push([clamp(x, 0.06, 0.94), clamp(y, 0.08, 0.92)]);
        const dir = side === "H" ? 1 : -1;
        x += rnd(rng, -0.1, 0.16) * dir;
        y += rnd(rng, -0.25, 0.25);
      }
      scenes.push({
        kind: "flow", side, minStart: m0, minEnd: m1,
        dur: clamp((m1 - m0) * 0.85, 1.1, 6.5),
        ball: toPath(pts),
        score: [...score],
      });
    }
  };

  scenes.push({ kind: "kickoff", dur: 2.6, minStart: 0, minEnd: 0, score: [0, 0], text: "Rola a bola! Começa o jogo." });

  const goalMouthY = () => rnd(rng, 0.42, 0.58);

  for (const ev of evs) {
    // intervalo aos 45
    if (lastMin < 45 && ev.min >= 45) {
      pushFlow(lastMin, 45);
      scenes.push({ kind: "halftime", dur: 2.4, minStart: 45, minEnd: 45, score: [...score], text: "Intervalo." });
      lastMin = 45;
    }
    pushFlow(lastMin, ev.min);
    lastMin = ev.min;
    const S = ev.side;

    if (ev.type === "goal") {
      score = ev.score ? [...ev.score] : score;
      const gy = goalMouthY();
      const attack = buildAttack(rng, S, ev.goalType === "longshot" ? 0.72 : 0.86, gy + rnd(rng, -0.12, 0.12));
      const shot = [mx(0.985, S), gy]; // bola forçada para dentro da baliza no render
      scenes.push({
        kind: "goal", side: S, min: ev.min, minStart: ev.min, minEnd: ev.min,
        dur: 6.2, ball: toPath([...attack, shot], 0, 0.72),
        scorerPid: ev.pid, assistPid: ev.assistPid,
        score: [...score],
        text: `${pickT(rng, GOAL_TEXT[ev.goalType] ?? GOAL_TEXT.open)} ${ev.name}${ev.assistName ? ` (assistência de ${ev.assistName})` : ""}!`,
        feedType: "goal",
      });
    } else if (ev.type === "save" || ev.type === "miss") {
      const gy = goalMouthY();
      const attack = buildAttack(rng, S, 0.82, gy + rnd(rng, -0.15, 0.15));
      const end = ev.type === "save" ? [mx(0.955, S), gy] : [mx(1.02, S), gy + (rng() < 0.5 ? -0.2 : 0.2)];
      scenes.push({
        kind: ev.type, side: S, min: ev.min, minStart: ev.min, minEnd: ev.min,
        pid: ev.pid,
        dur: 3.8, ball: toPath([...attack, end], 0, 0.85), score: [...score],
        text: ev.type === "save"
          ? `Remate de ${ev.name}… grande defesa de ${ev.gkName ?? "do guarda-redes"}!`
          : `${ev.name} atira… ao lado! Que oportunidade.`,
        feedType: "chance",
      });
    } else if (ev.type === "corner") {
      const cy = rng() < 0.5 ? 0.03 : 0.97;
      const attack = [[mx(0.7, S), rnd(rng, 0.3, 0.7)], [mx(0.99, S), cy], [mx(0.9, S), goalMouthY()], [mx(0.6, S), rnd(rng, 0.3, 0.7)]];
      scenes.push({
        kind: "corner", side: S, min: ev.min, minStart: ev.min, minEnd: ev.min,
        dur: 3.6, ball: toPath(attack), score: [...score],
        text: `Canto para ${S === "H" ? "a equipa da casa" : "os visitantes"} — a defesa afasta.`,
        feedType: "info",
      });
    } else if (ev.type === "yellow" || ev.type === "red" || ev.type === "red2" || ev.type === "foul") {
      const fx = mx(rnd(rng, 0.35, 0.6), S), fy = rnd(rng, 0.2, 0.8);
      const isRed = ev.type === "red" || ev.type === "red2";
      scenes.push({
        kind: isRed ? "red" : ev.type, side: S, min: ev.min, minStart: ev.min, minEnd: ev.min,
        pid: ev.pid,
        dur: isRed ? 4.2 : ev.type === "yellow" ? 3.2 : 2.2,
        ball: toPath([[fx, fy], [fx, fy]]), spot: [fx, fy],
        removePid: isRed ? ev.pid : undefined, score: [...score],
        text: isRed
          ? `CARTÃO VERMELHO! ${ev.name} ${ev.type === "red2" ? "vê o segundo amarelo e " : ""}vai mais cedo para os balneários!`
          : ev.type === "yellow" ? `Cartão amarelo para ${ev.name}.` : `Falta dura de ${ev.name}.`,
        feedType: isRed ? "red" : ev.type === "yellow" ? "yellow" : "info",
      });
    } else if (ev.type === "injury") {
      const fx = mx(rnd(rng, 0.3, 0.6), S), fy = rnd(rng, 0.25, 0.75);
      scenes.push({
        kind: "injury", side: S, min: ev.min, minStart: ev.min, minEnd: ev.min,
        dur: 3.6, ball: toPath([[fx, fy], [fx, fy]]), spot: [fx, fy],
        removePid: ev.subPid ? undefined : ev.pid, subPid: ev.subPid, subName: ev.subName, pid: ev.pid,
        score: [...score],
        text: `${ev.name} fica no chão… ${ev.subName ? `sai lesionado, entra ${ev.subName}.` : "sai lesionado."}`,
        feedType: "injury",
      });
    }
  }

  if (lastMin < 45) {
    pushFlow(lastMin, 45);
    scenes.push({ kind: "halftime", dur: 2.4, minStart: 45, minEnd: 45, score: [...score], text: "Intervalo." });
    lastMin = 45;
  }
  pushFlow(lastMin, 90);
  scenes.push({
    kind: "fulltime", dur: 3, minStart: 90, minEnd: 90, score: [...score],
    text: `Apita o árbitro — final do jogo! ${result.score[0]}-${result.score[1]}.`,
  });

  return { scenes, totalDur: scenes.reduce((s, sc) => s + sc.dur, 0) };
};
