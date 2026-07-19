/* Constantes do jogo — tudo o que é afinável vive aqui. */

/* ---------- Posições (estilo 11x11) ---------- */
export const POSITIONS = ["Gk", "Ld", "Cd", "Rd", "Lm", "Cm", "Rm", "Lf", "Cf", "Rf"];
export const POS_LINE = {
  Gk: "GR", Ld: "DF", Cd: "DF", Rd: "DF",
  Lm: "MD", Cm: "MD", Rm: "MD", Lf: "AV", Cf: "AV", Rf: "AV",
};
export const LINE_LABEL = { GR: "Guarda-redes", DF: "Defesa", MD: "Médio", AV: "Avançado" };
export const POS_COLOR = { GR: "#d97706", DF: "#2563eb", MD: "#16a34a", AV: "#dc2626" };
export const lineOf = (pos) => POS_LINE[pos] ?? "MD";

/* ---------- Sub-habilidades (como no 11x11: o Skl é a SOMA das 8) ---------- */
export const SKILLS = ["desarme", "marcacao", "drible", "controlo", "resistencia", "passe", "potencia", "precisao"];
export const SKILL_LABEL = {
  desarme: "Desarme", marcacao: "Marcação", drible: "Drible", controlo: "Controlo de bola",
  resistencia: "Resistência", passe: "Passe", potencia: "Potência de remate", precisao: "Precisão de remate",
};

export const totalSkill = (p) => Math.floor(SKILLS.reduce((s, k) => s + (p.skills[k] ?? 0), 0));

// Contribuições para o motor de jogo (defesa reforçada para equilibrar o xG).
export const atkOf = (p) => p.skills.potencia + p.skills.precisao + p.skills.drible + 0.6 * p.skills.controlo + 0.4 * p.skills.passe;
export const defOf = (p) => 1.35 * (p.skills.desarme + p.skills.marcacao + 0.5 * p.skills.resistencia + 0.3 * p.skills.controlo);
export const gkOf = (p) => 0.5 * (p.skills.desarme + p.skills.marcacao) + p.skills.controlo + p.skills.resistencia + 0.5 * p.skills.precisao;

/* Penalização fora de posição: mesma posição 1.0; mesma linha 0.94; linha vizinha 0.8; longe 0.62. */
const LINE_ORDER = { GR: 0, DF: 1, MD: 2, AV: 3 };
export const posPenalty = (from, to) => {
  if (from === to) return 1;
  const lf = lineOf(from), lt = lineOf(to);
  if (lf === "GR" || lt === "GR") return 0.45;
  if (lf === lt) return 0.94;
  return Math.abs(LINE_ORDER[lf] - LINE_ORDER[lt]) === 1 ? 0.8 : 0.62;
};

// "Overall" de um jogador num slot (usado para escolher onze e para a força da equipa).
export const overallAt = (p, pos) => Math.round(totalSkill(p) * posPenalty(p.pos, pos));
export const overallBase = (p) => totalSkill(p);

/* ---------- Formações: slots [pos, avanço, largura] em coords normalizadas ---------- */
export const FORMATIONS = {
  "4-4-2": [
    ["Gk", 0.05, 0.5],
    ["Ld", 0.2, 0.16], ["Cd", 0.17, 0.38], ["Cd", 0.17, 0.62], ["Rd", 0.2, 0.84],
    ["Lm", 0.42, 0.15], ["Cm", 0.38, 0.4], ["Cm", 0.38, 0.6], ["Rm", 0.42, 0.85],
    ["Cf", 0.62, 0.38], ["Cf", 0.62, 0.62],
  ],
  "4-3-3": [
    ["Gk", 0.05, 0.5],
    ["Ld", 0.2, 0.16], ["Cd", 0.17, 0.38], ["Cd", 0.17, 0.62], ["Rd", 0.2, 0.84],
    ["Cm", 0.4, 0.28], ["Cm", 0.36, 0.5], ["Cm", 0.4, 0.72],
    ["Lf", 0.62, 0.15], ["Cf", 0.65, 0.5], ["Rf", 0.62, 0.85],
  ],
  "3-5-2": [
    ["Gk", 0.05, 0.5],
    ["Cd", 0.17, 0.28], ["Cd", 0.15, 0.5], ["Cd", 0.17, 0.72],
    ["Lm", 0.4, 0.1], ["Cm", 0.37, 0.32], ["Cm", 0.35, 0.5], ["Cm", 0.37, 0.68], ["Rm", 0.4, 0.9],
    ["Cf", 0.62, 0.4], ["Cf", 0.62, 0.6],
  ],
  "4-2-3-1": [
    ["Gk", 0.05, 0.5],
    ["Ld", 0.2, 0.16], ["Cd", 0.17, 0.38], ["Cd", 0.17, 0.62], ["Rd", 0.2, 0.84],
    ["Cm", 0.32, 0.38], ["Cm", 0.32, 0.62],
    ["Lm", 0.48, 0.2], ["Cm", 0.5, 0.5], ["Rm", 0.48, 0.8],
    ["Cf", 0.66, 0.5],
  ],
  "5-3-2": [
    ["Gk", 0.05, 0.5],
    ["Ld", 0.22, 0.1], ["Cd", 0.17, 0.3], ["Cd", 0.15, 0.5], ["Cd", 0.17, 0.7], ["Rd", 0.22, 0.9],
    ["Cm", 0.4, 0.3], ["Cm", 0.37, 0.5], ["Cm", 0.4, 0.7],
    ["Cf", 0.6, 0.4], ["Cf", 0.6, 0.6],
  ],
};

export const STYLES = {
  defensivo: { atk: 0.88, def: 1.12, label: "Defensivo" },
  equilibrado: { atk: 1, def: 1, label: "Equilibrado" },
  ofensivo: { atk: 1.12, def: 0.9, label: "Ofensivo" },
};

/* ---------- Talento e progressão ---------- */
// Talento 1–9: acelera o treino e define o teto de CADA sub-habilidade.
export const talentCap = (talent) => Math.round(12 + talent * 2.2); // t1=14 … t9=32 (Skl máx ≈ 8×teto)
export const talentGrowth = (talent) => 0.55 + talent * 0.16;

// Plantel inicial: fraco, com sorte MUITO rara de um 7 (~1%). Nunca 8/9.
export const INITIAL_TALENT_WEIGHTS = [
  [1, 20], [2, 26], [3, 26], [4, 17], [5, 8], [6, 2], [7, 1],
];

// Academia: talento 7 raro e 8 muito raro, ambos a crescer devagar com o nível
// do clube; 9 praticamente lendário (só surge a nível muito alto).
export const academyTalentWeights = (lvl) => [
  [2, 22], [3, 24], [4, 22], [5, 16 + Math.floor(lvl / 2)], [6, 8 + Math.floor(lvl / 3)],
  [7, Math.max(1, Math.floor(lvl / 6))],
  [8, Math.max(0, Math.floor((lvl - 8) / 4))],
  [9, Math.max(0, Math.floor((lvl - 18) / 6))],
];

/* ---------- Nível do clube ----------
   Nível 1→2: 100 XP. Nível 2→3: 300 XP (3×). Daí em diante duplica sempre
   (3→4: 600, 4→5: 1200, …). Uma curva de grind longa e deliberada. */
export const XP_WIN = 3;
export const XP_DRAW = 1;
export const MAX_LEVEL = 30;
export const xpForNext = (level) => (level <= 1 ? 100 : 300 * Math.pow(2, level - 2));

// As taças são por nível exato do clube (como no 11x11) — não há escalões nem liga.

/* ---------- Tempo real (o jogo é online: não há "avançar dia") ---------- */
export const CUP_SIZE = 8;                       // 8 managers → Quartos, Meias, Final
export const CUP_EVERY_MS = 10 * 60 * 1000;      // abre uma taça nova a cada 10 minutos
export const CUP_ROUND_MS = 5 * 60 * 1000;       // cada ronda joga-se 5 minutos depois da anterior
export const CUP_UPCOMING = 3;                   // taças futuras visíveis para inscrição
export const cupEntryFee = (level) => 400 + level * 200;
export const cupPrize = (level) => Math.round((1200 + level * 700) * (1 + level * 0.08));
export const cupRunnerUp = (level) => Math.round(cupPrize(level) * 0.35);

export const CUP_REG_WINDOW_MS = 4 * 60 * 1000;     // 4 minutos para registares a equipa em cada jogo
// (se todos os jogos da ronda estiverem feitos, a seguinte abre IMEDIATAMENTE — sem espera)
export const HOUR_MS = 60 * 60 * 1000;              // tick de manutenção (mercado, mundo)
export const YOUTH_EVERY_MS = 6 * HOUR_MS;          // academia gera um jovem de 6 em 6 horas
export const AGE_MS = 4 * 24 * HOUR_MS;             // os jogadores envelhecem +1 ano a cada 4 dias reais
export const FITNESS_REGEN_PER_MIN = 0.6;           // recupera de um jogo em ~40 min

/* Experiência de jogo: os jogadores evoluem ao JOGAR, consoante o talento.
   As taças dão experiência a dobrar (como o "Player's Experience: 200%" do 11x11). */
export const MATCH_XP_BASE = 0.5;                   // pontos de sub-habilidade por jogo (antes dos multiplicadores)
export const MATCH_XP_MULT = { taca: 2, amigavel: 0.6 };

/* ---------- Economia (sem salários: os jogadores têm apenas valor de venda) ---------- */
export const STARTING_MONEY = 40000;
export const REWARD_WIN_BASE = 1600;
export const REWARD_DRAW_BASE = 600;
export const REWARD_LOSS_BASE = 250;
export const FRIENDLY_REWARD_MULT = 0.5;
// Preço estilo 11x11 (skill 76, 35 anos, talento 3 → ~1.5k).
export const playerValue = (p) => {
  const ageF = p.age <= 21 ? 1.6 : p.age <= 25 ? 1.35 : p.age <= 29 ? 1.1 : p.age <= 32 ? 0.85 : 0.65;
  return Math.round((totalSkill(p) * 20 + p.talent * 150) * ageF);
};

/* ---------- Energia / moral ---------- */
export const FITNESS_MATCH_COST = 22;
export const fitnessFactor = (f) => 0.68 + 0.32 * Math.min(100, Math.max(0, f)) / 100;
export const moraleFactor = (m) => 0.92 + 0.16 * Math.min(100, Math.max(0, m)) / 100;

/* ---------- Infraestruturas ---------- */
export const BUILDINGS = {
  estadio: { label: "Estádio", desc: "Mais bilheteira nos jogos em casa.", max: 10 },
  treino: { label: "Centro de Treino", desc: "Acelera o treino diário dos jogadores.", max: 10 },
  medico: { label: "Dep. Médico", desc: "Menos lesões e recuperação mais rápida.", max: 10 },
  academia: { label: "Academia", desc: "Gera jovens promessas (melhor talento a nível alto).", max: 10 },
};
export const buildingCost = (lvl) => Math.round(6000 * Math.pow(1.75, lvl - 1));
export const stadiumIncome = (lvl, clubLevel) => Math.round((900 + lvl * 650) * (1 + clubLevel * 0.06));

/* ---------- Boosters ---------- */
export const BOOSTERS = {
  energia: { label: "Energético", desc: "Restaura a energia de todo o plantel.", price: 2500, icon: "⚡" },
  moral: { label: "Motivador", desc: "+18 de moral imediata.", price: 1800, icon: "🔥" },
  treino: { label: "Treino Intensivo", desc: "Experiência de jogo a dobrar durante 2 horas.", price: 2200, icon: "🎯" },
};
export const TRAIN_BOOST_MS = 2 * HOUR_MS;

/* ---------- Mundo / mercado ----------
   O mercado só ABRE (compra/venda) a partir do nível 3, mas a "torneira" de
   3 agentes livres por dia já corre desde a criação da conta — quando lá
   chegares, encontras um mercado com progresso acumulado. */
export const SQUAD_CAP = 26;
export const SQUAD_MIN = 13;
export const MARKET_UNLOCK_LEVEL = 3;
export const MARKET_DRIP_COUNT = 3;
export const MARKET_DRIP_MS = 24 * 60 * 60 * 1000; // um lote novo por dia
export const WORLD_BOTS = 140;
export const INBOX_CAP = 60;
export const HISTORY_CAP = 40;
