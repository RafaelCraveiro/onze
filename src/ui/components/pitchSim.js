/* Motor de COREOGRAFIA do jogo 2D. NÃO decide nada: recebe `result` (simulateMatch)
   e encena-o. Cada jogada segue uma posse real do motor (`flow`: quem ataca, por que
   corredor, até onde chega, como acaba) ou um evento (golo, defesa, canto, cartão).

   Para o jogo não se repetir:
   - os passes escolhem-se entre várias opções reais (curto, atrás, variação, em profundidade)
     por sorteio ponderado, e cada estilo de jogada pesa as opções de forma diferente;
   - os jogadores sem bola fazem corridas próprias (desmarcações, sobreposições, baixar para
     receber), a defesa mantém linha, pressiona e cobre linhas de passe;
   - a bola nunca teletransporta: até em bola parada rola para o sítio.

   É pura (sem canvas/React): dá-se-lhe `dt` e ela avança o estado; o renderizador só lê `sim.state`. */

import { lineOf } from "../../engine/constants.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const len = (x, y) => Math.hypot(x, y);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SPEED = 0.17;     // corrida normal (campo/seg, a 1x)
const SPRINT = 1.5;
const GK_SPEED = 0.11;
const SHOT_SPD = 1.75;
const TIME_SCALE = 1.35; // ritmo geral do espetáculo a 1x
const PACE = 0.95;      // minutos de jogo por segundo real, a 1x
const ATK_TYPES = ["goal", "save", "miss", "corner"];
const LANE_Y = { L: 0.2, C: 0.5, R: 0.8 };

const GOAL_TEXT = {
  open: ["Jogada trabalhada e GOLO de", "Combinação perfeita, marca", "No fundo da rede! Marca"],
  counter: ["Contra-ataque letal, GOLO de", "Transição rápida, marca", "Saída fulminante e golo de"],
  longshot: ["MÍSSIL de fora da área,", "Remate colocado de longe de", "De meia-distância, golaço de"],
  header: ["Cabeceamento imparável de", "Sobe mais alto e marca", "De cabeça, golo de"],
  corner: ["Do canto, GOLO de", "Ao segundo poste, marca", "Na sequência do canto, marca"],
  penalty: ["De penálti, não falha", "Da marca dos 11 metros, marca"],
};
const SAVE_TEXT = ["grande defesa de", "voa e segura", "resposta segura de", "nega o golo:"];
const MISS_TEXT = ["atira ao lado.", "remata por cima.", "não acerta na baliza.", "falha o alvo por pouco."];
const BLOCK_TEXT = ["remate bloqueado pela defesa.", "a defesa atira-se e corta o remate."];
const LANE_TXT = { L: "pela esquerda", C: "pelo centro", R: "pela direita" };

/* Tática → altura da equipa e intensidade da pressão no 2D */
const SHAPE = {
  equilibrado: { line: 0, press: 1 }, ofensivo: { line: 0.05, press: 1.1 }, defensivo: { line: -0.08, press: 0.65 },
  posse: { line: 0.03, press: 0.95 }, pressao: { line: 0.09, press: 1.5 }, contra: { line: -0.06, press: 0.8 },
};

const laneOfPos = (pos) => (pos?.[0] === "L" ? "L" : pos?.[0] === "R" ? "R" : "C");
const baseSpots = (xi, home) => {
  const lines = { GR: [], DF: [], MD: [], AV: [] };
  xi.forEach((p, i) => lines[lineOf(p.pos)].push(i));
  const X = { GR: 0.05, DF: 0.22, MD: 0.42, AV: 0.62 };
  const order = { L: 0, C: 1, R: 2 };
  const out = Array.from({ length: xi.length });
  for (const [line, idxs] of Object.entries(lines)) {
    idxs.sort((a, b) => order[laneOfPos(xi[a].pos)] - order[laneOfPos(xi[b].pos)]);
    idxs.forEach((idx, j) => {
      const y = idxs.length === 1 ? 0.5 : 0.14 + (0.72 * j) / (idxs.length - 1);
      // médios e avançados centrais em ligeiro zigue-zague, para não formarem uma fila
      const stagger = line !== "GR" && idxs.length > 2 && j % 2 ? -0.025 : 0;
      out[idx] = [home ? X[line] + stagger : 1 - X[line] - stagger, y];
    });
  }
  return out;
};

export function createPitchSim(result) {
  const mk = (xi, spots) => xi.map((p, i) => ({
    id: p.id, name: p.name, num: i + 1, gk: lineOf(p.pos) === "GR", line: lineOf(p.pos), lane: laneOfPos(p.pos),
    base: [...spots[i]], pos: [...spots[i]], vel: [0, 0],
    off: false, down: false, run: null, fast: false, dive: false,
    pace: rnd(0.92, 1.08), phase: Math.random() * 6.28, wander: rnd(0.5, 1.1),
    plan: null, planT: rnd(0, 2),
  }));

  const st = {
    H: mk(result.homeXI, baseSpots(result.homeXI, true)),
    A: mk(result.awayXI, baseSpots(result.awayXI, false)),
    ball: { pos: [0.5, 0.5], vel: [0, 0], z: 0, carrier: null, mode: "loose", recv: null, collector: null, flightT: 0, high: false },
    poss: "H", minute: 0, score: [0, 0], done: false,
    banner: null, flash: 0, goalCount: 0, kickSide: "H",
    sfx: [], started: false, shots: [], passLog: [],
  };

  const events = [...result.events].sort((a, b) => a.min - b.min);
  const flow = result.flow?.length ? result.flow : syntheticFlow(result);
  const shapes = { H: SHAPE[result.styles?.[0]] ?? SHAPE.equilibrado, A: SHAPE[result.styles?.[1]] ?? SHAPE.equilibrado };
  let evIdx = 0, flowIdx = 0;
  let play = null;       // jogada em curso
  let restart = null;    // bola parada em preparação
  let holdT = 0.6;
  let lastPasser = null;
  let lastKind = null;
  let newFeed = [];
  let quietFeed = 0;

  const other = (s) => (s === "H" ? "A" : "H");
  const team = (s) => (s === "H" ? st.H : st.A);
  const ref = (r) => team(r.side)[r.idx];
  const attackX = (s) => (s === "H" ? 1 : 0);
  const ownX = (s) => (s === "H" ? 0.025 : 0.975);
  const sgn = (s) => (s === "H" ? 1 : -1);
  const alive = (s) => team(s).map((a, i) => ({ a, i })).filter((o) => !o.a.off && !o.a.gk);
  const gkIdx = (s) => team(s).findIndex((x) => x.gk && !x.off);
  const depthOf = (s, x) => (s === "H" ? x : 1 - x);
  const idxOfPid = (side, pid) => team(side).findIndex((x) => x.id === pid && !x.off);

  const say = (min, text, type) => newFeed.push({ min: Math.round(min), text, type });
  const setBanner = (text, kind, ttl = 1.6) => { st.banner = { text, kind, ttl }; };
  const sfx = (kind) => st.sfx.push(kind);

  const setCarrier = (side, idx) => {
    if (idx < 0) return;
    st.poss = side;
    Object.assign(st.ball, { carrier: { side, idx }, mode: "carry", recv: null, collector: null, high: false });
    holdT = rnd(0.32, 0.8);
  };

  const nearest = (side, x, y, skipIdx = -1, incGk = false) => {
    let best = -1, bd = 9;
    team(side).forEach((a, i) => {
      if (a.off || (a.gk && !incGk) || i === skipIdx) return;
      const d = len(a.pos[0] - x, a.pos[1] - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  const distToOpp = (side, x, y) => {
    let m = 9;
    for (const o of team(other(side))) if (!o.off) m = Math.min(m, len(o.pos[0] - x, o.pos[1] - y));
    return m;
  };

  /* ---------------- bola: passes, bola solta, bola parada ---------------- */
  const launch = (tx, ty, speed, recv, high = false, kind = "pass") => {
    const b = st.ball;
    const x = clamp(tx, 0.012, 0.988), y = clamp(ty, 0.012, 0.988);
    const d = Math.max(0.001, len(x - b.pos[0], y - b.pos[1]));
    Object.assign(b, { mode: "pass", carrier: null, recv, collector: null, flightT: 0, high, target: [x, y], flightDur: d / speed });
    b.vel = [((x - b.pos[0]) / d) * speed, ((y - b.pos[1]) / d) * speed];
    if (recv) { const r = ref(recv); if (r) { r.run = [x, y]; r.fast = d > 0.18; } }
    st.passLog.push(kind);
    if (st.passLog.length > 900) st.passLog.shift();
    sfx("kick");
  };
  const passTo = (side, idx, kind = "pass", lead = 0.2) => {
    const b = st.ball, r = team(side)[idx];
    if (!r || r.off) return;
    if (b.carrier) lastPasser = b.carrier.idx;
    lastKind = kind;
    const tx = r.pos[0] + r.vel[0] * lead, ty = r.pos[1] + r.vel[1] * lead;
    const d = len(tx - b.pos[0], ty - b.pos[1]);
    const high = d > 0.36 || kind === "cross";
    launch(tx, ty, high ? clamp(0.7 + d * 0.5, 0.75, 1.05) : clamp(0.62 + d * 1.5, 0.68, 1.25), { side, idx }, high, kind);
  };
  const throughBall = (side, idx, dist) => {
    const b = st.ball, r = team(side)[idx], dir = sgn(side);
    if (b.carrier) lastPasser = b.carrier.idx;
    lastKind = "through";
    const tx = clamp(r.pos[0] + dir * dist, 0.06, 0.94), ty = lerp(r.pos[1], 0.5, 0.25);
    launch(tx, ty, clamp(0.7 + dist * 2, 0.75, 1.15), { side, idx }, false, "through");
    r.run = [tx, ty]; r.fast = true;
  };
  const looseTo = (side, vx, vy) => {
    const b = st.ball;
    const idx = nearest(side, b.pos[0], b.pos[1], -1, true);
    Object.assign(b, { mode: "loose", carrier: null, recv: null, high: false, z: 0, vel: [vx, vy], collector: idx >= 0 ? { side, idx } : null });
    st.poss = side;
  };
  const placeBall = (x, y, then) => {
    const b = st.ball;
    Object.assign(b, { mode: "place", carrier: null, recv: null, collector: null, high: false, z: 0, target: [x, y], onPlaced: then });
  };
  const clearLong = (side) => {
    const b = st.ball, dir = sgn(side);
    const tx = clamp(b.pos[0] + dir * rnd(0.22, 0.42), 0.08, 0.92), ty = clamp(b.pos[1] + rnd(-0.28, 0.28), 0.07, 0.93);
    launch(tx, ty, 1, null, true, "clear");
    b.afterFlight = side;
    st.poss = side;
  };

  /* ---------------- decisões de quem tem a bola ---------------- */
  const PATTERN = {
    build: { back: 1, lateral: 1.5, forward: 1.5, switch: 0.5, through: 0.35, dribble: 0.55 },
    wide: { back: 0.6, lateral: 1.1, forward: 1.8, switch: 0.7, through: 0.5, dribble: 0.95 },
    direct: { back: 0.25, lateral: 0.45, forward: 2.3, switch: 0.5, through: 1.3, dribble: 0.6 },
    counter: { back: 0.05, lateral: 0.3, forward: 2.7, switch: 0.6, through: 2, dribble: 1.2 },
  };

  const decide = () => {
    const b = st.ball;
    const side = b.carrier.side, ci = b.carrier.idx, c = team(side)[ci], dir = sgn(side);
    const pat = PATTERN[play?.pattern] ?? PATTERN.build;
    const pressure = distToOpp(side, c.pos[0], c.pos[1]);
    const pressed = pressure < 0.055;
    const laneY = LANE_Y[play?.lane ?? "C"];

    if (c.gk) { // guarda-redes: curto para a defesa ou pontapé longo
      const cands = alive(side).filter((o) => o.a.line === "DF" && distToOpp(side, o.a.pos[0], o.a.pos[1]) > 0.09);
      if (cands.length && Math.random() < 0.65) passTo(side, pick(cands).i, "gk");
      else { const t = alive(side).filter((o) => o.a.line !== "DF"); if (t.length) passTo(side, pick(t).i, "gk", 0.1); }
      return;
    }

    const options = [];
    for (const { a, i } of alive(side)) {
      if (i === ci) continue;
      const dx = (a.pos[0] - c.pos[0]) * dir, dy = a.pos[1] - c.pos[1], d = len(dx, dy);
      if (d < 0.06) continue;
      const open = clamp(distToOpp(side, a.pos[0], a.pos[1]) / 0.11, 0.1, 1.25);
      const kind = Math.abs(dy) > 0.34 ? "switch" : dx > 0.05 ? "forward" : dx < -0.04 ? "back" : "lateral";
      const distFit = d > 0.46 ? 0.25 : d > 0.32 ? 0.7 : 1;
      const laneFit = 1 - Math.min(0.7, Math.abs(a.pos[1] - laneY) * 0.9);
      let w = pat[kind] * open * open * distFit * laneFit * rnd(0.55, 1.45);
      if (pressed && (kind === "back" || kind === "lateral")) w *= 1.8;
      if (i === lastPasser) w *= 0.3;           // evita o vaivém entre os mesmos dois
      if (kind === lastKind) w *= 0.7;          // alterna o tipo de passe
      options.push({ type: "pass", i, kind, w });
      if (dx > 0.02 && a.line !== "DF" && depthOf(side, a.pos[0]) > 0.4 && depthOf(side, a.pos[0]) < 0.84) {
        const defLine = Math.min(...team(other(side)).filter((o) => !o.off && !o.gk).map((o) => len(o.pos[0] - (a.pos[0] + dir * 0.1), o.pos[1] - a.pos[1])));
        options.push({ type: "through", i, kind: "through", w: pat.through * clamp(defLine / 0.1, 0.1, 1.3) * laneFit * rnd(0.4, 1.3) });
      }
    }
    const dribbleW = pat.dribble * (pressed ? 0.45 : clamp(pressure / 0.1, 0.3, 1.5)) * rnd(0.6, 1.4) * (lastKind === "dribble" ? 0.5 : 1);
    options.push({ type: "dribble", w: dribbleW });

    const total = options.reduce((s, o) => s + o.w, 0);
    let r = Math.random() * total, choice = options[options.length - 1];
    for (const o of options) { r -= o.w; if (r <= 0) { choice = o; break; } }

    if (choice.type === "dribble") { lastKind = "dribble"; st.passLog.push("dribble"); holdT = rnd(0.5, 1.15); c.dribbleY = clamp(c.pos[1] + rnd(-0.14, 0.14) + (laneY - c.pos[1]) * 0.25, 0.06, 0.94); return; }
    if (choice.type === "through") throughBall(side, choice.i, rnd(0.07, 0.15));
    else passTo(side, choice.i, choice.kind);
  };

  /* ---------------- início e fim das jogadas ---------------- */
  const takeBall = (side) => {
    const b = st.ball;
    if (b.mode === "carry" && b.carrier?.side === side) return;
    if (b.mode === "pass" && (b.recv?.side === side)) return;
    if (b.mode === "carry" && b.carrier) {
      // desarme/disputa: a bola solta-se e a equipa que ataca a seguir fica com ela
      const dir = sgn(side);
      looseTo(side, dir * rnd(0.12, 0.3), rnd(-0.22, 0.22));
    } else if (b.mode !== "place") {
      looseTo(side, b.vel[0] * 0.4, b.vel[1] * 0.4);
    }
  };

  /* quem ataca tem de ter a bola: se ficou com o adversário, disputa-a em vez de encravar */
  const ensureOwner = (p) => {
    if (p.t < 0.35) return;
    const b = st.ball;
    if (b.mode === "carry" && b.carrier && b.carrier.side !== p.side) takeBall(p.side);
    else if (b.mode === "loose" && b.collector?.side !== p.side) looseTo(p.side, b.vel[0], b.vel[1]);
    else if (b.mode === "still") looseTo(p.side, 0, 0);
  };

  const beginFlow = (it) => {
    play = { kind: "chain", side: it.s, lane: it.c, pattern: it.p, depth: it.d, end: it.e, t: 0, budget: it.p === "counter" ? rnd(1.6, 2.6) : rnd(2, 4) };
    takeBall(it.s);
    lastPasser = null;
    if (++quietFeed >= 11 && it.d > 0.6) {
      quietFeed = 0;
      const xi = alive(it.s);
      if (xi.length) say(st.minute, pick([
        `${pick(xi).a.name} conduz o ataque ${LANE_TXT[it.c]}.`,
        `A equipa procura espaços ${LANE_TXT[it.c]}.`,
        `Boa circulação ${LANE_TXT[it.c]}, sem finalização para já.`,
      ]), "info");
    }
  };

  const endChain = () => {
    const p = play;
    play = null;
    const b = st.ball, side = p.side, opp = other(side);
    if (b.mode !== "carry" || !b.carrier || b.carrier.side !== side) return;
    const c = ref(b.carrier);
    switch (p.end) {
      case "tackle": {
        const i = nearest(opp, c.pos[0], c.pos[1]);
        if (i >= 0) { team(opp)[i].run = [c.pos[0], c.pos[1]]; team(opp)[i].fast = true; }
        looseTo(opp, sgn(opp) * rnd(0.08, 0.25), rnd(-0.2, 0.2));
        break;
      }
      case "intercept": { // o último passe é lido por um adversário
        const mates = alive(side).filter((o) => o.i !== b.carrier.idx);
        if (!mates.length) { looseTo(opp, 0, 0); break; }
        const m = pick(mates).a;
        const mx = lerp(b.pos[0], m.pos[0], rnd(0.45, 0.7)), my = lerp(b.pos[1], m.pos[1], rnd(0.45, 0.7));
        const i = nearest(opp, mx, my);
        launch(mx, my, 0.9, i >= 0 ? { side: opp, idx: i } : null, false, "intercept");
        st.poss = opp;
        break;
      }
      case "clear": {
        looseTo(opp, 0, 0);
        b.clearOnCollect = opp;
        break;
      }
      case "out": { // a bola sai pela linha lateral: lançamento para o adversário
        const y = b.pos[1] < 0.5 ? 0.008 : 0.992;
        const x = clamp(b.pos[0] + sgn(side) * rnd(0.03, 0.12), 0.06, 0.94);
        launch(x, y, 0.85, null, false, "out");
        b.outThrow = { side: opp, x, y };
        break;
      }
      case "keeper": {
        const g = gkIdx(opp);
        if (g >= 0) launch(team(opp)[g].pos[0], team(opp)[g].pos[1], 0.95, { side: opp, idx: g }, true, "cross");
        else looseTo(opp, 0, 0);
        st.poss = opp;
        break;
      }
      default: looseTo(opp, 0, 0);
    }
  };

  const shotSpot = (ev, side) => {
    const dir = sgn(side), gx = attackX(side);
    const laneY = ev.lane ? LANE_Y[ev.lane] : 0.5;
    const near = (v) => clamp(lerp(laneY, 0.5, v) + rnd(-0.05, 0.05), 0.2, 0.8);
    switch (ev.shot) {
      case "big": return [gx - dir * rnd(0.05, 0.09), near(0.75)];
      case "angle": return [gx - dir * rnd(0.05, 0.11), clamp(laneY + (laneY < 0.5 ? 0.08 : laneY > 0.5 ? -0.08 : 0), 0.22, 0.78)];
      case "long": return [gx - dir * rnd(0.2, 0.3), near(0.45)];
      case "header": return [gx - dir * rnd(0.05, 0.09), clamp(0.5 + rnd(-0.1, 0.1), 0.38, 0.62)];
      default: return [gx - dir * rnd(0.09, 0.16), near(0.6)];
    }
  };

  const startAttack = (ev) => {
    const side = ev.side;
    const shooterI = (() => { const i = idxOfPid(side, ev.pid); return i >= 0 ? i : nearest(side, attackX(side), 0.5); })();
    const assistI = ev.assistPid ? idxOfPid(side, ev.assistPid) : -1;

    if (ev.type === "corner" || ev.goalType === "corner") return startCorner(ev, shooterI, assistI);
    if (ev.penalty) return startPenalty(ev, shooterI);

    const pattern = ev.pattern && PATTERN[ev.pattern] ? ev.pattern : pick(["build", "wide", "direct"]);
    const spot = shotSpot(ev, side);
    const shooter = team(side)[shooterI];
    // cruzamento em lances de cabeça ou, às vezes, a partir das alas
    const crossing = ev.shot === "header" || (ev.lane && ev.lane !== "C" && ev.shot === "box" && Math.random() < 0.45);
    play = { kind: "attack", ev, side, lane: ev.lane ?? pick(["L", "C", "R"]), pattern, t: 0, shooterI, assistI, spot, crossing, stage: "build", depth: 0, budget: pattern === "counter" ? 1.5 : lerp(1, 3, Math.min(1, (ev.xg ?? 0.1) / 0.2)) };
    takeBall(side);
    if (shooter) { shooter.run = [spot[0] - sgn(side) * 0.05, spot[1]]; shooter.fast = false; }
  };

  const shootFrom = (ev, p) => {
    const b = st.ball, side = p.side, dir = sgn(side), gx = attackX(side);
    const shooter = team(side)[p.shooterI];
    Object.assign(b, { carrier: null, recv: null, collector: null, mode: "shot", flightT: 0, high: false });
    st.shots.push({ side, x: b.pos[0], y: b.pos[1], min: Math.round(st.minute), shot: ev.shot });
    if (shooter) { shooter.fast = false; shooter.run = null; }

    let tx = gx - dir * 0.008, ty = rnd(0.45, 0.55), z = 0.02;
    p.outcome = ev.type;
    if (ev.type === "miss") {
      if (ev.blocked) {
        tx = clamp(b.pos[0] + dir * rnd(0.04, 0.08), 0.03, 0.97); ty = b.pos[1] + rnd(-0.04, 0.04);
        p.blockAt = [tx, ty];
      } else if (Math.random() < 0.4) { ty = rnd(0.47, 0.53); z = 0.14; p.over = true; tx = gx + dir * 0.01; }
      else { const up = Math.random() < 0.5; ty = up ? rnd(0.3, 0.41) : rnd(0.59, 0.7); tx = gx + dir * 0.01; }
    } else if (ev.type === "goal") {
      ty = Math.random() < 0.5 ? rnd(0.44, 0.47) : rnd(0.53, 0.56);
      z = ev.shot === "long" ? 0.05 : 0.025;
    } else { z = 0.03; }
    const d = Math.max(0.001, len(tx - b.pos[0], ty - b.pos[1]));
    const speed = ev.shot === "header" ? SHOT_SPD * 0.7 : SHOT_SPD * rnd(0.85, 1.1);
    b.vel = [((tx - b.pos[0]) / d) * speed, ((ty - b.pos[1]) / d) * speed];
    b.target = [tx, ty]; b.shotZ = z; b.flightDur = d / speed;
    const opp = other(side), g = gkIdx(opp);
    if (g >= 0 && !p.blockAt) {
      const gk = team(opp)[g];
      const beaten = ev.type === "goal";
      gk.run = [ownX(opp), beaten ? clamp(ty + (Math.random() < 0.5 ? -1 : 1) * rnd(0.05, 0.14), 0.36, 0.64) : clamp(ty, 0.38, 0.62)];
      gk.fast = true; gk.dive = true;
    }
    sfx("shot");
    p.stage = "flight"; p.t = 0;
  };

  const clearGk = (side) => { const g = gkIdx(side); if (g >= 0) { const a = team(side)[g]; a.dive = false; a.fast = false; a.run = null; } };

  /* ---------------- ataque que acaba num evento ---------------- */
  const runAttack = (p, dt) => {
    const b = st.ball, ev = p.ev, side = p.side, dir = sgn(side);
    p.t += dt;
    const hasBall = b.mode === "carry" && b.carrier?.side === side;
    const shooter = team(side)[p.shooterI];
    if (p.stage === "build" || p.stage === "final") ensureOwner(p);

    if (p.stage === "build") {
      if (hasBall) {
        holdT -= dt;
        const depth = depthOf(side, b.pos[0]);
        const needDepth = 0.56;
        if (depth >= needDepth || p.t > p.budget) { p.stage = "final"; p.t = 0; holdT = rnd(0.15, 0.4); return; }
        if (holdT <= 0) { decide(); holdT = rnd(0.3, 0.7); }
      } else if (p.t > 3.5 && b.mode === "loose" && !b.collector) looseTo(side, 0, 0);
      return;
    }
    if (p.stage === "final") {
      if (shooter?.off) { p.shooterI = nearest(side, attackX(side), 0.5); return; }
      if (shooter && !shooter.run) { shooter.run = p.spot; shooter.fast = true; }
      if (!hasBall) { if (p.t > 4 && b.mode === "loose" && !b.collector) looseTo(side, 0, 0); return; }
      const ci = b.carrier.idx;
      holdT -= dt;
      if (holdT > 0) return;

      if (ci === p.shooterI) {
        const deep = depthOf(side, b.pos[0]) >= (ev.shot === "long" ? 0.62 : 0.56);
        if (deep && (len(shooter.pos[0] - p.spot[0], shooter.pos[1] - p.spot[1]) < 0.05 || p.t > 1.6 || ev.shot === "long")) { shootFrom(ev, p); return; }
        shooter.run = p.spot; shooter.fast = true; holdT = 0.12;
        return;
      }
      if (p.crossing && !p.crossed) {
        // leva a bola à ala e cruza para a área
        const wideY = (p.lane === "R" ? 0.86 : p.lane === "L" ? 0.14 : (b.pos[1] < 0.5 ? 0.14 : 0.86));
        const c = team(side)[ci];
        c.run = [clamp(attackX(side) - dir * 0.16, 0.05, 0.95), wideY]; c.fast = true;
        if (len(c.pos[0] - c.run[0], c.pos[1] - c.run[1]) < 0.09 || p.t > 1.4) {
          p.crossed = true;
          shooter.run = p.spot; shooter.fast = true;
          launch(p.spot[0], p.spot[1], 0.92, { side, idx: p.shooterI }, true, "cross");
          p.t = 0;
        } else holdT = 0.1;
        return;
      }
      if (p.assistI >= 0 && ci !== p.assistI && !p.toAssist && team(side)[p.assistI] && !team(side)[p.assistI].off) {
        p.toAssist = true; passTo(side, p.assistI, "forward"); holdT = 0.3; return;
      }
      if (ev.shot === "big") throughBall(side, p.shooterI, 0.06);
      else passTo(side, p.shooterI, "forward", 0.25);
      holdT = 0.2;
      return;
    }
    if (p.stage === "flight") {
      if (p.t >= (b.flightDur ?? 0.4) || (p.blockAt && len(b.pos[0] - p.blockAt[0], b.pos[1] - p.blockAt[1]) < 0.02)) resolveShot(p);
      return;
    }
    if (p.stage === "celebrate") {
      const side2 = side;
      for (const o of alive(side2)) o.a.run = [lerp(o.a.base[0], side2 === "H" ? 0.86 : 0.14, 0.55), lerp(o.a.base[1], p.partyY, 0.45)];
      if (p.t > 1.9) { for (const o of alive(side2)) o.a.run = null; startKickoff(other(side2)); play = null; }
    }
  };

  const resolveShot = (p) => {
    const b = st.ball, ev = p.ev, side = p.side, dir = sgn(side), opp = other(side);
    clearGk(opp);
    if (ev.type === "goal") {
      Object.assign(b, { mode: "net", vel: [dir * 0.2, 0], z: 0 });
      st.score = ev.score ? [...ev.score] : (side === "H" ? [st.score[0] + 1, st.score[1]] : [st.score[0], st.score[1] + 1]);
      st.goalCount++; st.flash = 1; sfx("goal");
      setBanner("GOLO!", "goal", 2.2);
      say(ev.min, `${pick(GOAL_TEXT[ev.goalType] ?? GOAL_TEXT.open)} ${ev.name}${ev.assistName ? ` (assist. ${ev.assistName})` : ""}!`, "goal");
      p.stage = "celebrate"; p.t = 0; p.partyY = Math.random() < 0.5 ? 0.14 : 0.86;
      return;
    }
    if (ev.type === "save") {
      sfx("save");
      setBanner("DEFESA!", "save", 1.2);
      say(ev.min, `Remate de ${ev.name}… ${pick(SAVE_TEXT)} ${ev.gkName ?? "o guarda-redes"}!`, "chance");
      const g = gkIdx(opp);
      if (Math.random() < 0.55 && g >= 0) { // agarra
        const gk = team(opp)[g];
        launch(gk.pos[0], gk.pos[1], 1.2, { side: opp, idx: g }, false, "save");
      } else { // defesa para a frente: bola solta
        looseTo(opp, -dir * rnd(0.3, 0.55), rnd(-0.35, 0.35));
      }
      play = null;
      return;
    }
    // falhado: bloqueado ou fora
    if (ev.blocked) {
      setBanner("BLOQUEADO!", "miss", 1);
      say(ev.min, `${ev.name}: ${pick(BLOCK_TEXT)}`, "chance");
      looseTo(opp, -dir * rnd(0.2, 0.5), rnd(-0.4, 0.4));
      play = null;
      return;
    }
    if (ev.shot !== "penalty" && !p.over && Math.random() < 0.12) {
      setBanner("AO POSTE!", "miss", 1.2);
      say(ev.min, `${ev.name} acerta no poste!`, "chance");
      looseTo(opp, -dir * rnd(0.35, 0.6), rnd(-0.3, 0.3));
      play = null;
      return;
    }
    setBanner(p.over ? "POR CIMA!" : "PARA FORA!", "miss", 1.2);
    say(ev.min, `${ev.name} ${p.over ? "remata por cima." : pick(MISS_TEXT)}`, "chance");
    play = null;
    goalKick(opp);
  };

  /* ---------------- bolas paradas ---------------- */
  const setRestart = (r) => { restart = { t: 0, ...r }; };

  const goalKick = (side) => {
    const x = side === "H" ? 0.07 : 0.93;
    placeBall(x, 0.5 + rnd(-0.1, 0.1), () => setCarrier(side, gkIdx(side)));
    setRestart({ wait: rnd(0.45, 0.8), done: () => { const b = st.ball; if (b.mode === "carry") holdT = 0.1; } });
  };

  const startKickoff = (side) => {
    st.kickSide = side;
    placeBall(0.5, 0.5, () => setCarrier(side, nearest(side, 0.5, 0.5)));
    setRestart({ wait: 1, kickoff: true, done: () => {} });
  };

  const startCorner = (ev, shooterI, assistI) => {
    const side = ev.side, opp = other(side), dir = sgn(side), gx = attackX(side);
    const flagY = ev.lane === "R" ? 0.975 : ev.lane === "L" ? 0.025 : (Math.random() < 0.5 ? 0.025 : 0.975);
    const flagX = gx === 1 ? 0.985 : 0.015;
    const takerI = assistI >= 0 ? assistI : nearest(side, flagX, flagY, shooterI);
    const taker = team(side)[takerI];
    const short = Math.random() < 0.22 && ev.type !== "goal";
    // ocupação da área: atacantes em zonas e defesas a marcar
    alive(side).forEach(({ a, i }, n) => {
      if (i === takerI) return;
      a.run = [gx - dir * rnd(0.05, 0.17), 0.5 + (n - 5) * 0.045 + rnd(-0.02, 0.02)]; a.fast = false;
    });
    alive(opp).forEach(({ a }, n) => { a.run = [gx - dir * rnd(0.03, 0.13), 0.5 + (n - 5) * 0.05 + rnd(-0.02, 0.02)]; a.fast = false; });
    if (taker) { taker.run = [flagX, flagY]; taker.fast = true; }
    placeBall(flagX, flagY);
    say(ev.min, `Canto para ${side === "H" ? "a equipa da casa" : "os visitantes"}.`, "info");
    play = { kind: "corner", ev, side, t: 0, takerI, shooterI, short, flag: [flagX, flagY], stage: "setup", lane: ev.lane };
  };

  const runCorner = (p, dt) => {
    const b = st.ball, ev = p.ev, side = p.side, opp = other(side), dir = sgn(side), gx = attackX(side);
    p.t += dt;
    const taker = team(side)[p.takerI];
    if (p.stage === "setup") {
      if (b.mode === "place") return;
      const at = !taker || len(taker.pos[0] - b.pos[0], taker.pos[1] - b.pos[1]) < 0.035;
      if ((at && p.t > 0.8) || p.t > 2.4) {
        if (taker) { taker.run = null; taker.fast = false; }
        if (p.short) {
          const near = nearest(side, b.pos[0], b.pos[1], p.takerI);
          if (near >= 0) { b.carrier = { side, idx: p.takerI }; passTo(side, near, "lateral"); }
          for (const t of [...alive(side), ...alive(opp)]) t.a.run = null;
          play = null;
          return;
        }
        const tx = gx - dir * rnd(0.06, 0.12), ty = clamp(0.5 + rnd(-0.13, 0.13), 0.34, 0.66);
        const hd = team(side)[p.shooterI];
        launch(tx, ty, 0.92, null, true, "cross");
        p.boxTarget = [tx, ty];
        if (hd) { hd.run = [tx, ty]; hd.fast = true; }
        p.stage = "cross"; p.t = 0;
      }
      return;
    }
    if (p.stage === "cross") {
      if (b.mode === "pass" && p.t < (b.flightDur ?? 1)) return;
      for (const t of [...alive(side), ...alive(opp)]) t.a.run = null;
      b.high = false; b.z = 0;
      if (ev.type === "goal") {
        p.spot = p.boxTarget;
        Object.assign(p, { kind: "attack", stage: "x" });
        shootFrom(ev, p);
      } else {
        say(ev.min, pick(["A defesa afasta o perigo.", "Corte de cabeça, a bola sai da área.", "O guarda-redes sai e resolve."]), "info");
        clearLongFromBox(opp);
        play = null;
      }
    }
  };
  const clearLongFromBox = (side) => {
    st.ball.mode = "carry"; st.ball.carrier = { side, idx: Math.max(0, nearest(side, st.ball.pos[0], st.ball.pos[1])) };
    clearLong(side);
  };

  const startPenalty = (ev, shooterI) => {
    const side = ev.side, opp = other(side), dir = sgn(side), gx = attackX(side);
    const spotX = gx - dir * 0.105;
    alive(side).concat(alive(opp)).forEach(({ a }) => { a.run = [gx - dir * rnd(0.2, 0.28), rnd(0.15, 0.85)]; a.fast = false; });
    const taker = team(side)[shooterI];
    if (taker) { taker.run = [spotX - dir * 0.03, 0.5]; taker.fast = true; }
    placeBall(spotX, 0.5);
    setBanner("PENÁLTI!", "miss", 1.4);
    say(ev.min, `Penálti para ${side === "H" ? "a equipa da casa" : "os visitantes"}! ${ev.name} vai bater.`, "chance");
    play = { kind: "penalty", ev, side, t: 0, shooterI };
  };
  const runPenalty = (p, dt) => {
    p.t += dt;
    const b = st.ball;
    if (b.mode === "place") return;
    const taker = team(p.side)[p.shooterI];
    const ready = taker && len(taker.pos[0] - b.pos[0], taker.pos[1] - b.pos[1]) < 0.045;
    if ((p.t > 1.6 && ready) || p.t > 4.5) {
      for (const t of [...alive(p.side), ...alive(other(p.side))]) t.a.run = null;
      Object.assign(p, { kind: "attack", stage: "x", spot: [...b.pos] });
      shootFrom(p.ev, p);
    }
  };

  /* falta, cartão e lesão: o jogo para onde a bola está */
  const startStoppage = (ev) => {
    const b = st.ball;
    play = { kind: "stop", ev, t: 0, spot: [...b.pos] };
    if (b.mode === "carry" || b.mode === "pass") Object.assign(b, { mode: "loose", carrier: null, recv: null, collector: null, vel: [b.vel[0] * 0.15, b.vel[1] * 0.15], high: false, z: 0 });
    sfx("whistle");
    const oi = idxOfPid(ev.side, ev.pid);
    const offender = oi >= 0 ? team(ev.side)[oi] : null;
    if (ev.type === "injury") {
      if (offender) offender.down = true;
      setBanner("LESÃO", "injury", 1.6);
      say(ev.min, `${ev.name} fica no chão… ${ev.subName ? `sai lesionado, entra ${ev.subName}.` : "sai lesionado."}`, "injury");
    } else {
      if (offender) { offender.run = [lerp(offender.pos[0], b.pos[0], 0.7), lerp(offender.pos[1], b.pos[1], 0.7)]; }
      const isRed = ev.type === "red" || ev.type === "red2";
      if (ev.type !== "foul") setBanner(isRed ? "VERMELHO" : "AMARELO", isRed ? "red" : "yellow", 1.6);
      say(ev.min, isRed ? `CARTÃO VERMELHO! ${ev.name} vai mais cedo para o balneário.` : ev.type === "yellow" ? `Amarelo para ${ev.name}.` : `Falta de ${ev.name}.`, isRed ? "red" : ev.type === "yellow" ? "yellow" : "info");
    }
    play.offender = oi;
  };
  const runStoppage = (p, dt) => {
    p.t += dt;
    const ev = p.ev;
    if (p.t < (ev.type === "foul" ? 0.8 : 1.4)) return;
    const a = p.offender >= 0 ? team(ev.side)[p.offender] : null;
    if (ev.type === "red" || ev.type === "red2") { if (a) a.off = true; }
    if (ev.type === "injury" && a) { a.down = false; if (!ev.subName) a.off = true; }
    const restartSide = ev.type === "injury" ? ev.side : other(ev.side);
    play = null;
    if (a && a.run) a.run = null;
    looseTo(restartSide, 0, 0);
  };

  /* ---------------- direção do jogo ---------------- */
  const leadOf = (ev) => (ATK_TYPES.includes(ev.type) && !ev.penalty && ev.goalType !== "corner" && ev.type !== "corner" ? 1.1 : 0);

  const choosePlay = () => {
    if (restart) return;
    const ev = events[evIdx];
    if (ev && st.minute >= ev.min - leadOf(ev)) {
      evIdx++;
      if (ATK_TYPES.includes(ev.type)) startAttack(ev); else startStoppage(ev);
      return;
    }
    if (st.ball.mode === "place" || st.ball.mode === "net") return;
    while (flowIdx < flow.length && flow[flowIdx].m < st.minute - 0.5) flowIdx++;
    const it = flow[flowIdx];
    if (it && (!ev || it.m < ev.min - 1)) { flowIdx++; beginFlow(it); return; }
    // sem posse registada até ao próximo evento: mantém a bola em circulação
    const holder = st.ball.carrier?.side ?? st.poss;
    beginFlow({ s: holder, c: pick(["L", "C", "R"]), p: "build", d: rnd(0.25, 0.45), e: pick(["tackle", "intercept"]) });
  };

  const runChain = (p, dt) => {
    p.t += dt;
    const b = st.ball;
    ensureOwner(p);
    const owns = b.mode === "carry" && b.carrier?.side === p.side;
    if (owns) {
      const depth = depthOf(p.side, b.pos[0]);
      holdT -= dt;
      if ((depth >= p.depth && p.t > 0.8) || p.t >= p.budget) { endChain(); return; }
      if (holdT <= 0) { decide(); holdT = rnd(0.32, 0.85); }
    } else if (p.t > p.budget + 2.5) {
      play = null;
    } else if (b.mode === "loose" && !b.collector) {
      looseTo(p.side, 0, 0);
    }
  };

  /* ---------------- física da bola ---------------- */
  const ballUpdate = (dt) => {
    const b = st.ball;
    if (b.mode === "carry" && b.carrier) {
      const c = ref(b.carrier);
      if (!c || c.off) { looseTo(st.poss, 0, 0); return; }
      let hx = c.vel[0], hy = c.vel[1]; const hl = len(hx, hy);
      if (hl < 0.02) { hx = sgn(b.carrier.side); hy = 0; } else { hx /= hl; hy /= hl; }
      // toques: a bola afasta-se e volta ao pé, em vez de ficar colada
      c.touch = (c.touch ?? Math.random() * 6) + dt * 11;
      const reach = 0.013 + (Math.sin(c.touch) + 1) * 0.006 * Math.min(1, hl / 0.12);
      const tx = c.pos[0] + hx * reach, ty = c.pos[1] + hy * reach;
      // limite de velocidade: mesmo que o portador esteja longe, a bola viaja, não salta
      const gap = len(tx - b.pos[0], ty - b.pos[1]), maxStep = 1.4 * dt;
      const k = gap > maxStep ? maxStep / gap : clamp(dt * 24, 0, 1);
      b.pos[0] = clamp(lerp(b.pos[0], tx, k), 0.008, 0.992);
      b.pos[1] = clamp(lerp(b.pos[1], ty, k), 0.008, 0.992);
      b.z = 0;
    } else if (b.mode === "pass" || b.mode === "shot") {
      const prevDist = b.target ? len(b.target[0] - b.pos[0], b.target[1] - b.pos[1]) : 1;
      b.pos[0] = clamp(b.pos[0] + b.vel[0] * dt, 0.003, 0.997);
      b.pos[1] = clamp(b.pos[1] + b.vel[1] * dt, 0.003, 0.997);
      b.flightT += dt;
      const dur = Math.max(0.05, b.flightDur ?? 0.5);
      if (b.mode === "shot") { const u = clamp(b.flightT / dur, 0, 1); b.z = (b.shotZ ?? 0.03) * 4 * u * (1 - u) * 1.6; }
      else if (b.high) { const u = clamp(b.flightT / dur, 0, 1); b.z = 0.09 * 4 * u * (1 - u); }
      if (b.mode === "pass") {
        if (b.recv) {
          const r = ref(b.recv);
          const reachR = b.high ? 0.04 : 0.03;
          if (r && !r.off && len(b.pos[0] - r.pos[0], b.pos[1] - r.pos[1]) < reachR && (!b.high || b.flightT > dur * 0.75)) {
            b.z = 0; setCarrier(b.recv.side, b.recv.idx); return;
          }
        }
        const curDist = b.target ? len(b.target[0] - b.pos[0], b.target[1] - b.pos[1]) : 0;
        if (b.flightT >= dur || curDist > prevDist + 1e-6 || curDist < 0.004) arrive(b);
      }
    } else if (b.mode === "loose" || b.mode === "net") {
      const f = Math.pow(0.08, dt);
      b.vel[0] *= f; b.vel[1] *= f;
      b.pos[0] = clamp(b.pos[0] + b.vel[0] * dt, 0.005, 0.995);
      b.pos[1] = clamp(b.pos[1] + b.vel[1] * dt, 0.008, 0.992);
      b.z = 0;
      if (b.mode === "loose" && b.collector) {
        const c = ref(b.collector);
        if (!c || c.off) { b.collector = null; return; }
        if (len(b.pos[0] - c.pos[0], b.pos[1] - c.pos[1]) < 0.028) {
          const clearing = b.clearOnCollect;
          b.clearOnCollect = null;
          setCarrier(b.collector.side, b.collector.idx);
          if (clearing) clearLong(clearing);
        }
      }
    } else if (b.mode === "place") {
      const dx = b.target[0] - b.pos[0], dy = b.target[1] - b.pos[1], d = len(dx, dy);
      const step = 1.5 * dt;
      if (d <= step) {
        b.pos = [...b.target]; b.mode = "still"; b.vel = [0, 0];
        const fn = b.onPlaced; b.onPlaced = null;
        if (fn) fn();
      } else { b.pos[0] += (dx / d) * step; b.pos[1] += (dy / d) * step; }
    }
  };

  const arrive = (b) => {
    b.z = 0; b.high = false;
    const after = b.afterFlight, thrown = b.outThrow, recv = b.recv;
    b.afterFlight = null; b.outThrow = null;
    if (thrown) {
      Object.assign(b, { mode: "still", vel: [0, 0], recv: null });
      const i = nearest(thrown.side, thrown.x, thrown.y);
      const t = i >= 0 ? team(thrown.side)[i] : null;
      if (t) { t.run = [thrown.x, thrown.y]; t.fast = true; }
      st.poss = thrown.side;
      setRestart({ wait: 0.9, done: () => { if (i >= 0) { setCarrier(thrown.side, i); if (t) t.run = null; holdT = 0.15; } else looseTo(thrown.side, 0, 0); } });
      return;
    }
    if (recv) { // chegou ao sítio mas o recetor não: quem estiver mais perto vai lá
      looseTo(recv.side, b.vel[0] * 0.25, b.vel[1] * 0.25);
      return;
    }
    looseTo(after ?? st.poss, b.vel[0] * 0.25, b.vel[1] * 0.25);
  };

  /* ---------------- movimento sem bola ---------------- */
  const newPlan = (a, side, dir) => {
    const r = Math.random();
    a.planT = rnd(1.1, 3.2);
    if (a.line === "AV") {
      if (r < 0.42) a.plan = { x: dir * rnd(0.06, 0.14), y: rnd(-0.08, 0.08), fast: true };       // desmarcação em profundidade
      else if (r < 0.7) a.plan = { x: -dir * rnd(0.06, 0.13), y: rnd(-0.05, 0.05), fast: false };  // baixa para receber
      else a.plan = { x: dir * rnd(0, 0.05), y: (a.base[1] < 0.5 ? 1 : -1) * rnd(0.08, 0.18), fast: true }; // diagonal
    } else if (a.line === "MD") {
      if (r < 0.32) a.plan = { x: dir * rnd(0.05, 0.13), y: rnd(-0.06, 0.06), fast: true };        // chega à área
      else if (r < 0.65) a.plan = { x: rnd(-0.03, 0.03), y: rnd(-0.14, 0.14), fast: false };       // oferece linha de passe
      else a.plan = { x: -dir * rnd(0.03, 0.08), y: rnd(-0.05, 0.05), fast: false };
    } else if (a.line === "DF" && a.lane !== "C") {
      a.plan = r < 0.4 ? { x: dir * rnd(0.12, 0.26), y: (a.lane === "L" ? -1 : 1) * rnd(0, 0.03), fast: true } : { x: dir * rnd(0, 0.05), y: 0, fast: false }; // sobreposição
    } else a.plan = { x: dir * rnd(0, 0.04), y: rnd(-0.04, 0.04), fast: false };
  };

  const steerAll = (dt, clock) => {
    const b = st.ball;
    const carrier = b.carrier;
    const defSide = other(st.poss);
    const pressI = nearest(defSide, b.pos[0], b.pos[1]);
    const coverI = nearest(defSide, b.pos[0] + sgn(defSide) * -0.09, b.pos[1], pressI);
    const deadBall = !!restart || b.mode === "still" || b.mode === "place";

    for (const side of ["H", "A"]) {
      const atk = side === st.poss;
      const mates = team(side);
      const dir = sgn(side);
      const shape = shapes[side];
      mates.forEach((a, i) => {
        if (a.off) return;
        if (a.down) { a.vel = [0, 0]; return; }
        let tx, ty, speed = (a.gk ? GK_SPEED : SPEED) * a.pace;
        let urgent = false;
        a.planT -= dt;

        const isCarrier = carrier && carrier.side === side && carrier.idx === i;
        const isRecv = b.recv && b.recv.side === side && b.recv.idx === i;
        const isCollector = b.collector && b.collector.side === side && b.collector.idx === i;

        if (a.run && !isCollector) {
          tx = a.run[0]; ty = a.run[1];
          urgent = a.fast;
          if (len(tx - a.pos[0], ty - a.pos[1]) < 0.018) { a.run = null; a.fast = false; a.dive = false; }
        } else if (a.gk) {
          tx = ownX(side) + dir * clamp((depthOf(other(side), b.pos[0]) < 0.5 ? 0.02 : 0.045), 0, 0.05);
          ty = clamp(0.5 + (b.pos[1] - 0.5) * 0.45, 0.4, 0.6);
          if (isCollector) { tx = b.pos[0]; ty = b.pos[1]; urgent = true; }
        } else if (isCarrier) {
          const lane = play?.lane ? LANE_Y[play.lane] : 0.5;
          const pressedAway = distToOpp(side, a.pos[0], a.pos[1]) < 0.05;
          tx = a.pos[0] + dir * (pressedAway ? 0.04 : 0.16);
          ty = a.dribbleY ?? lerp(a.pos[1], lane, 0.1);
          if (a.dribbleY != null && Math.abs(a.pos[1] - a.dribbleY) < 0.02) a.dribbleY = null;
          speed *= play?.pattern === "counter" ? 1.15 : 0.85;
        } else if (isRecv) {
          if (b.target) { tx = b.target[0]; ty = b.target[1]; urgent = true; }
          else { tx = b.pos[0]; ty = b.pos[1]; }
        } else if (isCollector) {
          tx = b.pos[0] + b.vel[0] * 0.2; ty = b.pos[1] + b.vel[1] * 0.2; urgent = true;
        } else if (deadBall) {
          // bola parada: reorganiza-se devagar
          tx = a.base[0] + (b.pos[0] - 0.5) * 0.22;
          ty = a.base[1] + (b.pos[1] - a.base[1]) * 0.18;
          speed *= 0.55;
        } else if (!atk && i === pressI && (b.mode === "carry" || b.mode === "pass") && depthOf(st.poss, b.pos[0]) > 0.45 - 0.15 * shape.press) {
          // pressão ao portador (mais ou menos alta consoante a tática)
          tx = b.pos[0]; ty = b.pos[1]; speed *= 0.82 + 0.25 * shape.press; urgent = shape.press > 1.2;
        } else if (!atk && i === coverI && b.mode === "carry") {
          // segundo homem: fecha a linha de passe por trás do pressionante
          tx = b.pos[0] - dir * -0.1 * -1; ty = lerp(b.pos[1], 0.5, 0.35);
          tx = b.pos[0] + dir * -0.12 * -1 - dir * 0.24;
        } else if (atk) {
          if (a.planT <= 0) newPlan(a, side, dir);
          const drift = 0.42;
          const forward = dir * (0.05 + shape.line + (play?.pattern === "counter" ? 0.05 : 0));
          tx = a.base[0] + (b.pos[0] - 0.5) * drift + forward + (a.plan?.x ?? 0);
          ty = a.base[1] + (b.pos[1] - a.base[1]) * 0.24 + (a.plan?.y ?? 0);
          // jogadores perto do portador abrem linha em vez de se amontoarem
          const cd = len(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
          if (cd < 0.1 && cd > 0.0001) { tx += ((a.pos[0] - b.pos[0]) / cd) * 0.06; ty += ((a.pos[1] - b.pos[1]) / cd) * 0.08; }
          if (a.plan?.fast && len(tx - a.pos[0], ty - a.pos[1]) > 0.05) urgent = true;
        } else {
          // bloco defensivo: linha compacta que desliza para o lado da bola, entre a bola e a baliza
          const drift = 0.32;
          tx = a.base[0] + (b.pos[0] - 0.5) * drift + dir * (shape.line - 0.03);
          ty = a.base[1] + (b.pos[1] - a.base[1]) * (a.line === "DF" ? 0.3 : 0.42);
          if (a.line === "DF") {
            // a linha defensiva recua para não ser ultrapassada
            const lineLimit = b.pos[0] - dir * 0.05;
            tx = dir > 0 ? Math.min(tx, Math.max(lineLimit, 0.1)) : Math.max(tx, Math.min(lineLimit, 0.9));
          }
          // marcação solta do atacante mais próximo
          let mark = null, md = 0.16;
          for (const o of team(other(side))) { if (o.off || o.gk) continue; const d = len(o.pos[0] - a.pos[0], o.pos[1] - a.pos[1]); if (d < md) { md = d; mark = o; } }
          if (mark) { tx = lerp(tx, mark.pos[0] - dir * -0.03 * -1, 0.3); ty = lerp(ty, mark.pos[1], 0.3); }
        }

        // pequeno movimento próprio: ninguém fica parado como uma peça
        const wx = Math.sin(clock * 0.9 * a.wander + a.phase) * 0.011;
        const wy = Math.cos(clock * 1.2 * a.wander + a.phase * 1.7) * 0.015;
        if (!a.gk && !isCarrier && !a.run) { tx += wx; ty += wy; }

        if (urgent) speed *= SPRINT;
        // sem pressa quando o lance está longe: anda em vez de correr
        const far = len(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
        if (!urgent && !isCarrier && !a.gk) speed *= far > 0.4 ? 0.72 : far > 0.25 ? 0.87 : 1;

        let sepx = 0, sepy = 0;
        for (const s2 of ["H", "A"]) for (const m of team(s2)) {
          if (m === a || m.off) continue;
          const ox = a.pos[0] - m.pos[0], oy = a.pos[1] - m.pos[1], od = len(ox, oy);
          const R = s2 === side ? 0.06 : 0.03;
          if (od > 0.0001 && od < R) { sepx += (ox / od) * (R - od); sepy += (oy / od) * (R - od); }
        }

        const dx = clamp(tx, 0.015, 0.985) - a.pos[0], dy = clamp(ty, 0.02, 0.98) - a.pos[1];
        const d = len(dx, dy);
        let desx = 0, desy = 0;
        if (d > 0.001) { const arr = d < 0.07 ? d / 0.07 : 1; desx = (dx / d) * speed * arr; desy = (dy / d) * speed * arr; }
        desx += sepx * 3; desy += sepy * 3;
        const k = clamp(dt * (urgent ? 7 : 4.5), 0, 1); // inércia: acelera e trava gradualmente
        a.vel[0] += (desx - a.vel[0]) * k;
        a.vel[1] += (desy - a.vel[1]) * k;
        a.pos[0] = clamp(a.pos[0] + a.vel[0] * dt, 0.006, 0.994);
        a.pos[1] = clamp(a.pos[1] + a.vel[1] * dt, 0.01, 0.99);
      });
    }
  };

  /* ---------------- passo mestre ---------------- */
  let clock = 0;
  const tick = (dt) => {
    if (st.done) return;
    clock += dt;
    if (!st.started) { st.started = true; sfx("whistle"); startKickoff("H"); }
    if (st.banner) { st.banner.ttl -= dt; if (st.banner.ttl <= 0) st.banner = null; }
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 1.4);

    // relógio: abranda em bola parada e nunca ultrapassa um lance por acontecer
    const slow = restart || play?.kind === "corner" || play?.kind === "penalty" || play?.kind === "stop" || play?.stage === "celebrate";
    const limit = play?.ev ? play.ev.min : events[evIdx] ? events[evIdx].min : 90;
    st.minute = Math.min(limit, 90, st.minute + dt * PACE * (slow ? 0.2 : 1));

    if (restart) {
      restart.t += dt;
      const placed = st.ball.mode !== "place";
      if (placed && restart.t >= restart.wait) { const fn = restart.done; restart = null; fn?.(); }
    } else if (play) {
      if (play.kind === "attack") runAttack(play, dt);
      else if (play.kind === "chain") runChain(play, dt);
      else if (play.kind === "corner") runCorner(play, dt);
      else if (play.kind === "penalty") runPenalty(play, dt);
      else if (play.kind === "stop") runStoppage(play, dt);
    } else if (st.minute < 90 || evIdx < events.length) {
      choosePlay();
    }

    // segurança: nenhuma jogada de evento pode ficar presa
    if (play?.ev && play.kind === "attack" && play.stage !== "celebrate" && play.stage !== "flight") {
      play.total = (play.total ?? 0) + dt;
      const p = play, bl = st.ball;
      if (p.total > 26 || (p.total > 16 && depthOf(p.side, bl.pos[0]) >= 0.52)) shootFrom(p.ev, p);
      else if (p.total > 7 && !p.rescued && bl.mode === "carry" && bl.carrier?.side === p.side && bl.carrier.idx !== p.shooterI) {
        // jogada encravada: bola longa para o finalizador, sem saltos
        p.rescued = true; p.crossed = true; p.stage = "final"; p.t = 0;
        const sh = team(p.side)[p.shooterI];
        if (sh) { sh.run = p.spot; sh.fast = true; launch(p.spot[0], p.spot[1], 0.95, { side: p.side, idx: p.shooterI }, true, "cross"); }
      }
    }

    // bola sem dono nem bola parada em curso: alguém vai buscá-la
    const bl2 = st.ball;
    if (!restart && bl2.mode === "loose" && !bl2.collector) looseTo(st.poss, bl2.vel[0], bl2.vel[1]);
    if (!restart && bl2.mode === "still" && play?.kind !== "corner" && play?.kind !== "penalty") looseTo(st.poss, 0, 0);

    ballUpdate(dt);
    steerAll(dt, clock);

    if (!play && !restart && st.minute >= 90 && evIdx >= events.length) {
      st.done = true;
      st.score = [...result.score];
      sfx("whistle");
      setBanner("FINAL", "whistle", 3);
      say(90, `Apita o árbitro — final! ${result.score[0]}-${result.score[1]}${result.penalties ? ` (gp ${result.penalties[0]}-${result.penalties[1]})` : ""}.`, "info");
      if (result.xg) say(90, `Qualidade das ocasiões (xG): ${result.xg[0].toFixed(1)} - ${result.xg[1].toFixed(1)}.`, "info");
      for (const t of result.insights ?? []) say(90, t, "info");
    }
  };

  // sub-passos para estabilidade a velocidades altas
  const step = (dtScaled) => {
    newFeed = [];
    const dt = Math.min(0.5, dtScaled * TIME_SCALE);
    const n = Math.max(1, Math.ceil(dt / 0.034));
    const h = dt / n;
    for (let i = 0; i < n && !st.done; i++) tick(h);
    return newFeed;
  };

  const skip = () => {
    newFeed = [];
    let guard = 0;
    while (!st.done && guard++ < 30000) tick(0.04);
    st.done = true; st.score = [...result.score];
    st.sfx.length = 0; // não despejar um monte de sons de uma vez ao saltar
    return newFeed;
  };

  return { state: st, step, skip, SPEED, PACE };
}

/* Resultados antigos não têm `flow`: gera posses plausíveis a partir da posse de bola. */
function syntheticFlow(result) {
  const out = [];
  const pH = (result.possession?.[0] ?? 50) / 100;
  for (let m = 2; m <= 88; m += 2) {
    out.push({ m, s: Math.random() < pH ? "H" : "A", c: pick(["L", "C", "R"]), p: pick(["build", "build", "wide", "direct"]), d: rnd(0.3, 0.8), e: pick(["tackle", "intercept", "clear", "out", "keeper"]) });
  }
  return out;
}
