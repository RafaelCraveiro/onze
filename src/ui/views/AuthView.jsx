/* Entrada no jogo online: login ou registo (email único + password + clube único).
   O nome do jogador É o nome do clube. */

import { useState } from "react";
import Emblem from "../components/Emblem.jsx";
import { Btn } from "../components/bits.jsx";
import { EMBLEM_SHAPES, EMBLEM_PATTERNS, EMBLEM_SYMBOLS, EMBLEM_COLORS, randomEmblem } from "../../engine/generation.js";

const SHAPE_LABEL = { escudo: "Escudo", redondo: "Arredondado", circulo: "Círculo", losango: "Losango" };
const PATTERN_LABEL = { liso: "Liso", riscas: "Riscas", metades: "Metades", faixa: "Faixa", cruz: "Cruz" };

export default function AuthView({ auth, actions }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clubName, setClubName] = useState("");
  const [step, setStep] = useState(0); // registo: 0 = dados, 1 = emblema
  const [emblem, setEmblem] = useState(() => randomEmblem(Math.random));
  const set = (k, v) => setEmblem((e) => ({ ...e, [k]: v }));

  const canRegisterData = /\S+@\S+\.\S+/.test(email) && password.length >= 6 && clubName.trim().length >= 3;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight">
          <span className="text-[#5da814]">On</span><span className="text-[#3a4030]">ze</span> ⚽
        </h1>
        <p className="text-sm text-[#8a9077]">manager de futebol online — uma conta, um clube único</p>
      </div>

      <div className="w-full rounded-xl border border-[#d9dcc8] bg-white p-6 shadow">
        {/* separadores login / registo */}
        <div className="mb-4 flex gap-1.5">
          {[["login", "Entrar"], ["register", "Criar conta"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setMode(k); setStep(0); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-bold ${mode === k ? "btn-green" : "border border-[#c9cdb6] bg-white text-[#3a4030] hover:bg-[#f4f5ec]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {auth.error && (
          <p className="mb-3 rounded-md border border-[#e8b4ae] bg-[#fdeeec] px-3 py-2 text-sm font-semibold text-[#c0392b]">
            {auth.error}
          </p>
        )}

        {mode === "login" && (
          <div className="flex flex-col gap-3">
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="o-teu@email.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••" />
            <Btn disabled={auth.busy || !email || !password} onClick={() => actions.login({ email, password })}>
              {auth.busy ? "A entrar…" : "Entrar →"}
            </Btn>
          </div>
        )}

        {mode === "register" && step === 0 && (
          <div className="flex flex-col gap-3">
            <Field label="Email (único — é o teu login)" type="email" value={email} onChange={setEmail} placeholder="o-teu@email.com" />
            <Field label="Password (mín. 6 caracteres)" type="password" value={password} onChange={setPassword} placeholder="••••••" />
            <Field label="Nome do clube (único — é também o teu nome de jogador)" value={clubName} onChange={setClubName} placeholder="ex.: Estrela do Norte" maxLength={26} />
            <Btn disabled={!canRegisterData} onClick={() => setStep(1)}>Escolher emblema →</Btn>
          </div>
        )}

        {mode === "register" && step === 1 && (
          <div className="onze-pop flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#4f7a12]">O emblema do {clubName.trim()}</p>
              <Btn kind="dark" onClick={() => setEmblem(randomEmblem(Math.random))}>🎲</Btn>
            </div>
            <div className="flex justify-center"><Emblem emblem={emblem} size={110} /></div>
            <Row label="Forma">
              {EMBLEM_SHAPES.map((s) => <Chip key={s} active={emblem.shape === s} onClick={() => set("shape", s)}>{SHAPE_LABEL[s]}</Chip>)}
            </Row>
            <Row label="Padrão">
              {EMBLEM_PATTERNS.map((s) => <Chip key={s} active={emblem.pattern === s} onClick={() => set("pattern", s)}>{PATTERN_LABEL[s]}</Chip>)}
            </Row>
            <Row label="Símbolo">
              {EMBLEM_SYMBOLS.map((s) => <Chip key={s} active={emblem.symbol === s} onClick={() => set("symbol", s)}>{s}</Chip>)}
            </Row>
            <Row label="Cores">
              {EMBLEM_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => set(emblem.c1 === c ? "c2" : "c1", c)}
                  title="clique: cor principal · se já for principal: secundária"
                  className={`h-6 w-6 rounded-full border-2 ${emblem.c1 === c ? "scale-110 border-[#3a4030]" : emblem.c2 === c ? "border-[#c98d09]" : "border-[#d9dcc8]"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </Row>
            <div className="flex justify-between">
              <Btn kind="dark" onClick={() => setStep(0)}>← Voltar</Btn>
              <Btn disabled={auth.busy} onClick={() => actions.register({ email: email.trim(), password, clubName: clubName.trim(), emblem })}>
                {auth.busy ? "A criar conta…" : `Fundar o ${clubName.trim()} ⚽`}
              </Btn>
            </div>
          </div>
        )}
      </div>

      <p className="max-w-sm text-center text-[11px] text-[#9aa08e]">
        Conta online com save na base de dados do servidor — podes entrar de qualquer browser.
        Cada email e cada nome de clube são únicos.
      </p>
    </div>
  );
}

const Field = ({ label, value, onChange, type = "text", placeholder, maxLength }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-[#8a9077]">{label}</span>
    <input
      type={type}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-md border border-[#c9cdb6] bg-white px-3 py-2 outline-none focus:border-[#5da814]"
    />
  </label>
);

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-[#8a9077]">{label}</span>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-md px-2.5 py-1 text-sm font-semibold transition ${active ? "btn-green" : "border border-[#c9cdb6] bg-white text-[#3a4030] hover:bg-[#f4f5ec]"}`}
  >
    {children}
  </button>
);
