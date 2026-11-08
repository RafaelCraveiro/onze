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

/* Pesos por linha — usados TANTO para gerar jogadores (generation.js) COMO
   para os avaliar (overallAt abaixo). Um avançado com 25/25 em potência e
   precisão vale tanto como outro com os mesmos dois atributos, mesmo que os
   restantes estejam mal distribuídos — o que conta é o que interessa à
   posição, não a soma total de tudo. */
export const RATING_WEIGHTS = {
  GR: { desarme: 1.1, marcacao: 1.2, controlo: 1.3, resistencia: 1.2, passe: 0.9, drible: 0.6, potencia: 0.6, precisao: 0.7 },
  DF: { desarme: 1.5, marcacao: 1.5, resistencia: 1.2, controlo: 0.9, passe: 0.9, drible: 0.7, potencia: 0.7, precisao: 0.6 },
  MD: { passe: 1.4, controlo: 1.3, drible: 1.1, resistencia: 1.1, desarme: 0.9, marcacao: 0.8, potencia: 0.8, precisao: 0.8 },
  AV: { potencia: 1.5, precisao: 1.5, drible: 1.2, controlo: 1.1, passe: 0.8, resistencia: 0.9, desarme: 0.5, marcacao: 0.5 },
};

// Overall MOSTRADO = a SOMA dos 8 atributos (estilo 11x11, máx. 8×25=200).
// A avaliação num slot mantém os pesos por posição (atributos relevantes
// contam mais), mas reprojetada nessa mesma escala de soma, para que um
// avançado com remate alto valha mais NUM slot de avançado — sem mudar a
// escala que o jogador vê.
export const overallBase = (p) => totalSkill(p);
export const overallAt = (p, pos) => {
  const w = RATING_WEIGHTS[lineOf(pos)];
  let sw = 0, sv = 0;
  for (const k of SKILLS) { sw += w[k]; sv += w[k] * (p.skills[k] ?? 0); }
  return Math.round((sv / sw) * SKILLS.length * posPenalty(p.pos, pos));
};

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
  /* ctrl: domínio da bola · volume: ocasiões criadas · expose: ocasiões que concede ·
     counter/open: frequência de contra-ataques feitos/permitidos · direct: jogo vertical ·
     tempo: tempo de posse · quality: qualidade dos remates · pressPow: força da pressão ·
     fade: desgaste físico · fouls: faltas */
  equilibrado: { label: "Equilibrado", desc: "Sem pontos fracos nem grandes vantagens.", ctrl: 1, volume: 1, expose: 1, counter: 0.05, open: 1, direct: 0.15, tempo: 1, quality: 1, pressPow: 0, fade: 1, fouls: 1 },
  ofensivo: { label: "Ofensivo", desc: "Cria muito, mas deixa espaço nas costas. Sofre com o contra-ataque.", ctrl: 1.02, volume: 1.2, expose: 1.14, counter: 0.03, open: 1.45, direct: 0.2, tempo: 1, quality: 1, pressPow: 0, fade: 1.2, fouls: 1 },
  defensivo: { label: "Bloco baixo", desc: "Fecha os espaços e tira velocidade ao adversário. Cria pouco.", ctrl: 0.95, volume: 0.78, expose: 0.8, counter: 0.08, open: 0.35, direct: 0.3, tempo: 0.85, quality: 1, pressPow: 0, fade: 0.8, fouls: 1.1 },
  posse: { label: "Posse", desc: "Precisa de bons médios. Fura blocos baixos, mas a pressão incomoda.", ctrl: 1.05, volume: 0.92, expose: 0.92, counter: 0.02, open: 1, direct: 0.05, tempo: 1.25, quality: 1.12, pressPow: 0, fade: 1, fouls: 0.9 },
  pressao: { label: "Pressão alta", desc: "Precisa de físico. Sufoca a posse, mas cansa e dá espaço atrás.", ctrl: 1, volume: 1.06, expose: 1.05, counter: 0.09, open: 1.2, direct: 0.25, tempo: 0.95, quality: 1, pressPow: 0.35, fade: 1.6, fouls: 1.35 },
  contra: { label: "Contra-ataque", desc: "Deixa a bola ao adversário e castiga quem sobe. Sofre contra blocos baixos.", ctrl: 0.92, volume: 0.86, expose: 0.92, counter: 0.17, open: 0.8, direct: 0.5, tempo: 0.8, quality: 1.05, pressPow: 0, fade: 1, fouls: 1 },
};

/* Duelos de estilos: multiplica as ocasiões criadas por [estilo][adversário]. */
export const MATCHUP = {
  ofensivo: { defensivo: 1.02, posse: 1.04, pressao: 1.06 },
  defensivo: { ofensivo: 1.08, contra: 0.98, posse: 0.88 },
  posse: { defensivo: 1.14, contra: 1.06, pressao: 0.88, ofensivo: 0.96 },
  pressao: { posse: 1.14, equilibrado: 1.03, defensivo: 0.9, contra: 0.92 },
  contra: { ofensivo: 1.04, pressao: 1.02, defensivo: 0.84, posse: 0.96 },
  equilibrado: {},
};

/* ---------- Talento e progressão ----------
   O talento já não define o teto — define só a VELOCIDADE a que o jogador
   ganha XP a jogar (quanto mais talento, mais XP por jogo). O teto é, para
   já, plano para todos: 25 por atributo (depois afinamos isto melhor). */
export const SKILL_CAP = 25;
export const talentCap = (_talent) => SKILL_CAP;
export const talentGrowth = (talent) => 0.55 + talent * 0.16;

// Custo em XP para subir UM ponto num atributo que está no valor `cur`
// (quanto mais alto já está, mais caro fica o próximo ponto).
export const trainCost = (cur) => Math.floor(cur) + 1;

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
export const cupEntryFee = (level) => 25 + level * 15;
export const cupPrize = (level) => Math.round((300 + level * 180) * (1 + level * 0.05));
export const cupRunnerUp = (level) => Math.round(cupPrize(level) * 0.35);

export const CUP_REG_WINDOW_MS = 4 * 60 * 1000;     // 4 minutos para registares a equipa em cada jogo
// (se todos os jogos da ronda estiverem feitos, a seguinte abre IMEDIATAMENTE — sem espera)
export const HOUR_MS = 60 * 60 * 1000;              // tick de manutenção (mercado, mundo)
export const YOUTH_EVERY_MS = 6 * HOUR_MS;          // academia gera um jovem de 6 em 6 horas
// Calendário ÚNICO do servidor: todos os jogadores fazem +1 ano nas mesmas datas, entrem ou não no jogo.
export const AGE_MS = 15 * 24 * HOUR_MS;            // +1 ano a cada 15 dias reais (muda aqui o ritmo)
export const AGE_EPOCH = Date.UTC(2026, 0, 1);      // origem do calendário; as datas são EPOCH + n × AGE_MS
export const isAgeBoundary = (t) => (t - AGE_EPOCH) % AGE_MS === 0;
export const lastAgeBoundary = (now) => AGE_EPOCH + Math.floor((now - AGE_EPOCH) / AGE_MS) * AGE_MS;
export const nextAgeBoundary = (now) => lastAgeBoundary(now) + AGE_MS;
export const FITNESS_REGEN_PER_MIN = 0.6;           // recupera de um jogo em ~40 min

/* Experiência de jogo: os jogadores GANHAM XP ao jogar, consoante o talento
   (mais talento = mais XP por jogo), e o TREINADOR distribui esse XP pelos
   atributos que quiser (ver trainCost acima). Taças dão XP a dobrar (como o
   "Player's Experience: 200%" do 11x11). */
export const MATCH_XP_BASE = 6;                     // XP base por jogo (antes dos multiplicadores)
export const MATCH_XP_MULT = { taca: 2, amigavel: 0.6 };

/* ---------- Economia (DIFÍCIL: o dinheiro é o bem mais essencial) ----------
   Sem salários, mas os prémios são magros e a bilheteira vale 1€ por adepto
   PRESENTE (limitado pela capacidade do estádio, que começa em 0 lugares). */
export const STARTING_MONEY = 2500;
export const REWARD_WIN_BASE = 120;
export const REWARD_DRAW_BASE = 45;
export const REWARD_LOSS_BASE = 15;
export const REWARD_WIN_PER_LEVEL = 25;
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

/* ---------- Infraestruturas ----------
   O estádio COMEÇA no nível 0 (0 lugares). Cada nível dá +100 lugares e a
   bilheteira é 1€ por adepto presente: min(lugares, adeptos) por jogo em casa. */
export const BUILDINGS = {
  estadio: { label: "Estádio", desc: "+100 lugares por nível — 1€ por adepto presente nos jogos em casa.", max: 10 },
  treino: { label: "Centro de Treino", desc: "Acelera o treino diário dos jogadores.", max: 10 },
  medico: { label: "Dep. Médico", desc: "Menos lesões e recuperação mais rápida.", max: 10 },
  academia: { label: "Academia", desc: "Gera jovens promessas (melhor talento a nível alto).", max: 10 },
};
export const buildingCost = (lvl) => Math.round(500 * Math.pow(1.8, lvl - 1));
export const STADIUM_SEATS_PER_LEVEL = 100;
export const stadiumCapacity = (lvl) => lvl * STADIUM_SEATS_PER_LEVEL;
export const TICKET_PRICE = 1;
export const gateIncome = (stadiumLvl, fans) => Math.round(Math.min(stadiumCapacity(stadiumLvl), Math.max(0, fans)) * TICKET_PRICE);

/* ---------- Boosters ---------- */
export const BOOSTERS = {
  energia: { label: "Energético", desc: "Restaura a energia de todo o plantel.", price: 400, icon: "⚡" },
  moral: { label: "Motivador", desc: "+18 de moral imediata.", price: 300, icon: "🔥" },
  treino: { label: "Treino Intensivo", desc: "Experiência de jogo a dobrar durante 2 horas.", price: 350, icon: "🎯" },
};
export const TRAIN_BOOST_MS = 2 * HOUR_MS;

/* ---------- Mundo / mercado ----------
   AGENTES LIVRES desde o nível 1: cada treinador tem a sua própria torneira
   de 3 jogadores aleatórios por dia, compráveis logo (não pertencem a
   treinadores reais). VENDER no mercado só a partir do nível 3. */
export const SQUAD_CAP = 26;
export const SQUAD_MIN = 13;
export const MARKET_UNLOCK_LEVEL = 3;
export const MARKET_DRIP_COUNT = 3;
export const MARKET_DRIP_MS = 24 * 60 * 60 * 1000; // um lote novo por dia
export const INBOX_CAP = 60;
export const HISTORY_CAP = 40;
