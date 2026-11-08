/* Motor de COREOGRAFIA cinemática de um jogo já decidido.
   NÃO decide nada — recebe `result` (saída de simulateMatch) e produz movimento
   CONTÍNUO e emergente: 22 agentes com steering (seek/arrive/separação), uma
   bola que é passada de pé em pé entre jogadores reais e sobe o campo, e os
   eventos já existentes (golos, defesas, cartões, lesões) disparados ao minuto
   certo. O placar em jogo segue os golos do `result`; o final = result.score.

   É pura (sem canvas/React): dá-se-lhe `dt` e ela avança o estado. O
   renderizador (MatchViewer2D) só lê `sim.state` e desenha. */

import { lineOf } from "../../engine/constants.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const len = (x, y) => Math.hypot(x, y);

/* Posições-base por linhas (independente da formação exata). x: casa à esquerda. */
const baseSpots = (xi, home) => {
  const lines = { GR: [], DF: [], MD: [], AV: [] };
  xi.forEach((p, i) => lines[lineOf(p.pos)].push(i));
  const X = { GR: 0.06, DF: 0.24, MD: 0.44, AV: 0.64 };
  const out = Array.from({ length: xi.length });
  for (const [pos, idxs] of Object.entries(lines)) {
    idxs.forEach((idx, j) => {
      const y = idxs.length === 1 ? 0.5 : 0.13 + (0.74 * j) / (idxs.length - 1);
      const x = home ? X[pos] : 1 - X[pos];
      out[idx] = [x, y];
    });
  }
  return out;
};

const SPEED = 0.2;      // vel. máx. dos jogadores (campo/seg, a 1x)
const GK_SPEED = 0.12;
const PASS_SPD = 1.05;  // bola em passe
const SHOT_SPD = 1.9;   // bola em remate
const PACE = 1.5;       // minutos de jogo por segundo real (a 1x)

const GOAL_TEXT = {
  open: ["Jogada trabalhada e GOLO de", "Combinação e GOLO de", "No fundo da rede! Marca"],
  counter: ["Contra-ataque letal, GOLO de", "Transição rápida, marca"],
  longshot: ["MÍSSIL de fora da área,", "Remate colocado de longe de"],
  header: ["Cabeceamento imparável de", "Sobe mais alto e marca"],
  corner: ["Do canto, GOLO de", "Ao segundo poste, marca"],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createPitchSim(result) {
  const spotsH = baseSpots(result.homeXI, true);
  const spotsA = baseSpots(result.awayXI, false);
  const mk = (xi, spots) => xi.map((p, i) => ({
    id: p.id, num: i + 1, gk: lineOf(p.pos) === "GR", line: lineOf(p.pos),
    base: [...spots[i]], pos: [...spots[i]], vel: [0, 0],
    off: false, down: false, run: null, fast: false, dive: false,
  }));

  const st = {
    H: mk(result.homeXI, spotsH),
    A: mk(result.awayXI, spotsA),
    ball: { pos: [0.5, 0.5], vel: [0, 0], z: 0, carrier: { side: "H", idx: 6 }, mode: "carry", recv: null, collector: null, flightT: 0 },
    poss: "H", minute: 0, score: [0, 0], done: false,
    banner: null, flash: 0, goalCount: 0, kickSide: "H",
    sfx: [], started: false, shots: [],
  };

  const events = [...result.events].sort((a, b) => a.min - b.min);
  let evIdx = 0;
  let action = null;          // ação com script (golo, defesa, cartão…) a decorrer
  let holdT = 0.7;            // temporizador de posse do portador
  let passCount = 0;
  let passBudget = 3 + Math.floor(Math.random() * 3);
  let newFeed = [];

  const other = (s) => (s === "H" ? "A" : "H");
  const team = (s) => (s === "H" ? st.H : st.A);
  const ref = (r) => team(r.side)[r.idx];
  const attackX = (s) => (s === "H" ? 1 : 0);   // baliza que ataca
  const ownX = (s) => (s === "H" ? 0.03 : 0.97); // linha da própria baliza
  const sgn = (s) => (s === "H" ? 1 : -1);
  const alive = (s) => team(s).map((a, i) => ({ a, i })).filter((o) => !o.a.off && !o.a.gk);
  const inZone = (s) => Math.abs(st.ball.pos[0] - attackX(s)) < 0.3; // bola na zona de finalização

  const say = (min, text, type) => newFeed.push({ min: Math.round(min), text, type });
  const setBanner = (text, kind, ttl = 1.6) => { st.banner = { text, kind, ttl }; };
  const sfx = (kind) => st.sfx.push(kind);

  const setCarrier = (side, idx) => {
    st.poss = side;
    st.ball.carrier = { side, idx };
    st.ball.mode = "carry";
    st.ball.recv = null; st.ball.collector = null;
    holdT = 0.55 + Math.random() * 0.6;
  };

  const nearest = (side, x, y, skipIdx = -1) => {
    let best = -1, bd = 9;
    team(side).forEach((a, i) => {
      if (a.off || a.gk || i === skipIdx) return;
      const d = len(a.pos[0] - x, a.pos[1] - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  // guarda-redes a mergulhar: vai à linha, para o y do remate (beaten=batido, salta ao lado)
  const gkOf = (side) => team(side).find((x) => x.gk);
  const setupGkDive = (defSide, ty, beaten) => {
    const gk = gkOf(defSide);
    if (!gk) return;
    const dy = beaten ? clamp(ty + (Math.random() < 0.5 ? -1 : 1) * 0.14, 0.32, 0.68) : clamp(ty, 0.36, 0.64);
    gk.run = [ownX(defSide), dy]; gk.fast = true; gk.dive = true;
  };
  const clearGkDive = (defSide) => { const gk = gkOf(defSide); if (gk) { gk.dive = false; gk.fast = false; gk.run = null; } };
  const clearBall = (defSide, dir) => {
    const b = st.ball;
    b.mode = "loose"; b.high = false; b.z = 0;
    b.vel = [-dir * 0.35, (Math.random() - 0.5) * 0.3];
    b.collector = { side: defSide, idx: nearest(defSide, b.pos[0], b.pos[1]) };
    st.poss = defSide;
  };

  /* ---------------- passe / perda de bola (jogo livre) ---------------- */
  const makePass = () => {
    const b = st.ball;
    if (!b.carrier) return;
    const side = b.carrier.side, ci = b.carrier.idx;
    const c = team(side)[ci];
    const dir = sgn(side);
    const cands = alive(side).filter((o) => o.i !== ci);
    if (!cands.length) { holdT = 0.6; return; }
    let bestI = cands[0].i, bestW = -1e9;
    for (const { a, i } of cands) {
      const fwd = (a.pos[0] - c.pos[0]) * dir;         // à frente é melhor
      const dist = len(a.pos[0] - c.pos[0], a.pos[1] - c.pos[1]);
      let openMin = 9;
      for (const o of team(other(side))) { if (o.off) continue; openMin = Math.min(openMin, len(o.pos[0] - a.pos[0], o.pos[1] - a.pos[1])); }
      const distPenalty = dist < 0.08 ? -1 : dist > 0.4 ? -(dist - 0.4) * 4 : 0;
      const w = fwd * 2.2 + openMin * 3 + distPenalty + Math.random() * 0.6;
      if (w > bestW) { bestW = w; bestI = i; }
    }
    const r = team(side)[bestI];
    // lidera o passe (aponta ligeiramente à frente do recetor)
    const tx = clamp(r.pos[0] + r.vel[0] * 0.25, 0.02, 0.98);
    const ty = clamp(r.pos[1] + r.vel[1] * 0.25, 0.02, 0.98);
    const d = Math.max(0.001, len(tx - b.pos[0], ty - b.pos[1]));
    b.mode = "pass"; b.recv = { side, idx: bestI }; b.flightT = 0;
    b.vel = [(tx - b.pos[0]) / d * PASS_SPD, (ty - b.pos[1]) / d * PASS_SPD];
    r.run = [tx, ty];
    sfx("kick");
  };

  // passe dirigido a um colega específico (ex.: assistência para o finalizador)
  const makeDirectPass = (side, toIdx) => {
    const b = st.ball, r = team(side)[toIdx];
    if (!r) return;
    const tx = clamp(r.pos[0] + r.vel[0] * 0.2, 0.02, 0.98);
    const ty = clamp(r.pos[1] + r.vel[1] * 0.2, 0.02, 0.98);
    const d = Math.max(0.001, len(tx - b.pos[0], ty - b.pos[1]));
    b.mode = "pass"; b.recv = { side, idx: toIdx }; b.flightT = 0;
    b.vel = [(tx - b.pos[0]) / d * PASS_SPD, (ty - b.pos[1]) / d * PASS_SPD];
    r.run = [tx, ty];
    sfx("kick");
  };

  const turnover = () => {
    // a jogada "quebra": a bola é cortada e a posse passa ao adversário
    const b = st.ball;
    const side = st.poss, opp = other(side);
    const mid = clamp(b.pos[0] - sgn(side) * 0.08, 0.1, 0.9);
    const col = nearest(opp, mid, b.pos[1]);
    if (col < 0) { setCarrier(opp, nearest(opp, b.pos[0], b.pos[1])); return; }
    b.mode = "loose"; b.collector = { side: opp, idx: col }; b.recv = null;
    const d = Math.max(0.001, len(mid - b.pos[0], b.pos[1] - b.pos[1]) + 0.001);
    b.vel = [(mid - b.pos[0]) / d * 0.5, (Math.random() - 0.5) * 0.2];
    st.poss = opp;
    passCount = 0; passBudget = 3 + Math.floor(Math.random() * 3);
  };

  /* ---------------- eventos com script ---------------- */
  const startAction = (ev) => {
    const a = { ev, t: 0, phase: 0, done: false };
    const type = ev.type;
    if (["goal", "save", "miss", "corner"].includes(type)) {
      st.poss = ev.side;
      const shooterI = ref0(ev.side, ev.pid);
      a.shooterI = shooterI >= 0 ? shooterI : nearest(ev.side, attackX(ev.side), 0.5);
      a.assistI = ev.assistPid ? ref0(ev.side, ev.assistPid) : -1;
      a.goalY = clamp(0.5 + (Math.random() - 0.5) * 0.2, 0.4, 0.6);
      a.passed = false;
      a.corner = type === "corner" || ev.goalType === "corner";
      const b = st.ball;
      if (a.corner) {
        // pontapé de canto: a bola vai para o canto e um jogador vai buscá-la
        a.flagY = Math.random() < 0.5 ? 0.04 : 0.96;
        b.mode = "loose"; b.vel = [0, 0]; b.z = 0; b.carrier = null; b.recv = null; b.collector = null;
        b.pos = [attackX(ev.side) === 1 ? 0.98 : 0.02, a.flagY];
        a.takerI = nearest(ev.side, b.pos[0], b.pos[1]);
      } else if (b.carrier && b.carrier.side === ev.side) {
        // já temos a bola: mantém o portador (continuidade, sem saltos)
        st.ball.mode = "carry";
      } else {
        // a bola está solta/no adversário: o atacante mais perto vai recolhê-la
        // (nunca colamos a bola a um jogador distante — isso via-se como teleporte)
        b.mode = "loose"; b.recv = null;
        b.collector = { side: ev.side, idx: nearest(ev.side, b.pos[0], b.pos[1]) };
      }
    }
    return a;
  };

  const ref0 = (side, pid) => team(side).findIndex((x) => x.id === pid && !x.off);

  const runAction = (a, dt) => {
    a.t += dt;
    const ev = a.ev, side = ev.side, dir = sgn(side);
    const gx = attackX(side);

    if (["goal", "save", "miss", "corner"].includes(ev.type)) {
      const b = st.ball;
      const shooter = team(side)[a.shooterI];
      const isLong = ev.goalType === "longshot";
      const boxX = clamp(gx - dir * (isLong ? 0.24 : 0.12), 0.08, 0.92);
      const defSide = other(side);

      // ---------- PONTAPÉ DE CANTO ----------
      if (a.corner && a.phase === 0) {
        const tk = team(side)[a.takerI];
        if (tk) { tk.run = [b.pos[0], b.pos[1]]; tk.fast = true; }
        const atBall = tk && len(tk.pos[0] - b.pos[0], tk.pos[1] - b.pos[1]) < 0.03;
        if (atBall || a.t > 1.8) {
          // CRUZAMENTO alto para a área
          const tx = clamp(gx - dir * 0.08, 0.08, 0.92), ty = clamp(0.5 + (Math.random() - 0.5) * 0.12, 0.43, 0.57);
          const d = Math.max(0.001, len(tx - b.pos[0], ty - b.pos[1]));
          b.mode = "pass"; b.high = true; b.recv = null; b.flightT = 0; b.carrier = null;
          b.vel = [(tx - b.pos[0]) / d * 0.85, (ty - b.pos[1]) / d * 0.85];
          a.boxTarget = [tx, ty];
          if (shooter) { shooter.run = [tx, ty]; shooter.fast = true; }
          sfx("kick");
          a.phase = 1; a.t = 0;
        }
        return;
      }
      if (a.corner && a.phase === 1) {
        if (len(b.pos[0] - a.boxTarget[0], b.pos[1] - a.boxTarget[1]) < 0.05 || a.t > 0.95) {
          b.high = false; b.z = 0;
          if (ev.type === "goal") {
            b.mode = "shot"; b.recv = null; b.carrier = null; b.flightT = 0;
            const tx = gx - dir * 0.01, ty = clamp(a.goalY, 0.45, 0.55);
            const d = Math.max(0.001, len(tx - b.pos[0], ty - b.pos[1]));
            b.vel = [(tx - b.pos[0]) / d * SHOT_SPD, (ty - b.pos[1]) / d * SHOT_SPD]; b.shotZ = 0.02;
            st.shots.push({ side, x: b.pos[0], min: Math.round(st.minute) });
            setupGkDive(defSide, ty, true); sfx("shot");
            a.phase = 2; a.t = 0;
          } else {
            clearBall(defSide, dir);
            say(ev.min, `Canto para ${side === "H" ? "a equipa da casa" : "os visitantes"} — a defesa afasta.`, "info");
            a.done = true;
          }
        }
        return;
      }

      // ---------- JOGO ABERTO: construção até à área ----------
      if (a.phase === 0) {
        const car = b.carrier && b.carrier.side === side ? b.carrier.idx : -1;
        if (car >= 0) {
          const cref = team(side)[car];
          cref.run = [boxX, a.goalY]; cref.fast = true;
          if (shooter && car !== a.shooterI) { shooter.run = [clamp(boxX - dir * 0.03, 0.05, 0.95), a.goalY]; shooter.fast = true; }
          // passe final ao finalizador, já na zona de finalização
          if (!a.passed && car !== a.shooterI && inZone(side)) { makeDirectPass(side, a.shooterI); a.passed = true; }
          const withShooter = b.carrier && b.carrier.idx === a.shooterI;
          if ((inZone(side) && withShooter && a.t > 0.3) || a.t > 3.4) { a.phase = 1; a.t = 0; }
        } else if (a.t > 4.2) {
          a.phase = 1; a.t = 0; // segurança (raro): a bola ainda não foi recolhida
        }
        return;
      }
      if (a.phase === 1) {
        // REMATE — origem forçada à zona ofensiva (nunca da defesa)
        b.carrier = null; b.mode = "shot"; b.recv = null; b.flightT = 0;
        b.pos[0] = clamp(b.pos[0], side === "H" ? 0.52 : 0.08, side === "H" ? 0.92 : 0.48);
        b.pos[1] = clamp(b.pos[1], 0.12, 0.88);
        st.shots.push({ side, x: b.pos[0], min: Math.round(st.minute) });
        if (shooter) { shooter.fast = false; shooter.run = null; }
        let tx, ty;
        if (ev.type === "miss") {
          // claramente AO LADO — sai por fora do poste (inequívoco)
          tx = gx + dir * 0.05;
          ty = a.goalY < 0.5 ? clamp(a.goalY - 0.2, 0.22, 0.4) : clamp(a.goalY + 0.2, 0.6, 0.78);
        } else {
          tx = gx - dir * 0.01; ty = clamp(a.goalY, 0.45, 0.55); // entre os postes
        }
        const d = Math.max(0.001, len(tx - b.pos[0], ty - b.pos[1]));
        b.vel = [(tx - b.pos[0]) / d * SHOT_SPD, (ty - b.pos[1]) / d * SHOT_SPD];
        b.shotZ = ev.type === "miss" ? 0.04 : isLong ? 0.05 : 0.02;
        if (ev.type === "save") setupGkDive(defSide, ty, false);
        sfx("shot");
        a.phase = 2; a.t = 0;
        return;
      }

      // ---------- RESOLUÇÃO (partilhada por jogo aberto e canto) ----------
      if (a.phase === 2) {
        if (a.t > 0.4) {
          if (ev.type === "goal") {
            b.pos = [clamp(gx + dir * 0.005, 0.01, 0.99), clamp(a.goalY, 0.46, 0.54)]; b.vel = [0, 0]; b.z = 0; b.mode = "loose"; b.collector = null;
            st.score = ev.score ? [...ev.score] : (side === "H" ? [st.score[0] + 1, st.score[1]] : [st.score[0], st.score[1] + 1]);
            st.goalCount++; st.flash = 1; sfx("goal");
            setBanner("GOLO!", "goal", 2.2);
            say(ev.min, `${pick(GOAL_TEXT[ev.goalType] ?? GOAL_TEXT.open)} ${ev.name}${ev.assistName ? ` (assist. ${ev.assistName})` : ""}!`, "goal");
            a.cornerY = Math.random() < 0.5 ? 0.12 : 0.88;
            clearGkDive(defSide);
            a.phase = 3; a.t = 0;
          } else if (ev.type === "save") {
            const gk = gkOf(defSide);
            if (gk) b.pos = [gk.pos[0], gk.pos[1]];
            b.mode = "loose"; b.vel = [-dir * 0.3, (Math.random() - 0.5) * 0.35]; b.z = 0;
            b.collector = { side: defSide, idx: nearest(defSide, b.pos[0], b.pos[1]) };
            st.poss = defSide;
            sfx("save");
            setBanner("DEFESA!", "save", 1.3);
            say(ev.min, `Remate de ${ev.name}… grande defesa de ${ev.gkName ?? "o guarda-redes"}!`, "chance");
            clearGkDive(defSide);
            a.done = true;
          } else { // miss — a bola saiu pela linha de fundo → pontapé de baliza
            b.mode = "loose"; b.vel = [0, 0]; b.z = 0;
            b.pos = [ownX(defSide) === 0.97 ? 0.9 : 0.1, 0.5];
            b.collector = { side: defSide, idx: team(defSide).findIndex((x) => x.gk) };
            st.poss = defSide;
            setBanner("PARA FORA!", "miss", 1.3);
            say(ev.min, `${ev.name} atira… ao lado! Sai pela linha de fundo.`, "chance");
            a.done = true;
          }
        }
        return;
      }
      if (a.phase === 3) {
        // celebração + recomeço do meio-campo
        if (shooter) shooter.run = [side === "H" ? 0.9 : 0.1, a.cornerY];
        for (const o of alive(side)) o.a.run = [lerp(o.a.base[0], side === "H" ? 0.85 : 0.15, 0.5), lerp(o.a.base[1], a.cornerY, 0.4)];
        if (a.t > 1.7) { kickoff(other(side)); a.done = true; }
      }
      return;
    }

    // faltas / cartões
    if (ev.type === "yellow" || ev.type === "red" || ev.type === "red2" || ev.type === "foul") {
      const oi = ref0(ev.side, ev.pid);
      const off = oi >= 0 ? team(ev.side)[oi] : null;
      if (a.phase === 0) {
        const spot = [clamp(0.3 + Math.random() * 0.4, 0.2, 0.8), clamp(0.2 + Math.random() * 0.6, 0.15, 0.85)];
        a.spot = spot;
        st.ball.mode = "loose"; st.ball.vel = [0, 0]; st.ball.pos = [...spot]; st.ball.carrier = null;
        if (off) { off.run = [...spot]; }
        const isRed = ev.type === "red" || ev.type === "red2";
        setBanner(isRed ? "VERMELHO" : "AMARELO", isRed ? "red" : "yellow", 1.6);
        say(ev.min, isRed
          ? `CARTÃO VERMELHO! ${ev.name} vai mais cedo para o balneário.`
          : ev.type === "yellow" ? `Amarelo para ${ev.name}.` : `Falta de ${ev.name}.`, isRed ? "red" : ev.type === "yellow" ? "yellow" : "info");
        a.phase = 1; a.t = 0;
      } else if (a.t > 1.1) {
        if ((ev.type === "red" || ev.type === "red2") && off) { off.off = true; }
        // pontapé livre para o adversário: bola parada, um jogador vai buscá-la
        const opp = other(ev.side);
        st.ball.mode = "loose"; st.ball.vel = [0, 0]; st.ball.pos = [...a.spot];
        st.ball.carrier = null; st.ball.recv = null;
        st.ball.collector = { side: opp, idx: nearest(opp, a.spot[0], a.spot[1]) };
        st.poss = opp;
        a.done = true;
      }
      return;
    }

    // lesão
    if (ev.type === "injury") {
      const oi = ref0(ev.side, ev.pid);
      const victim = oi >= 0 ? team(ev.side)[oi] : null;
      if (a.phase === 0) {
        const spot = victim ? [...victim.pos] : [0.5, 0.5];
        a.spot = spot;
        if (victim) victim.down = true;
        st.ball.mode = "loose"; st.ball.vel = [0, 0]; st.ball.pos = [clamp(spot[0], 0.05, 0.95), 0.02]; st.ball.carrier = null;
        setBanner("LESÃO", "injury", 1.6);
        say(ev.min, `${ev.name} fica no chão… ${ev.subName ? `sai lesionado, entra ${ev.subName}.` : "sai lesionado."}`, "injury");
        a.phase = 1; a.t = 0;
      } else if (a.t > 1.3) {
        if (victim) { victim.down = false; if (!ev.subName) victim.off = true; }
        const s = ev.side;
        st.ball.mode = "loose"; st.ball.vel = [0, 0]; st.ball.carrier = null; st.ball.recv = null;
        st.ball.collector = { side: s, idx: nearest(s, st.ball.pos[0], st.ball.pos[1]) };
        st.poss = s;
        a.done = true;
      }
      return;
    }

    a.done = true; // tipo desconhecido: ignora
  };

  const kickoff = (side) => {
    st.kickSide = side;
    for (const s of ["H", "A"]) for (const a of team(s)) { a.run = null; a.fast = false; a.dive = false; if (!a.off) { a.pos = [...a.base]; a.vel = [0, 0]; } a.down = false; }
    st.ball.pos = [0.5, 0.5]; st.ball.vel = [0, 0]; st.ball.z = 0;
    setCarrier(side, nearest(side, 0.5, 0.5));
    passCount = 0; passBudget = 3 + Math.floor(Math.random() * 3);
  };

  /* ---------------- direção do jogo livre ---------------- */
  const nextAtkEvent = () => {
    for (let i = evIdx; i < events.length; i++) {
      if (["goal", "save", "miss", "corner"].includes(events[i].type)) return events[i];
    }
    return null;
  };

  const freePlay = (dt) => {
    const b = st.ball;
    // enviesa a posse para a equipa que vai ter o próximo lance (transição natural)
    const nx = nextAtkEvent();
    if (nx && nx.min - st.minute < 1.6 && st.poss !== nx.side && b.mode === "carry") { st.poss = nx.side; turnover2(nx.side); return; }

    if (b.mode === "carry" && b.carrier) {
      holdT -= dt;
      if (holdT <= 0) {
        if (passCount >= passBudget) turnover();
        else { makePass(); passCount++; }
      }
    }
  };

  // variação de perda de bola direta para um lado (usada no enviesamento)
  const turnover2 = (side) => {
    const b = st.ball;
    b.mode = "loose"; b.recv = null;
    const col = nearest(side, b.pos[0], b.pos[1]);
    b.collector = { side, idx: col < 0 ? 0 : col };
    b.vel = [(Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2];
    passCount = 0; passBudget = 3 + Math.floor(Math.random() * 3);
  };

  /* ---------------- física da bola ---------------- */
  const ballUpdate = (dt) => {
    const b = st.ball;
    if (b.mode === "carry" && b.carrier) {
      const c = ref(b.carrier);
      if (!c || c.off) { setCarrier(st.poss, nearest(st.poss, b.pos[0], b.pos[1])); return; }
      let hx = c.vel[0], hy = c.vel[1]; const hl = len(hx, hy);
      if (hl < 0.02) { hx = sgn(b.carrier.side); hy = 0; } else { hx /= hl; hy /= hl; }
      b.pos[0] = clamp(c.pos[0] + hx * 0.02, 0.01, 0.99);
      b.pos[1] = clamp(c.pos[1] + hy * 0.02, 0.01, 0.99);
      b.z = 0;
    } else if (b.mode === "pass" || b.mode === "shot") {
      b.pos[0] = clamp(b.pos[0] + b.vel[0] * dt, 0.005, 0.995);
      b.pos[1] = clamp(b.pos[1] + b.vel[1] * dt, 0.005, 0.995);
      b.flightT += dt;
      if (b.mode === "shot") { const zz = b.shotZ ?? 0.03; b.z = Math.max(0, zz * 4 * b.flightT * (1 - b.flightT / 0.5)); }
      else if (b.high) { b.z = Math.max(0, 0.06 * 4 * b.flightT * (1 - b.flightT / 0.85)); }
      if (b.mode === "pass" && b.recv) {
        const r = ref(b.recv);
        if (r && len(b.pos[0] - r.pos[0], b.pos[1] - r.pos[1]) < 0.03) { b.high = false; b.z = 0; setCarrier(b.recv.side, b.recv.idx); }
        else if (b.flightT > 1.6) { // não chegou: fica solta (sem teleporte para o recetor)
          const s = b.recv.side; b.high = false; b.z = 0; b.mode = "loose"; b.recv = null;
          b.collector = { side: s, idx: nearest(s, b.pos[0], b.pos[1]) };
        }
      }
    } else if (b.mode === "loose") {
      b.vel[0] *= 0.95; b.vel[1] *= 0.95;
      b.pos[0] = clamp(b.pos[0] + b.vel[0] * dt, 0.01, 0.99);
      b.pos[1] = clamp(b.pos[1] + b.vel[1] * dt, 0.012, 0.988);
      b.z = 0;
      if (b.collector) {
        const c = ref(b.collector);
        if (c && !c.off && len(b.pos[0] - c.pos[0], b.pos[1] - c.pos[1]) < 0.03) setCarrier(b.collector.side, b.collector.idx);
      }
    }
  };

  /* ---------------- alvos + steering dos agentes ---------------- */
  const steerAll = (dt) => {
    const b = st.ball;
    const carrier = b.carrier;
    // pressor: defesa mais perto da bola
    const defSide = other(st.poss);
    const pressI = nearest(defSide, b.pos[0], b.pos[1]);

    for (const side of ["H", "A"]) {
      const atk = side === st.poss;
      const mates = team(side);
      const dir = sgn(side);
      mates.forEach((a, i) => {
        if (a.off) return;
        let tx, ty, speed = (a.gk ? GK_SPEED : SPEED) * (a.fast ? 1.5 : 1);

        if (a.down) { a.vel = [0, 0]; return; } // caído (lesão)

        if (a.run) { // corridas com script (inclui o mergulho do guarda-redes)
          tx = a.run[0]; ty = a.run[1];
          if (len(tx - a.pos[0], ty - a.pos[1]) < 0.02) { a.run = null; a.fast = false; a.dive = false; }
        } else if (a.gk) {
          tx = ownX(side);
          ty = clamp(0.5 + (b.pos[1] - 0.5) * 0.55, 0.38, 0.62);
        } else if (carrier && carrier.side === side && carrier.idx === i) {
          // portador: conduz para a baliza adversária
          tx = clamp(a.pos[0] + dir * 0.14, 0.04, 0.96);
          ty = clamp(a.pos[1] + (0.5 - a.pos[1]) * 0.08 + (Math.random() - 0.5) * 0.03, 0.06, 0.94);
          speed *= 0.85;
        } else if (b.recv && b.recv.side === side && b.recv.idx === i) {
          tx = b.pos[0] + b.vel[0] * 0.3; ty = b.pos[1] + b.vel[1] * 0.3; // corre para receber
        } else if (b.collector && b.collector.side === side && b.collector.idx === i) {
          tx = b.pos[0]; ty = b.pos[1];
        } else if (!atk && i === pressI) {
          tx = b.pos[0]; ty = b.pos[1]; // pressing
        } else {
          // forma de equipa: bloco desliza e comprime para o lado da bola
          const drift = atk ? 0.34 : 0.26;
          tx = a.base[0] + (b.pos[0] - 0.5) * drift + (atk ? dir * 0.05 : -dir * 0.03);
          ty = a.base[1] + (b.pos[1] - a.base[1]) * 0.3;
          // avançados da equipa que ataca fazem alguma profundidade
          if (atk && a.line === "AV") tx = clamp(tx + dir * 0.06, 0.05, 0.95);
        }

        // separação (evita sobreposição)
        let sepx = 0, sepy = 0;
        for (const m of mates) {
          if (m === a || m.off) continue;
          const ox = a.pos[0] - m.pos[0], oy = a.pos[1] - m.pos[1], od = len(ox, oy);
          if (od > 0.0001 && od < 0.045) { sepx += (ox / od) * (0.045 - od); sepy += (oy / od) * (0.045 - od); }
        }

        let dx = clamp(tx, 0.02, 0.98) - a.pos[0], dy = clamp(ty, 0.02, 0.98) - a.pos[1];
        const d = len(dx, dy);
        let desx = 0, desy = 0;
        if (d > 0.001) { const arr = d < 0.06 ? d / 0.06 : 1; desx = (dx / d) * speed * arr; desy = (dy / d) * speed * arr; }
        desx += sepx * 3.5; desy += sepy * 3.5;
        const k = clamp(dt * 7, 0, 1);
        a.vel[0] += (desx - a.vel[0]) * k;
        a.vel[1] += (desy - a.vel[1]) * k;
        a.pos[0] = clamp(a.pos[0] + a.vel[0] * dt, 0.008, 0.992);
        a.pos[1] = clamp(a.pos[1] + a.vel[1] * dt, 0.012, 0.988);
      });
    }
  };

  /* ---------------- passo mestre ---------------- */
  const tick = (dt) => {
    if (st.done) return;
    if (!st.started) { st.started = true; sfx("whistle"); }
    if (st.banner) { st.banner.ttl -= dt; if (st.banner.ttl <= 0) st.banner = null; }
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 1.4);

    st.minute = Math.min(90, st.minute + dt * PACE);

    if (action) {
      runAction(action, dt);
      if (action.done) action = null;
    } else if (evIdx < events.length && st.minute >= events[evIdx].min) {
      action = startAction(events[evIdx]); evIdx++;
    } else {
      freePlay(dt);
    }

    ballUpdate(dt);
    steerAll(dt);

    if (!action && st.minute >= 90 && evIdx >= events.length) {
      st.done = true;
      st.score = [...result.score];
      sfx("whistle");
      setBanner("FINAL", "whistle", 3);
      say(90, `Apita o árbitro — final! ${result.score[0]}-${result.score[1]}${result.penalties ? ` (gp ${result.penalties[0]}-${result.penalties[1]})` : ""}.`, "info");
    }
  };

  // sub-passos para estabilidade a velocidades altas
  const step = (dtScaled) => {
    newFeed = [];
    let dt = Math.min(0.3, dtScaled);
    const n = Math.max(1, Math.ceil(dt / 0.034));
    const h = dt / n;
    for (let i = 0; i < n && !st.done; i++) tick(h);
    return newFeed;
  };

  const skip = () => {
    newFeed = [];
    let guard = 0;
    while (!st.done && guard++ < 6000) tick(0.05);
    st.done = true; st.score = [...result.score];
    st.sfx.length = 0; // não despejar um monte de sons de uma vez ao saltar
    return newFeed;
  };

  return { state: st, step, skip, SPEED, PACE };
}
