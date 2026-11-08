/* Motor de jogo — simulação estatística posse a posse.
   A simulação é a fonte de verdade; o viewer 2D só encena o que aqui se decide.

   Porque ganha quem ganha:
   - MEIO-CAMPO decide quem tem a bola (passe e controlo de quem lá está, e quantos são).
   - CORREDORES: cada ataque vai pela esquerda, centro ou direita, contra os defensores
     REAIS desse lado. A formação muda quantos jogadores há em cada zona.
   - ESTILOS têm duelos próprios (MATCHUP): o contra-ataque castiga quem sobe, a pressão
     incomoda a posse, o bloco baixo fecha o contra-ataque, etc.
   - FINALIZAÇÃO: cada remate tem um xG próprio, ajustado pelo finalizador e pelo guarda-redes.
   A sorte fica onde existe no futebol: nem todos os remates de xG alto entram.

   REGRA CRÍTICA: estado que emerge a meio (expulsão, lesão) alimenta o resto da MESMA
   simulação — o jogador sai das listas de amostragem no momento. */

import {
  fitnessFactor, moraleFactor, STYLES, MATCHUP, lineOf, posPenalty, gkOf,
} from "./constants.js";

const CHANCE_BASE = 0.226;  // probabilidade-base de uma posse acabar em remate
const K = 1.12;             // peso da diferença atacantes/defensores na criação de ocasiões
const CTRL_POW = 1.5;       // peso do meio-campo na divisão da posse
const HOME_BOOST = 1.3;
const XG_BASE = 1.3;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANES = ["L", "C", "R"];
const laneOf = (pos) => (pos?.[0] === "L" ? "L" : pos?.[0] === "R" ? "R" : "C");
const LANE_SPLIT = { L: { L: 1, C: 0.25, R: 0 }, C: { L: 0.2, C: 1, R: 0.2 }, R: { L: 0, C: 0.25, R: 1 } };
const LANE_BASE = { L: 0.3, C: 0.4, R: 0.3 };
const LANE_NAME = { L: "esquerda", C: "zona central", R: "direita" };

const W_CTRL = { GR: 0, DF: 0.6, MD: 1, AV: 0.6 };
const W_PRESS = { GR: 0, DF: 0.4, MD: 1, AV: 0.8 };
const W_ATK = { GR: 0, DF: 0.28, MD: 0.5, AV: 1 };
const W_DEF = { GR: 0, DF: 1, MD: 0.36, AV: 0.08 };
const SCORER_W = { AV: 1.0, MD: 0.42, DF: 0.1, GR: 0 };

const pickWeighted = (rng, list, weightFn) => {
  const ws = list.map(weightFn);
  const total = ws.reduce((s, w) => s + w, 0);
  if (total <= 0) return list[Math.floor(rng() * list.length)];
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
};

/* Os valores do campo por setor, com os jogadores EM CAMPO neste minuto. */
const unitsOf = (side, min) => {
  const st = STYLES[side.style] ?? STYLES.equilibrado;
  const u = { ctrl: 0, press: 0, atk: { L: 0, C: 0, R: 0 }, def: { L: 0, C: 0, R: 0 } };
  for (const o of side.on) {
    const line = lineOf(o.slotPos);
    if (line === "GR") continue;
    const s = o.p.skills;
    const late = (min / 90) * (0.1 - 0.06 * clamp(s.resistencia / 25, 0, 1)) * (st.fade ?? 1);
    const eff = posPenalty(o.p.pos, o.slotPos) * fitnessFactor(o.p.fitness) * moraleFactor(side.morale) * (1 - late);
    u.ctrl += eff * W_CTRL[line] * (0.45 * s.passe + 0.35 * s.controlo + 0.12 * s.drible + 0.08 * s.resistencia);
    u.press += eff * W_PRESS[line] * (0.5 * s.resistencia + 0.3 * s.desarme + 0.2 * s.marcacao);
    const atkV = 0.3 * s.potencia + 0.35 * s.precisao + 0.25 * s.drible + 0.1 * s.controlo;
    const defV = 0.4 * s.desarme + 0.4 * s.marcacao + 0.12 * s.resistencia + 0.08 * s.controlo;
    const split = LANE_SPLIT[laneOf(o.slotPos)];
    for (const l of LANES) {
      u.atk[l] += eff * W_ATK[line] * split[l] * atkV;
      u.def[l] += eff * W_DEF[line] * split[l] * defV;
    }
  }
  return u;
};

/* team: { name, players: XI ordenado pelos slots da formação, bench, slots: [pos…],
           style, morale, home, medicoLvl } */
const initSide = (team) => ({
  ...team,
  on: team.players.map((p, i) => ({ p, slotPos: team.slots?.[i] ?? p.pos })),
  bench: [...(team.bench ?? [])],
  booked: {},   // pid -> minuto do amarelo (guardar o MINUTO, não boolean)
  reds: new Set(),
  goals: 0, shots: 0, onTarget: 0, corners: 0, fouls: 0, xg: 0, possTime: 0,
  laneShots: { L: 0, C: 0, R: 0 },
  ratings: {}, subsUsed: 0,
});

/* Tipos de remate: xG-base e probabilidade por corredor/padrão. */
const SHOT_XG = { big: 0.32, box: 0.13, angle: 0.06, header: 0.095, long: 0.036 };
const SHOT_MIX = {
  C: { big: 0.1, box: 0.36, angle: 0, header: 0.04, long: 0.5 },
  W: { big: 0.04, box: 0.2, angle: 0.18, header: 0.18, long: 0.4 },
  counter: { big: 0.3, box: 0.47, angle: 0.08, header: 0, long: 0.15 },
};
const pickShot = (rng, mix) => {
  let r = rng();
  for (const [k, v] of Object.entries(mix)) { r -= v; if (r <= 0) return k; }
  return "box";
};

export const simulateMatch = ({ home, away, rng = Math.random }) => {
  const H = initSide({ ...home, home: true });
  const A = initSide({ ...away, home: false });
  const events = [];
  const flow = [];
  const injuries = [];
  const suspensions = [];
  const styleOf = (s) => STYLES[s.style] ?? STYLES.equilibrado;
  const sideOf = (k) => (k === "H" ? H : A);
  const otherOf = (k) => (k === "H" ? "A" : "H");

  for (const s of [H, A]) for (const o of s.on) s.ratings[o.p.id] = 6.1 + rng() * 0.4;

  let units, anchor;
  const refresh = (min) => {
    units = { H: unitsOf(H, min), A: unitsOf(A, min) };
    anchor = { atk: {}, def: {}, press: Math.max(0.001, (units.H.press + units.A.press) / 2) };
    for (const l of LANES) {
      anchor.atk[l] = Math.max(0.001, (units.H.atk[l] + units.A.atk[l]) / 2);
      anchor.def[l] = Math.max(0.001, (units.H.def[l] + units.A.def[l]) / 2);
    }
  };
  refresh(0);

  const threat = (atkKey, defKey, lane) => {
    const ra = units[atkKey].atk[lane] / anchor.atk[lane];
    const rd = anchor.def[lane] / Math.max(0.001, units[defKey].def[lane]);
    return clamp(Math.pow(ra * rd, K), 0.12, 4);
  };

  // a pressão reduz o controlo de quem sofre, conforme o físico de quem pressiona
  const control = (key) => {
    const opp = otherOf(key);
    const sOpp = styleOf(sideOf(opp));
    const pressRatio = units[opp].press / anchor.press;
    return Math.max(0.001, units[key].ctrl) * styleOf(sideOf(key)).ctrl * Math.pow(pressRatio, -(sOpp.pressPow ?? 0));
  };

  const push = (min, type, sideKey, extra = {}) => events.push({ min, type, side: sideKey, ...extra });

  // Remove um jogador de campo (expulsão/lesão) — sai de TODAS as coleções amostráveis.
  const removeFromPitch = (side, pid) => { side.on = side.on.filter((o) => o.p.id !== pid); };
  const trySub = (side, slotPos) => {
    if (side.subsUsed >= 3 || side.bench.length === 0) return null;
    const idx = side.bench.findIndex((b) => b.pos === slotPos || lineOf(b.pos) === lineOf(slotPos));
    const sub = idx >= 0 ? side.bench.splice(idx, 1)[0] : side.bench.splice(0, 1)[0];
    side.subsUsed++;
    side.on.push({ p: sub, slotPos });
    side.ratings[sub.id] = 6.0;
    return sub;
  };

  const outfieldOf = (side) => side.on.filter((o) => lineOf(o.slotPos) !== "GR");
  const laneFit = (o, lane) => (LANE_SPLIT[laneOf(o.slotPos)][lane] + 0.15);

  /* Um remate: quem remata, com que qualidade e o que acontece. */
  const takeShot = (min, atkKey, defKey, lane, pattern, kind, pressure) => {
    const atk = sideOf(atkKey), def = sideOf(defKey);
    const outfield = outfieldOf(atk);
    if (!outfield.length) return;
    atk.shots++;
    atk.laneShots[lane]++;
    const shooterO = pickWeighted(rng, outfield, (o) => {
      const s = o.p.skills;
      const skill = kind === "header" ? s.potencia + s.resistencia + 3 : s.potencia + s.precisao + 4;
      return skill * SCORER_W[lineOf(o.slotPos)] * laneFit(o, lane);
    });
    const shooter = shooterO.p;
    const gkO = def.on.find((o) => lineOf(o.slotPos) === "GR");
    const gkSkill = gkO ? Math.max(12, gkOf(gkO.p)) : 8;
    const shotSkill = kind === "header" ? shooter.skills.potencia + shooter.skills.resistencia : shooter.skills.potencia + shooter.skills.precisao;
    const finish = clamp(Math.pow((shotSkill + 8) / (gkSkill * 0.62 + 8), 0.9), 0.45, 2);
    const xg = clamp(SHOT_XG[kind] * finish * Math.pow(pressure, 0.3) * (pattern === "counter" ? 1.12 : 1) * styleOf(atk).quality, 0.008, 0.75);
    atk.xg += xg;
    const base = { pid: shooter.id, name: shooter.name, lane, pattern, shot: kind, xg: +xg.toFixed(2) };
    const roll = rng();
    if (roll < xg) {
      atk.goals++; atk.onTarget++;
      const mates = outfield.filter((o) => o.p.id !== shooter.id);
      const assistChance = kind === "long" ? 0.3 : kind === "header" ? 0.92 : 0.78;
      const assist = mates.length && rng() < assistChance ? pickWeighted(rng, mates, (o) => (o.p.skills.passe + 3) * laneFit(o, lane)).p : null;
      atk.ratings[shooter.id] += 0.95;
      if (assist) atk.ratings[assist.id] += 0.55;
      const goalType = kind === "long" ? "longshot" : kind === "header" ? "header" : pattern === "counter" ? "counter" : "open";
      push(min, "goal", atkKey, { ...base, assistPid: assist?.id, assistName: assist?.name, goalType, score: [H.goals, A.goals] });
      return;
    }
    const pOnTarget = kind === "long" ? 0.22 : 0.28;
    if (roll < xg + pOnTarget * (1 - xg)) {
      atk.onTarget++;
      if (gkO) def.ratings[gkO.p.id] += 0.08 + xg * 0.8;
      push(min, "save", atkKey, { ...base, gkName: gkO?.p.name });
      if (rng() < 0.2) corner(min, atkKey, defKey, lane);
      return;
    }
    const blocked = rng() < 0.42;
    push(min, "miss", atkKey, { ...base, blocked });
    if (blocked && rng() < 0.5) corner(min, atkKey, defKey, lane);
  };

  /* Canto: cabeceia quem é forte no ar; golo ~3%, como no futebol real. */
  const corner = (min, atkKey, defKey, lane) => {
    const atk = sideOf(atkKey);
    atk.corners++;
    const outfield = outfieldOf(atk);
    if (!outfield.length) return;
    const header = pickWeighted(rng, outfield, (o) => o.p.skills.potencia + o.p.skills.resistencia + 3).p;
    const taker = pickWeighted(rng, outfield, (o) => o.p.skills.passe + 1).p;
    if (rng() < 0.042) {
      atk.goals++; atk.shots++; atk.onTarget++; atk.xg += 0.09;
      atk.ratings[header.id] += 0.95;
      push(min, "goal", atkKey, { pid: header.id, name: header.name, assistPid: taker.id !== header.id ? taker.id : undefined, assistName: taker.id !== header.id ? taker.name : undefined, goalType: "corner", lane, pattern: "corner", shot: "header", xg: 0.09, score: [H.goals, A.goals] });
    } else {
      push(min, "corner", atkKey, { pid: header.id, name: header.name, lane });
    }
  };

  /* Penálti, sofrido dentro da área. */
  const penalty = (min, atkKey, defKey) => {
    const atk = sideOf(atkKey), def = sideOf(defKey);
    const outfield = outfieldOf(atk);
    if (!outfield.length) return;
    const taker = outfield.reduce((b, o) => (o.p.skills.precisao > b.p.skills.precisao ? o : b)).p;
    const gkO = def.on.find((o) => lineOf(o.slotPos) === "GR");
    const xg = clamp(0.76 + (taker.skills.precisao - 12) * 0.008, 0.6, 0.88);
    atk.shots++; atk.xg += xg; def.fouls++;
    const base = { pid: taker.id, name: taker.name, lane: "C", pattern: "penalty", shot: "penalty", xg: +xg.toFixed(2), penalty: true };
    const r = rng();
    if (r < xg) {
      atk.goals++; atk.onTarget++; atk.ratings[taker.id] += 0.8;
      push(min, "goal", atkKey, { ...base, goalType: "penalty", score: [H.goals, A.goals] });
    } else if (r < xg + (1 - xg) * 0.7) {
      atk.onTarget++;
      if (gkO) def.ratings[gkO.p.id] += 0.7;
      push(min, "save", atkKey, { ...base, gkName: gkO?.p.name });
    } else {
      push(min, "miss", atkKey, base);
    }
  };

  const FAIL_ENDS = ["tackle", "tackle", "intercept", "intercept", "clear", "out", "keeper"];

  for (let min = 1; min <= 90; min++) {
    if (min % 15 === 0) refresh(min);

    // ---- Quem tem a bola: disputa do meio-campo ----
    const cH = Math.pow(control("H"), CTRL_POW), cA = Math.pow(control("A"), CTRL_POW);
    const atkKey = rng() < clamp(cH / (cH + cA), 0.22, 0.78) ? "H" : "A";
    const defKey = otherOf(atkKey);
    const atkSide = sideOf(atkKey), defSide = sideOf(defKey);
    const sa = styleOf(atkSide), sd = styleOf(defSide);
    atkSide.possTime += sa.tempo;
    let acted = false;

    if (atkSide.on.length >= 7) {
      // ---- Por onde ataca: procura o corredor mais frágil ----
      const threats = { L: threat(atkKey, defKey, "L"), C: threat(atkKey, defKey, "C"), R: threat(atkKey, defKey, "R") };
      const laneW = (l) => LANE_BASE[l] * Math.pow(threats[l], 0.8);
      const lane = pickWeighted(rng, LANES, laneW);
      const isCounter = rng() < sa.counter * sd.open;
      const pattern = isCounter ? "counter" : sa.direct > rng() ? "direct" : lane === "C" ? "build" : "wide";

      const trailing = min >= 70 && atkSide.goals < defSide.goals;
      const leading = min >= 70 && defSide.goals < atkSide.goals;
      const matchup = MATCHUP[atkSide.style]?.[defSide.style] ?? 1;
      const pChance = clamp(
        CHANCE_BASE * threats[lane] * sa.volume * sd.expose * matchup
          * (atkSide.home ? HOME_BOOST : 1) * (isCounter ? 1.55 : 1) * (trailing ? 1.12 : leading ? 0.92 : 1),
        0.015, 0.75,
      );

      if (rng() < pChance) {
        acted = true;
        const inBoxChance = rng();
        if (inBoxChance < 0.0165) penalty(min, atkKey, defKey);
        else {
          const kind = pickShot(rng, isCounter ? SHOT_MIX.counter : lane === "C" ? SHOT_MIX.C : SHOT_MIX.W);
          takeShot(min, atkKey, defKey, lane, pattern, kind, threats[lane]);
        }
      } else {
        const end = FAIL_ENDS[Math.floor(rng() * FAIL_ENDS.length)];
        const depth = +clamp(0.32 + 0.3 * Math.min(1.4, threats[lane]) + rng() * 0.22, 0.25, 0.92).toFixed(2);
        flow.push({ m: min, s: atkKey, c: lane, p: pattern, d: depth, e: end });
        // quem recupera a bola ganha nota: os duelos defensivos também contam
        const stoppers = outfieldOf(defSide);
        if (stoppers.length && (end === "tackle" || end === "intercept")) {
          const st = pickWeighted(rng, stoppers, (o) => (o.p.skills.desarme + o.p.skills.marcacao + 1) * laneFit(o, lane));
          defSide.ratings[st.p.id] += 0.035;
        }
        if (lane !== "C" && depth > 0.68 && rng() < 0.22) { corner(min, atkKey, defKey, lane); acted = true; }
      }
    }

    // ---- Faltas / cartões ----
    if (!acted && rng() < 0.2 * (sd.fouls ?? 1)) {
      const key = rng() < 0.75 ? defKey : atkKey;
      const side = sideOf(key);
      const candidates = outfieldOf(side);
      if (candidates.length) {
        const offender = pickWeighted(rng, candidates, () => 1).p;
        side.fouls++;
        const r = rng();
        const already = side.booked[offender.id] !== undefined;
        if (r < 0.004 && !side.reds.has(offender.id)) {
          // Vermelho direto
          side.reds.add(offender.id);
          removeFromPitch(side, offender.id);
          side.ratings[offender.id] -= 1.4;
          suspensions.push({ pid: offender.id, matches: 2, side: key });
          push(min, "red", key, { pid: offender.id, name: offender.name });
          refresh(min);
          acted = true;
        } else if (r < 0.095) {
          if (already && !side.reds.has(offender.id)) {
            // Segundo amarelo → vermelho (o minuto do 1º amarelo está guardado)
            side.reds.add(offender.id);
            removeFromPitch(side, offender.id);
            side.ratings[offender.id] -= 1.1;
            suspensions.push({ pid: offender.id, matches: 1, side: key });
            push(min, "red2", key, { pid: offender.id, name: offender.name, firstYellowMin: side.booked[offender.id] });
            refresh(min);
          } else if (!already) {
            side.booked[offender.id] = min;
            side.ratings[offender.id] -= 0.3;
            push(min, "yellow", key, { pid: offender.id, name: offender.name });
          }
          acted = true;
        } else if (rng() < 0.12) {
          push(min, "foul", key, { pid: offender.id, name: offender.name });
          acted = true;
        }
      }
    }

    // ---- Lesões (dep. médico reduz) ----
    if (!acted) {
      for (const key of ["H", "A"]) {
        const side = sideOf(key);
        const medFactor = 1 - (side.medicoLvl ?? 1) * 0.05;
        if (rng() < 0.0016 * medFactor && side.on.length > 7) {
          const victim = side.on[Math.floor(rng() * side.on.length)];
          // lesões em minutos REAIS (30 min a ~4h, reduzido pelo dep. médico)
          const minutes = Math.max(20, Math.round((30 + rng() * 210) * medFactor));
          injuries.push({ pid: victim.p.id, name: victim.p.name, minutes, side: key });
          removeFromPitch(side, victim.p.id);
          const sub = trySub(side, victim.slotPos);
          push(min, "injury", key, { pid: victim.p.id, name: victim.p.name, subPid: sub?.id, subName: sub?.name });
          refresh(min);
          break;
        }
      }
    }
  }

  // Posse real: o tempo com bola acumulado ao longo do jogo (soma 100)
  const possH = clamp(Math.round((100 * H.possTime) / Math.max(1, H.possTime + A.possTime)), 20, 80);

  // Ajuste de ratings pelo resultado + MVP
  const winKey = H.goals > A.goals ? "H" : A.goals > H.goals ? "A" : null;
  for (const [key, side] of [["H", H], ["A", A]]) {
    for (const id of Object.keys(side.ratings)) {
      if (winKey === key) side.ratings[id] += 0.35;
      side.ratings[id] = clamp(Math.round(side.ratings[id] * 10) / 10, 3.5, 10);
    }
  }
  let mvp = null, best = -1;
  for (const side of [H, A]) for (const o of side.on) {
    if (side.ratings[o.p.id] > best) { best = side.ratings[o.p.id]; mvp = { pid: o.p.id, name: o.p.name }; }
  }

  // ---- Explicação do resultado: porque aconteceu o que aconteceu ----
  const insights = [];
  const nameOf = (s, fallback) => s.name ?? fallback;
  const nH = nameOf(H, "A equipa da casa"), nA = nameOf(A, "Os visitantes");
  if (Math.abs(possH - 50) >= 7) insights.push(`${possH > 50 ? nH : nA} mandou no meio-campo (${Math.max(possH, 100 - possH)}% de posse).`);
  for (const [k, s, n] of [["H", H, nH], ["A", A, nA]]) {
    const other = sideOf(otherOf(k));
    const m = MATCHUP[s.style]?.[other.style] ?? 1;
    if (m >= 1.08) insights.push(`A tática de ${n} (${styleOf(s).label}) funcionou bem contra ${styleOf(other).label}.`);
    const top = LANES.reduce((b, l) => (s.laneShots[l] > s.laneShots[b] ? l : b), "L");
    if (s.shots >= 8 && s.laneShots[top] / s.shots >= 0.5) insights.push(`${n} criou mais perigo pela ${LANE_NAME[top]}.`);
    if (s.reds.size) insights.push(`${n} pagou caro por jogar com menos jogadores.`);
  }
  const dxg = H.xg - A.xg;
  if (winKey && ((winKey === "H" && dxg < -0.4) || (winKey === "A" && dxg > 0.4))) insights.push(`${winKey === "H" ? nH : nA} foi mais eficaz na finalização do que o volume de jogo indicava.`);
  else if (winKey && Math.abs(dxg) >= 1) insights.push(`Vitória justa de ${winKey === "H" ? nH : nA}: criou ocasiões muito melhores.`);

  return {
    score: [H.goals, A.goals],
    events,
    flow,
    possession: [possH, 100 - possH],
    shots: [H.shots, A.shots],
    onTarget: [H.onTarget, A.onTarget],
    corners: [H.corners, A.corners],
    fouls: [H.fouls, A.fouls],
    xg: [+H.xg.toFixed(2), +A.xg.toFixed(2)],
    styles: [H.style ?? "equilibrado", A.style ?? "equilibrado"],
    insights: insights.slice(0, 3),
    ratings: { ...H.ratings, ...A.ratings },
    injuries, suspensions,
    mvp,
    homeXI: home.players.map((p, i) => ({ id: p.id, name: p.name, pos: home.slots?.[i] ?? p.pos })),
    awayXI: away.players.map((p, i) => ({ id: p.id, name: p.name, pos: away.slots?.[i] ?? p.pos })),
  };
};

/* Simulação rápida bot-vs-bot (calendário do mundo) — sem eventos. */
export const simQuick = (strA, strB, rng = Math.random) => {
  const avg = (strA + strB) / 2;
  const gA = poisson(rng, XG_BASE * Math.pow(strA / avg, 1.45));
  const gB = poisson(rng, XG_BASE * Math.pow(strB / avg, 1.45));
  return [gA, gB];
};
const poisson = (rng, lambda) => {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
};
