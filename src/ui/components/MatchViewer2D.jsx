/* Viewer 2D — RENDERIZADOR sobre o motor de coreografia (pitchSim.js).
   O motor produz movimento contínuo dos 22 agentes + bola (steering, passes,
   pressing, lances com script); aqui só lemos `sim.state` e pintamos: campo,
   câmara broadcast a seguir a bola, jogadores, bola, banners e confettis.
   A simulação estatística (live.result) continua a ser a única fonte de verdade. */

import { useEffect, useRef, useState } from "react";
import Emblem from "./Emblem.jsx";
import { colorsClash } from "../helpers.js";
import { createPitchSim } from "./pitchSim.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const FEED_ICON = { goal: "⚽", chance: "🥅", yellow: "🟨", red: "🟥", injury: "🚑", info: "▪️" };

/* Sons sintetizados (Web Audio) — zero ficheiros externos. Toque na bola, remate,
   golo, defesa e apito. Devolve null se o browser não tiver Web Audio. */
const makeAudio = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  const tone = (f0, f1, dur, g, type = "sine", delay = 0) => {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const gg = ac.createGain();
    gg.gain.setValueAtTime(0.0001, t0);
    gg.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
    gg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gg).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noise = (dur, g, delay = 0) => {
    const t0 = ac.currentTime + delay;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const gg = ac.createGain(); gg.gain.value = g;
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1100;
    src.connect(hp).connect(gg).connect(master); src.start(t0);
  };
  return {
    ctx: ac,
    kick() { tone(190, 90, 0.09, 0.3, "sine"); noise(0.03, 0.1); },
    shot() { tone(240, 80, 0.13, 0.5, "sine"); noise(0.05, 0.18); },
    goal() { tone(523, 523, 0.15, 0.36, "triangle"); tone(659, 659, 0.15, 0.36, "triangle", 0.12); tone(784, 784, 0.34, 0.42, "triangle", 0.24); noise(0.5, 0.06, 0.02); },
    save() { tone(300, 150, 0.1, 0.28, "sine"); noise(0.03, 0.1); },
    whistle() { tone(1950, 2080, 0.18, 0.22, "square"); tone(1950, 1780, 0.12, 0.18, "square", 0.17); },
  };
};

export default function MatchViewer2D({ live, club, onFinish }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState([0, 0]);
  const [minute, setMinute] = useState(0);
  const [feed, setFeed] = useState([]);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);

  const { result, opp, isHome } = live;
  const R = useRef(null);
  if (!R.current) {
    R.current = {
      sim: createPitchSim(result),
      cam: { x: 0.5, y: 0.5, z: 1.08 }, trail: [], particles: [], lastGoal: 0,
      lastNow: 0, playing: true, speed: 1, muted: false, done: false, finished: false,
      audio: null, lastKick: 0,
    };
  }
  const S = R.current;

  const homeInfo = isHome ? { name: club.name, emblem: club.emblem } : { name: opp.team, emblem: opp.emblem };
  const awayInfo = isHome ? { name: opp.team, emblem: opp.emblem } : { name: club.name, emblem: club.emblem };
  let kitH = homeInfo.emblem?.c1 ?? "#2563eb";
  let kitA = awayInfo.emblem?.c1 ?? "#dc2626";
  if (colorsClash(kitH, kitA)) kitA = colorsClash("#f8fafc", kitH) ? "#0f172a" : "#f8fafc";

  useEffect(() => {
    S.playing = playing; S.speed = speed; S.muted = muted;
    if (!muted) S.audio?.ctx.resume?.().catch(() => {});
  }, [playing, speed, muted, S]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 720, Hh = 460;
    canvas.width = W * dpr; canvas.height = Hh * dpr;
    ctx.scale(dpr, dpr);

    const px = (x) => 20 + x * (W - 40);
    const py = (y) => 16 + y * (Hh - 60);
    const PW = px(1) - px(0), PHt = py(1) - py(0);
    const sim = S.sim, st = sim.state;

    // áudio (entrámos no jogo por um clique → o AudioContext pode arrancar)
    if (!S.audio) { try { S.audio = makeAudio(); } catch { S.audio = null; } }
    S.audio?.ctx.resume?.().catch(() => {});
    const playSfx = (now) => {
      if (!st.sfx.length) return;
      for (const k of st.sfx) {
        if (S.muted || !S.audio) continue;
        if (k === "kick") { if (now - S.lastKick < 55) continue; S.lastKick = now; }
        S.audio[k]?.();
      }
      st.sfx.length = 0;
    };

    const applyCam = () => {
      const z = S.cam.z;
      const halfW = (W / 2) / z, halfH = (Hh / 2) / z;
      const fx = px(S.cam.x), fy = py(S.cam.y);
      const minX = px(0) + halfW - 40, maxX = px(1) - halfW + 40;
      const minY = py(0) + halfH - 30, maxY = py(1) - halfH + 30;
      const cx = minX <= maxX ? clamp(fx, minX, maxX) : W / 2;
      const cy = minY <= maxY ? clamp(fy, minY, maxY) : Hh / 2;
      ctx.translate(W / 2, Hh / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
    };

    const drawPitch = () => {
      const g = ctx.createLinearGradient(0, 0, 0, Hh);
      g.addColorStop(0, "#1e8043"); g.addColorStop(1, "#15612f");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
        ctx.fillRect(px(0) + (i * PW) / 12, py(0), PW / 12, PHt);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2;
      ctx.strokeRect(px(0), py(0), PW, PHt);
      ctx.beginPath(); ctx.moveTo(px(0.5), py(0)); ctx.lineTo(px(0.5), py(1)); ctx.stroke();
      ctx.beginPath(); ctx.arc(px(0.5), py(0.5), 44, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(px(0.5), py(0.5), 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
      for (const cx of [px(0), px(1)]) for (const cy of [py(0), py(1)]) { ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke(); }
      for (const side of [0, 1]) {
        const gx = side === 0 ? px(0) : px(1);
        const dir = side === 0 ? 1 : -1;
        ctx.strokeRect(Math.min(gx, gx + dir * 82), py(0.22), 82, py(0.78) - py(0.22));
        ctx.strokeRect(Math.min(gx, gx + dir * 32), py(0.38), 32, py(0.62) - py(0.38));
        const spotX = gx + dir * 56;
        ctx.beginPath(); ctx.arc(spotX, py(0.5), 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fill();
        ctx.beginPath(); ctx.arc(spotX, py(0.5), 30, side === 0 ? -0.9 : Math.PI - 0.9, side === 0 ? 0.9 : Math.PI + 0.9); ctx.stroke();
        const goalTop = py(0.43), goalBot = py(0.57), netD = dir * 9;
        ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(Math.min(gx, gx + netD), goalTop, 9, goalBot - goalTop);
        ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 0.6;
        for (let n = 0; n <= 4; n++) { const yy = goalTop + ((goalBot - goalTop) * n) / 4; ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + netD, yy); ctx.stroke(); }
        for (let n = 0; n <= 3; n++) { const xx = gx + (netD * n) / 3; ctx.beginPath(); ctx.moveTo(xx, goalTop); ctx.lineTo(xx, goalBot); ctx.stroke(); }
        ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(gx, goalTop); ctx.lineTo(gx, goalBot); ctx.stroke(); ctx.lineWidth = 2;
      }
    };

    const drawDot = (a, color) => {
      const X = px(a.pos[0]), Y = py(a.pos[1]);
      const spd = Math.hypot(a.vel[0], a.vel[1]);
      const ang = spd > 0.004 ? Math.atan2(a.vel[1], a.vel[0]) : 0;
      const isCarrier = st.ball.carrier && st.ball.carrier.side === a._side && st.ball.carrier.idx === a._i;
      ctx.save();
      ctx.translate(X, Y);
      if (a.down || a.dive) ctx.rotate(Math.PI / 2); // caído / guarda-redes em voo
      ctx.beginPath(); ctx.ellipse(0, 7, 6, 2.4, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fill();
      if (isCarrier) { ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, Math.PI * 2); ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5; ctx.stroke(); }
      const stretch = clamp(spd * 3.5, 0, 0.5);
      ctx.save(); ctx.rotate(ang);
      ctx.beginPath(); ctx.ellipse(0, 0, 8.5 * (1 + stretch * 0.5), 8.5 * (1 - stretch * 0.35), 0, 0, Math.PI * 2);
      ctx.fillStyle = a.gk ? "#f59e0b" : color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = a.gk || color === "#f8fafc" ? "#0f172a" : "#fff";
      ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(a.num), 0, 0.5);
      ctx.restore();
    };

    const draw = () => {
      const b = st.ball;
      const goalMoment = st.banner?.kind === "goal";
      const zTarget = goalMoment ? 1.26 : st.banner?.kind === "save" || st.banner?.kind === "miss" ? 1.18 : st.done ? 1.0 : 1.1;
      const cr = clamp(S.dt * 2.4, 0.01, 0.16);
      S.cam.x += (lerp(0.5, b.pos[0], 0.74) - S.cam.x) * cr;
      S.cam.y += (lerp(0.5, b.pos[1], 0.66) - S.cam.y) * cr;
      S.cam.z += (zTarget - S.cam.z) * clamp(S.dt * 1.8, 0.01, 0.12);

      ctx.fillStyle = "#0a1a10"; ctx.fillRect(0, 0, W, Hh);
      ctx.save(); applyCam(); drawPitch();

      // rasto da bola
      S.trail.push([b.pos[0], b.pos[1]]); if (S.trail.length > 8) S.trail.shift();
      for (let i = 1; i < S.trail.length; i++) {
        const [x0, y0] = S.trail[i - 1], [x1, y1] = S.trail[i];
        if (Math.hypot(x1 - x0, y1 - y0) < 0.004) continue;
        ctx.beginPath(); ctx.moveTo(px(x0), py(y0)); ctx.lineTo(px(x1), py(y1));
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + (i / S.trail.length) * 0.3})`;
        ctx.lineWidth = 2 + (i / S.trail.length) * 1.5; ctx.stroke();
      }

      st.A.forEach((a, i) => { if (a.off) return; a._side = "A"; a._i = i; drawDot(a, kitA); });
      st.H.forEach((a, i) => { if (a.off) return; a._side = "H"; a._i = i; drawDot(a, kitH); });

      // árbitro
      const rx = clamp(b.pos[0] - 0.07, 0.02, 0.98), ry = clamp(b.pos[1] + 0.11, 0.05, 0.95);
      ctx.save(); ctx.translate(px(rx), py(ry));
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fillStyle = "#1e293b"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.stroke(); ctx.restore();

      // bola
      if (!st.done || goalMoment) {
        const BX = px(b.pos[0]), BY = py(b.pos[1]);
        ctx.beginPath(); ctx.ellipse(BX, BY + 5, 4.5 + b.z * 40, 2 + b.z * 12, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fill();
        ctx.beginPath(); ctx.arc(BX, BY - b.z * 220, 4.6, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
        ctx.strokeStyle = "#334155"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore(); // câmara

      // confettis (ecrã)
      for (const pt of S.particles) {
        ctx.save(); ctx.translate(pt.x * W, pt.y * Hh); ctx.rotate(pt.rot);
        ctx.fillStyle = pt.color; ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
      }
      if (st.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${st.flash * 0.45})`; ctx.fillRect(0, 0, W, Hh); }

      const vg = ctx.createRadialGradient(W / 2, Hh / 2, Hh * 0.3, W / 2, Hh / 2, Hh * 0.82);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, Hh);

      // banners
      const bn = st.banner;
      if (bn && !st.done) {
        if (bn.kind === "goal") {
          ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.fillRect(0, Hh / 2 - 46, W, 92);
          ctx.fillStyle = "#facc15"; ctx.font = "900 48px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("GOOOLO!", W / 2, Hh / 2 + 15);
        } else if (bn.kind === "save" || bn.kind === "miss") {
          ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(bn.text, W / 2, 40);
        } else if (bn.kind === "red" || bn.kind === "yellow") {
          ctx.save(); ctx.translate(W / 2, 44); ctx.rotate(-0.1);
          ctx.fillStyle = bn.kind === "red" ? "#dc2626" : "#facc15"; ctx.fillRect(-9, -14, 18, 28);
          ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.strokeRect(-9, -14, 18, 28); ctx.restore();
        }
      }
      if (st.done) {
        ctx.fillStyle = "rgba(2,6,23,0.62)"; ctx.fillRect(0, 0, W, Hh);
        ctx.fillStyle = "#f8fafc"; ctx.font = "900 36px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`${result.score[0]} - ${result.score[1]}`, W / 2, Hh / 2 - 8);
        ctx.font = "600 16px sans-serif"; ctx.fillStyle = "#94a3b8";
        ctx.fillText(result.penalties ? `Final · penáltis ${result.penalties[0]}-${result.penalties[1]}` : "Final do jogo", W / 2, Hh / 2 + 22);
      }
    };

    let raf;
    const stepLoop = (now) => {
      const dt = S.lastNow ? Math.min(0.1, (now - S.lastNow) / 1000) : 0;
      S.lastNow = now; S.dt = dt;

      if (!st.done && S.playing) {
        const nf = sim.step(dt * S.speed);
        playSfx(now);
        if (nf.length) setFeed((f) => [...nf.map((x) => ({ min: x.min, text: x.text, type: x.type })).reverse(), ...f]);
        setScore([...st.score]);
        setMinute(Math.round(st.minute));
        if (st.goalCount > S.lastGoal) {
          S.lastGoal = st.goalCount;
          const color = kitH; // cor genérica de festa
          for (let i = 0; i < 90; i++) S.particles.push({ x: Math.random(), y: -0.05 - Math.random() * 0.4, vy: 0.18 + Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.12, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8, color: Math.random() < 0.5 ? color : (Math.random() < 0.5 ? "#facc15" : "#f8fafc"), life: 3 });
        }
        if (st.done && !S.finished) { S.finished = true; setDone(true); setScore([...result.score]); setMinute(90); }
      }
      for (const p of S.particles) { p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt; p.life -= dt; }
      S.particles = S.particles.filter((p) => p.life > 0 && p.y < 1.15);

      draw();
      raf = requestAnimationFrame(stepLoop);
    };
    raf = requestAnimationFrame(stepLoop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    const nf = S.sim.skip() ?? [];
    if (nf.length) setFeed((f) => [...nf.map((x) => ({ min: x.min, text: x.text, type: x.type })).reverse(), ...f]);
    setScore([...result.score]); setMinute(90); setDone(true); S.finished = true;
  };

  return (
    <div className="flex flex-col gap-2">
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

      <div className="flex items-center gap-2">
        {!done && (
          <>
            <button onClick={() => setPlaying((p) => !p)} className="rounded-md border border-[#c9cdb6] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#f4f5ec]">
              {playing ? "⏸" : "▶"}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`rounded-md px-3 py-1.5 text-sm font-bold ${speed === s ? "btn-green" : "border border-[#c9cdb6] bg-white hover:bg-[#f4f5ec]"}`}>
                {s}x
              </button>
            ))}
            <button onClick={() => setMuted((m) => !m)} title={muted ? "Ligar som" : "Desligar som"} className="ml-auto rounded-md border border-[#c9cdb6] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#f4f5ec]">
              {muted ? "🔇" : "🔊"}
            </button>
            <button onClick={skip} className="rounded-md border border-[#c9cdb6] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#f4f5ec]">
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
