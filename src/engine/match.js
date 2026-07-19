/* Motor de jogo — simulação estatística minuto a minuto.
   A simulação é a fonte de verdade; o viewer 2D é só cenografia.
   REGRA CRÍTICA: estado que emerge a meio (expulsão, lesão) alimenta o resto
   da MESMA simulação — o jogador sai das listas de amostragem no momento. */

import {
  fitnessFactor, moraleFactor, STYLES, lineOf, posPenalty,
  atkOf, defOf, gkOf,
} from "./constants.js";

const ATK_W = { GR: 0.02, DF: 0.25, MD: 0.62, AV: 1.0 };
const DEF_W = { GR: 1.0, DF: 1.0, MD: 0.6, AV: 0.2 };
const XG_BASE = 1.3;
const K = 1.45; // expoente que faz favoritos ganharem sem matar surpresas

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Contribuições efetivas de um jogador no seu slot atual.
const effAtk = (o, teamMorale) =>
  atkOf(o.p) * posPenalty(o.p.pos, o.slotPos) * fitnessFactor(o.p.fitness) * moraleFactor(teamMorale);
const effDef = (o, teamMorale) => {
  const base = lineOf(o.slotPos) === "GR" ? gkOf(o.p) : defOf(o.p);
  return base * posPenalty(o.p.pos, o.slotPos) * fitnessFactor(o.p.fitness) * moraleFactor(teamMorale);
};

// Força de uma equipa a partir dos jogadores EM CAMPO.
const teamStrength = (side) => {
  const n = side.on.length;
  if (n === 0) return { atk: 1, def: 1 };
  let atkS = 0, atkW = 0, defS = 0, defW = 0;
  for (const o of side.on) {
    const line = lineOf(o.slotPos);
    atkS += effAtk(o, side.morale) * ATK_W[line]; atkW += ATK_W[line];
    defS += effDef(o, side.morale) * DEF_W[line]; defW += DEF_W[line];
  }
  const st = STYLES[side.style] ?? STYLES.equilibrado;
  return {
    atk: (atkS / atkW) * st.atk * Math.pow(n / 11, 1.2) * (side.home ? 1.06 : 1),
    def: (defS / defW) * st.def * Math.pow(n / 11, 0.8),
  };
};

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

const SCORER_W = { AV: 1.0, MD: 0.45, DF: 0.12, GR: 0 };

/* team: { name, players: XI ordenado pelos slots da formação, bench, slots: [pos…],
           style, morale, home, medicoLvl } */
const initSide = (team) => ({
  ...team,
  on: team.players.map((p, i) => ({ p, slotPos: team.slots?.[i] ?? p.pos })),
  bench: [...(team.bench ?? [])],
  booked: {},   // pid -> minuto do amarelo (guardar o MINUTO, não boolean)
  reds: new Set(),
  goals: 0, shots: 0, onTarget: 0, corners: 0, fouls: 0,
  ratings: {}, subsUsed: 0,
});

export const simulateMatch = ({ home, away, rng = Math.random }) => {
  const H = initSide({ ...home, home: true });
  const A = initSide({ ...away, home: false });
  const events = [];
  const injuries = [];
  const suspensions = [];

  for (const s of [H, A]) for (const o of s.on) s.ratings[o.p.id] = 6.1 + rng() * 0.5;

  let str = { H: teamStrength(H), A: teamStrength(A) };
  const anchor = () => (str.H.atk + str.H.def + str.A.atk + str.A.def) / 4;

  const xg = (atkSide, defSide) => {
    const a = anchor();
    return XG_BASE * Math.pow(str[atkSide].atk / a, K) * Math.pow(a / str[defSide].def, K);
  };

  const sideOf = (k) => (k === "H" ? H : A);
  const push = (min, type, sideKey, extra = {}) => events.push({ min, type, side: sideKey, ...extra });

  // Remove um jogador de campo (expulsão/lesão) — sai de TODAS as coleções amostráveis.
  const removeFromPitch = (side, pid) => {
    side.on = side.on.filter((o) => o.p.id !== pid);
  };
  const trySub = (side, slotPos) => {
    if (side.subsUsed >= 3 || side.bench.length === 0) return null;
    const idx = side.bench.findIndex((b) => b.pos === slotPos || lineOf(b.pos) === lineOf(slotPos));
    const sub = idx >= 0 ? side.bench.splice(idx, 1)[0] : side.bench.splice(0, 1)[0];
    side.subsUsed++;
    side.on.push({ p: sub, slotPos });
    side.ratings[sub.id] = 6.0;
    return sub;
  };

  for (let min = 1; min <= 90; min++) {
    let acted = false;

    // ---- Oportunidades de golo ----
    for (const [atkKey, defKey] of rng() < 0.5 ? [["H", "A"], ["A", "H"]] : [["A", "H"], ["H", "A"]]) {
      if (acted) break;
      const atkSide = sideOf(atkKey), defSide = sideOf(defKey);
      if (atkSide.on.length < 7) continue;
      const pShot = (xg(atkKey, defKey) * 8) / 90;
      if (rng() >= pShot) continue;
      acted = true;
      atkSide.shots++;

      const outfield = atkSide.on.filter((o) => lineOf(o.slotPos) !== "GR");
      if (outfield.length === 0) continue;
      const shooter = pickWeighted(rng, outfield, (o) => (o.p.skills.potencia + o.p.skills.precisao + 4) * SCORER_W[lineOf(o.slotPos)]).p;
      const gkO = defSide.on.find((o) => lineOf(o.slotPos) === "GR");
      const gkSkill = gkO ? Math.max(12, gkOf(gkO.p)) : 8;
      const shotSkill = shooter.skills.potencia + shooter.skills.precisao;
      const conv = clamp(0.125 * Math.pow((shotSkill + 8) / (gkSkill * 0.62 + 8), 0.9), 0.045, 0.32);
      const roll = rng();

      if (roll < conv) {
        atkSide.goals++;
        atkSide.onTarget++;
        const mates = outfield.filter((o) => o.p.id !== shooter.id);
        const assist = mates.length && rng() < 0.62 ? pickWeighted(rng, mates, (o) => o.p.skills.passe + 3).p : null;
        atkSide.ratings[shooter.id] += 0.95;
        if (assist) atkSide.ratings[assist.id] += 0.55;
        const kinds = ["open", "open", "open", "counter", "longshot", "header"];
        push(min, "goal", atkKey, {
          pid: shooter.id, name: shooter.name,
          assistPid: assist?.id, assistName: assist?.name,
          goalType: kinds[Math.floor(rng() * kinds.length)],
          score: [H.goals, A.goals],
        });
      } else if (roll < conv + 0.34) {
        atkSide.onTarget++;
        if (gkO) defSide.ratings[gkO.p.id] += 0.22;
        push(min, "save", atkKey, { pid: shooter.id, name: shooter.name, gkName: gkO?.p.name });
      } else if (roll < conv + 0.34 + 0.18) {
        atkSide.corners++;
        push(min, "corner", atkKey, { pid: shooter.id, name: shooter.name });
        // Canto pode dar golo de cabeça imediato
        if (rng() < 0.055) {
          const header = pickWeighted(rng, atkSide.on.filter((o) => lineOf(o.slotPos) !== "GR"), (o) => o.p.skills.potencia + o.p.skills.resistencia + 3).p;
          atkSide.goals++; atkSide.shots++; atkSide.onTarget++;
          atkSide.ratings[header.id] += 0.95;
          push(min, "goal", atkKey, { pid: header.id, name: header.name, goalType: "corner", score: [H.goals, A.goals] });
        }
      } else {
        push(min, "miss", atkKey, { pid: shooter.id, name: shooter.name });
      }
    }

    // ---- Faltas / cartões ----
    if (!acted && rng() < 0.2) {
      const key = rng() < 0.5 ? "H" : "A";
      const side = sideOf(key);
      const candidates = side.on.filter((o) => lineOf(o.slotPos) !== "GR");
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
          str = { H: teamStrength(H), A: teamStrength(A) };
          acted = true;
        } else if (r < 0.095) {
          if (already && !side.reds.has(offender.id)) {
            // Segundo amarelo → vermelho (o minuto do 1º amarelo está guardado)
            side.reds.add(offender.id);
            removeFromPitch(side, offender.id);
            side.ratings[offender.id] -= 1.1;
            suspensions.push({ pid: offender.id, matches: 1, side: key });
            push(min, "red2", key, { pid: offender.id, name: offender.name, firstYellowMin: side.booked[offender.id] });
            str = { H: teamStrength(H), A: teamStrength(A) };
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
          str = { H: teamStrength(H), A: teamStrength(A) };
          acted = true;
          break;
        }
      }
    }
  }

  // Posse de bola a partir da força de ataque (soma 100)
  const pH = Math.pow(str.H.atk, 1.25), pA = Math.pow(str.A.atk, 1.25);
  const possH = clamp(Math.round((100 * pH) / (pH + pA)), 25, 75);

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

  return {
    score: [H.goals, A.goals],
    events,
    possession: [possH, 100 - possH],
    shots: [H.shots, A.shots],
    onTarget: [H.onTarget, A.onTarget],
    corners: [H.corners, A.corners],
    fouls: [H.fouls, A.fouls],
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
  const gA = poisson(rng, XG_BASE * Math.pow(strA / avg, K));
  const gB = poisson(rng, XG_BASE * Math.pow(strB / avg, K));
  return [gA, gB];
};
const poisson = (rng, lambda) => {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
};
