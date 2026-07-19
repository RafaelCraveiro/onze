/* Viewer 2D do jogo completo — canvas + requestAnimationFrame.
   REALISMO: a bola circula de PÉ EM PÉ (passes entre jogadores reais), com
   portador destacado, rasto nos remates e flash no momento do passe.
   A simulação já decidiu tudo; isto é cenografia sobre live.timeline. */

import { useEffect, useRef, useState } from "react";
import Emblem from "./Emblem.jsx";
import { colorsClash } from "../helpers.js";
import { lineOf } from "../../engine/constants.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

const pathPosZ = (path, t) => {
  if (!path || path.length === 0) return [0.5, 0.5, 0];
  if (t <= path[0][0]) return [path[0][1], path[0][2], 0];
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i][0]) {
      const p0 = path[i - 1], p1 = path[i];
      const k = ease((t - p0[0]) / (p1[0] - p0[0] || 1));
      const dist = Math.hypot(p1[1] - p0[1], p1[2] - p0[2]);
      const maxZ = dist > 0.16 ? Math.min(0.08, dist * 0.28) : 0;
      return [lerp(p0[1], p1[1], k), lerp(p0[2], p1[2], k), maxZ * 4 * k * (1 - k)];
    }
  }
  const l = path[path.length - 1];
  return [l[1], l[2], 0];
};

/* Posições-base por linhas (independente da formação exata). */
const baseSpots = (xi, homeSide) => {
  const lines = { GR: [], DF: [], MD: [], AV: [] };
  xi.forEach((p, i) => lines[lineOf(p.pos)].push(i));
  const X = { GR: 0.045, DF: 0.19, MD: 0.38, AV: 0.6 };
  const out = Array.from({ length: xi.length });
  for (const [pos, idxs] of Object.entries(lines)) {
    idxs.forEach((idx, j) => {
      const y = idxs.length === 1 ? 0.5 : 0.14 + (0.72 * j) / (idxs.length - 1);
      const x = homeSide ? X[pos] : 1 - X[pos];
      out[idx] = [x, y];
    });
  }
  return out;
};

const FEED_ICON = { goal: "⚽", chance: "🥅", yellow: "🟨", red: "🟥", injury: "🚑", info: "▪️" };
const TRAVEL = 0.62; // fração de cada passe em viagem (o resto é controlo do recetor)

export default function MatchViewer2D({ live, club, onFinish }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState([0, 0]);
  const [minute, setMinute] = useState(0);
  const [feed, setFeed] = useState([]);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  const S = useRef({
    idx: 0, t: 0, playing: true, speed: 1, removed: new Set(),
    particles: [], done: false, lastNow: 0, wanderSeed: Math.random() * 100,
    plan: null, planIdx: -1, trail: [],
  }).current;

  const { result, timeline, opp, isHome } = live;
  const scenes = timeline.scenes;

  const homeInfo = isHome ? { name: club.name, emblem: club.emblem } : { name: opp.team, emblem: opp.emblem };
  const awayInfo = isHome ? { name: opp.team, emblem: opp.emblem } : { name: club.name, emblem: club.emblem };
  let kitH = homeInfo.emblem?.c1 ?? "#2563eb";
  let kitA = awayInfo.emblem?.c1 ?? "#dc2626";
  if (colorsClash(kitH, kitA)) kitA = colorsClash("#f8fafc", kitH) ? "#0f172a" : "#f8fafc";

  useEffect(() => {
    S.playing = playing;
    S.speed = speed;
  }, [playing, speed, S]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 720, Hh = 460;
    canvas.width = W * dpr;
    canvas.height = Hh * dpr;
    ctx.scale(dpr, dpr);

    const spotsH = baseSpots(result.homeXI, true);
    const spotsA = baseSpots(result.awayXI, false);
    const xiOf = (k) => (k === "H" ? result.homeXI : result.awayXI);
    const spotsOf = (k) => (k === "H" ? spotsH : spotsA);
    const slotOfPid = (sideKey, pid) => xiOf(sideKey).findIndex((p) => p.id === pid);

    /* ---------- plano de cena: passes ancorados em jogadores reais ---------- */
    const buildPlan = (sc) => {
      const plan = { kind: sc?.kind, nodes: null, anchors: [] };
      if (sc?.kind === "flow") {
        const sideKey = sc.side;
        const xi = xiOf(sideKey), spots = spotsOf(sideKey);
        const dir = sideKey === "H" ? 1 : -1;
        const idxs = xi.map((_, i) => i).filter((i) => lineOf(xi[i].pos) !== "GR" && !S.removed.has(xi[i].id));
        if (idxs.length >= 3) {
          const used = new Set();
          // começa atrás (defesa/meio) e vai passando tendencialmente para a frente
          let cur = idxs.slice().sort((a, b) => (spots[a][0] - spots[b][0]) * dir)[Math.floor(Math.random() * Math.min(4, idxs.length))];
          const nodes = [];
          const nPasses = 3 + Math.floor(Math.random() * 3);
          for (let j = 0; j <= nPasses; j++) {
            used.add(cur);
            const [sx, sy] = spots[cur];
            nodes.push({
              slot: cur,
              x: clamp(sx + (Math.random() - 0.5) * 0.07, 0.05, 0.95),
              y: clamp(sy + (Math.random() - 0.5) * 0.1, 0.06, 0.94),
            });
            const cands = idxs.filter((i) => !used.has(i));
            if (!cands.length) break;
            // prefere colegas próximos e ligeiramente mais adiantados
            cands.sort((a, b) => {
              const da = Math.hypot(spots[a][0] - sx, spots[a][1] - sy) - (spots[a][0] - sx) * dir * 0.6;
              const db = Math.hypot(spots[b][0] - sx, spots[b][1] - sy) - (spots[b][0] - sx) * dir * 0.6;
              return da - db;
            });
            cur = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
          }
          plan.nodes = nodes;
        }
      } else if (["goal", "save", "miss", "corner"].includes(sc?.kind) && sc.ball?.length > 2) {
        // ancora atacantes aos pontos por onde a bola vai passar (jogada com passes reais)
        const sideKey = sc.side;
        const xi = xiOf(sideKey), spots = spotsOf(sideKey);
        const used = new Set([slotOfPid(sideKey, sc.scorerPid), slotOfPid(sideKey, sc.assistPid), slotOfPid(sideKey, sc.pid)].filter((i) => i >= 0));
        for (const [t, x, y] of sc.ball.slice(0, -1)) {
          let best = -1, bestD = 0.55;
          for (let i = 0; i < xi.length; i++) {
            if (used.has(i) || S.removed.has(xi[i].id) || lineOf(xi[i].pos) === "GR") continue;
            const d = Math.hypot(spots[i][0] - x, spots[i][1] - y);
            if (d < bestD) { bestD = d; best = i; }
          }
          if (best >= 0) { used.add(best); plan.anchors.push({ slot: best, x, y, t }); }
        }
      }
      S.plan = plan;
      S.planIdx = S.idx;
      S.trail = [];
    };

    /* posição da bola numa cena de circulação (nó a nó, com viagem + controlo) */
    const flowBall = (nodes, k) => {
      const legs = nodes.length - 1;
      if (legs < 1) return { x: nodes[0].x, y: nodes[0].y, z: 0, holder: nodes[0].slot, from: null, travelK: 1 };
      const per = 1 / legs;
      const li = Math.min(legs - 1, Math.floor(k / per));
      const lk = (k - li * per) / per;
      const a = nodes[li], b = nodes[li + 1];
      if (lk < TRAVEL) {
        const t = ease(lk / TRAVEL);
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const z = dist > 0.14 ? Math.min(0.06, dist * 0.25) * 4 * t * (1 - t) : 0;
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z, holder: null, from: a, to: b, travelK: t };
      }
      const w = Math.sin(k * 40 + S.wanderSeed) * 0.006;
      return { x: b.x + w, y: b.y + w, z: 0, holder: b.slot, from: null, travelK: 1 };
    };

    const completeScene = (sc) => {
      if (sc.text) setFeed((f) => [{ min: Math.round(sc.minEnd ?? sc.min ?? 0), text: sc.text, type: sc.feedType ?? sc.kind }, ...f]);
      if (sc.score) setScore(sc.score);
      if (sc.removePid) S.removed.add(sc.removePid);
      if (sc.kind === "goal") {
        const color = sc.side === "H" ? kitH : kitA;
        for (let i = 0; i < 60; i++) {
          S.particles.push({
            x: Math.random(), y: -0.05 - Math.random() * 0.3,
            vy: 0.15 + Math.random() * 0.25, vx: (Math.random() - 0.5) * 0.1,
            color: Math.random() < 0.5 ? color : "#f8fafc", life: 2.5,
          });
        }
      }
    };

    const finishAll = () => {
      while (S.idx < scenes.length) { completeScene(scenes[S.idx]); S.idx++; }
      S.done = true;
      setDone(true);
      setMinute(90);
    };
    S.finishAll = finishAll;

    const px = (x) => 20 + x * (W - 40);
    const py = (y) => 16 + y * (Hh - 60);

    const drawPitch = () => {
      ctx.fillStyle = "#14532d";
      ctx.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? "#166534" : "#15803d22";
        ctx.fillRect(20 + (i * (W - 40)) / 10, 16, (W - 40) / 10, Hh - 60);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px(0), py(0), px(1) - px(0), py(1) - py(0));
      ctx.beginPath(); ctx.moveTo(px(0.5), py(0)); ctx.lineTo(px(0.5), py(1)); ctx.stroke();
      ctx.beginPath(); ctx.arc(px(0.5), py(0.5), 42, 0, Math.PI * 2); ctx.stroke();
      for (const side of [0, 1]) {
        const gx = side === 0 ? px(0) : px(1);
        const dir = side === 0 ? 1 : -1;
        ctx.strokeRect(Math.min(gx, gx + dir * 78), py(0.24), 78, py(0.76) - py(0.24));
        ctx.strokeRect(Math.min(gx, gx + dir * 30), py(0.38), 30, py(0.62) - py(0.38));
        ctx.beginPath(); ctx.arc(gx + dir * 55, py(0.5), 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(side === 0 ? gx - 7 : gx, py(0.44), 7, py(0.56) - py(0.44));
      }
    };

    const drawDot = (x, y, color, num, isGK, lying = false, ring = false) => {
      const X = px(x), Y = py(y);
      ctx.save();
      if (lying) { ctx.translate(X, Y); ctx.rotate(Math.PI / 2); ctx.translate(-X, -Y); }
      if (ring) {
        ctx.beginPath();
        ctx.arc(X, Y, 12.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(X, Y + 6, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(X, Y, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = isGK ? "#f59e0b" : color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
      ctx.fillStyle = isGK || color === "#f8fafc" ? "#0f172a" : "#fff";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(num), X, Y + 0.5);
      ctx.restore();
    };

    const draw = (now) => {
      const sc = scenes[S.idx];
      if (S.planIdx !== S.idx) buildPlan(sc);
      const time = now / 1000;
      drawPitch();

      const k = sc ? clamp(S.t / sc.dur, 0, 1) : 1;

      /* ---- bola: circulação nó-a-nó nas cenas de posse; caminho do lance nas outras ---- */
      let bx = 0.5, by = 0.5, bz = 0, holderSlot = null, holderSide = null, passing = null;
      if (sc?.kind === "flow" && S.plan?.nodes) {
        const fb = flowBall(S.plan.nodes, k);
        bx = fb.x; by = fb.y; bz = fb.z;
        if (fb.holder !== null) { holderSlot = fb.holder; holderSide = sc.side; }
        if (fb.from && fb.travelK < 0.35) passing = fb.from; // flash do passe
      } else if (sc?.ball) {
        [bx, by, bz] = pathPosZ(sc.ball, k);
      }

      // rasto (visível quando a bola voa depressa — passes longos e remates)
      S.trail.push([bx, by]);
      if (S.trail.length > 7) S.trail.shift();

      /* ---- jogadores ---- */
      const wander = (i, side) => [
        Math.sin(time * 0.9 + i * 2.1 + side * 3 + S.wanderSeed) * 0.012,
        Math.cos(time * 0.7 + i * 1.7 + side * 5 + S.wanderSeed) * 0.015,
      ];
      const eventScene = sc && sc.kind !== "flow" && sc.kind !== "kickoff" && sc.kind !== "halftime" && sc.kind !== "fulltime";

      for (const [xi, spots, sideKey, kit] of [
        [result.homeXI, spotsH, "H", kitH],
        [result.awayXI, spotsA, "A", kitA],
      ]) {
        xi.forEach((p, i) => {
          if (S.removed.has(p.id)) return;
          const isGK = lineOf(p.pos) === "GR";
          const [bxp, byp] = spots[i];
          const [wx, wy] = wander(i, sideKey === "H" ? 0 : 1);
          let x = bxp + (bx - 0.5) * (isGK ? 0.02 : 0.22) + wx;
          let y = byp + (by - 0.5) * (isGK ? 0.35 : 0.3) + wy;
          let lying = false;
          let ring = false;

          // circulação: os participantes do plano ficam nos seus nós (recebem o passe)
          if (sc?.kind === "flow" && S.plan?.nodes && sideKey === sc.side) {
            const node = S.plan.nodes.find((n) => n.slot === i);
            if (node) { x = node.x + wx * 0.4; y = node.y + wy * 0.4; }
            if (holderSide === sideKey && holderSlot === i) ring = true;
          }

          if (eventScene) {
            // atacantes ancorados aos pontos do lance (a jogada tem passes visíveis)
            if (sideKey === sc.side && S.plan?.anchors?.length) {
              const a = S.plan.anchors.find((a) => a.slot === i);
              if (a) {
                const reach = clamp(k / Math.max(0.05, a.t), 0, 1);
                x = lerp(bxp + wx, a.x, ease(reach));
                y = lerp(byp + wy, a.y, ease(reach));
                if (Math.hypot(bx - x, by - y) < 0.035) ring = true;
              }
            }
            if (p.id === sc.scorerPid || (sc.kind !== "goal" && p.id === sc.pid && sc.kind !== "injury")) {
              x = lerp(x, bx - (sideKey === "H" ? 0.02 : -0.02), 0.85); y = lerp(y, by, 0.85);
              if (Math.hypot(bx - x, by - y) < 0.045) ring = true;
            }
            if (p.id === sc.assistPid) { x = lerp(x, bx, 0.5); y = lerp(y, by + 0.08, 0.5); }
            if (sc.kind === "injury" && p.id === sc.pid) { x = sc.spot[0]; y = sc.spot[1]; lying = true; }
            if ((sc.kind === "red" || sc.kind === "yellow" || sc.kind === "foul") && p.id === sc.pid) { x = sc.spot[0]; y = sc.spot[1]; }
            if (isGK) {
              const defendsLeft = sideKey === "H";
              const ballNear = defendsLeft ? bx < 0.35 : bx > 0.65;
              if (ballNear) y = clamp(by, 0.4, 0.6);
            }
          }
          drawDot(clamp(x, 0.005, 0.995), clamp(y, 0.01, 0.99), kit, i + 1, isGK, lying, ring);
        });
      }

      // árbitro
      drawDot(clamp(bx - 0.06, 0.02, 0.98), clamp(by + 0.1, 0.05, 0.95), "#1e293b", "", false);

      /* ---- flash do passe + rasto ---- */
      if (passing) {
        ctx.beginPath();
        ctx.moveTo(px(passing.x), py(passing.y));
        ctx.lineTo(px(bx), py(by));
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (let i = 1; i < S.trail.length; i++) {
        const [x0, y0] = S.trail[i - 1], [x1, y1] = S.trail[i];
        if (Math.hypot(x1 - x0, y1 - y0) < 0.006) continue; // só quando voa depressa
        ctx.beginPath();
        ctx.moveTo(px(x0), py(y0));
        ctx.lineTo(px(x1), py(y1));
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + (i / S.trail.length) * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      /* ---- bola ---- */
      if (sc && sc.kind !== "halftime" && sc.kind !== "fulltime") {
        const BX = px(bx), BY = py(by);
        ctx.beginPath(); ctx.ellipse(BX, BY + 5, 4.5, 2, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fill();
        ctx.beginPath(); ctx.arc(BX, BY - bz * 220, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.strokeStyle = "#334155"; ctx.lineWidth = 1; ctx.stroke();
      }

      // confettis
      for (const pt of S.particles) {
        ctx.fillStyle = pt.color;
        ctx.fillRect(px(pt.x), py(pt.y), 4, 4);
      }

      /* ---- overlays ---- */
      if (sc) {
        if (sc.kind === "goal" && k > 0.7) {
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, Hh / 2 - 44, W, 88);
          ctx.fillStyle = "#facc15"; ctx.font = "bold 44px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("GOOOLO!", W / 2, Hh / 2 + 14);
        }
        if ((sc.kind === "save" || sc.kind === "miss") && k > 0.8) {
          ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(sc.kind === "save" ? "DEFESA!" : "AO LADO!", px(sc.side === "H" ? 0.85 : 0.15), py(0.12));
        }
        if ((sc.kind === "yellow" || sc.kind === "red") && k > 0.35) {
          const X = px(sc.spot[0]), Y = py(sc.spot[1]) - 26;
          ctx.save();
          ctx.translate(X, Y); ctx.rotate(-0.12);
          ctx.fillStyle = sc.kind === "red" ? "#dc2626" : "#facc15";
          ctx.fillRect(-7, -11, 14, 22);
          ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.strokeRect(-7, -11, 14, 22);
          ctx.restore();
        }
        if (sc.kind === "kickoff" || sc.kind === "halftime" || sc.kind === "fulltime") {
          ctx.fillStyle = "rgba(2,6,23,0.55)"; ctx.fillRect(0, 0, W, Hh);
          ctx.fillStyle = "#f8fafc"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(sc.kind === "kickoff" ? "APITO INICIAL" : sc.kind === "halftime" ? "INTERVALO" : "FINAL DO JOGO", W / 2, Hh / 2);
        }
      }
      if (S.done) {
        ctx.fillStyle = "rgba(2,6,23,0.6)"; ctx.fillRect(0, 0, W, Hh);
        ctx.fillStyle = "#f8fafc"; ctx.font = "bold 34px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`${result.score[0]} - ${result.score[1]}`, W / 2, Hh / 2 - 10);
        ctx.font = "600 16px sans-serif"; ctx.fillStyle = "#94a3b8";
        ctx.fillText("Final do jogo", W / 2, Hh / 2 + 20);
      }
    };

    let raf;
    const step = (now) => {
      const dt = S.lastNow ? Math.min(0.1, (now - S.lastNow) / 1000) : 0;
      S.lastNow = now;

      if (!S.done && S.playing) {
        S.t += dt * S.speed;
        let guard = 0;
        while (S.idx < scenes.length && S.t >= scenes[S.idx].dur && guard++ < 50) {
          S.t -= scenes[S.idx].dur;
          completeScene(scenes[S.idx]);
          S.idx++;
        }
        if (S.idx >= scenes.length) { S.done = true; setDone(true); setMinute(90); }
        else {
          const sc = scenes[S.idx];
          const k = clamp(S.t / sc.dur, 0, 1);
          setMinute(Math.round(lerp(sc.minStart ?? sc.min ?? 0, sc.minEnd ?? sc.min ?? 0, k)));
        }
        for (const p of S.particles) { p.y += p.vy * dt; p.x += p.vx * dt; p.life -= dt; }
        S.particles = S.particles.filter((p) => p.life > 0 && p.y < 1.1);
      }
      draw(now);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* marcador */}
      <div className="flex items-center justify-between rounded-lg border border-[#d9dcc8] bg-white px-3 py-2 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Emblem emblem={homeInfo.emblem} size={30} />
          <span className="truncate text-sm font-bold">{homeInfo.name}</span>
        </div>
        <div className="flex flex-col items-center px-3">
          <span className="text-2xl font-black tabular-nums">{score[0]} - {score[1]}</span>
          <span className="text-xs font-bold text-[#4f7a12] tabular-nums">{minute}'</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-bold">{awayInfo.name}</span>
          <Emblem emblem={awayInfo.emblem} size={30} />
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full rounded-lg border border-[#3e7a1c] shadow" style={{ aspectRatio: "720/460" }} />

      {/* controlos — fixos acima do feed que cresce */}
      <div className="flex items-center gap-2">
        {!done && (
          <>
            <button onClick={() => setPlaying((p) => !p)} className="rounded-md border border-[#c9cdb6] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#f4f5ec]">
              {playing ? "⏸" : "▶"}
            </button>
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md px-3 py-1.5 text-sm font-bold ${speed === s ? "btn-green" : "border border-[#c9cdb6] bg-white hover:bg-[#f4f5ec]"}`}
              >
                {s}x
              </button>
            ))}
            <button onClick={() => S.finishAll?.()} className="ml-auto rounded-md border border-[#c9cdb6] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#f4f5ec]">
              Saltar ⏭
            </button>
          </>
        )}
        {done && (
          <button onClick={onFinish} className="btn-green onze-pop ml-auto rounded-md px-5 py-2 text-sm font-bold">
            Continuar →
          </button>
        )}
      </div>

      {/* relato */}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-[#d9dcc8] bg-white p-2 shadow-sm">
        {feed.length === 0 && <p className="p-1 text-xs text-[#9aa08e]">O relato aparece aqui…</p>}
        {feed.map((f, i) => (
          <p key={feed.length - i} className={`border-b border-[#eef0e4] px-1 py-1 text-xs last:border-0 ${f.type === "goal" ? "font-bold text-[#c98d09]" : f.type === "red" ? "text-[#c0392b]" : "text-[#3a4030]"}`}>
            <span className="mr-1 inline-block w-7 text-right font-mono text-[#9aa08e]">{f.min}'</span>
            {FEED_ICON[f.type] ?? ""} {f.text}
          </p>
        ))}
      </div>
    </div>
  );
}
