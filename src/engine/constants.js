/* Constantes do jogo — tudo o que é afinável vive aqui. */

/* ---------- Posições ---------- */
export const POSITIONS = ["Gk", "Ld", "Cd", "Rd", "Lm", "Cm", "Rm", "Lf", "Cf", "Rf"];
export const POS_LINE = {
  Gk: "GR", Ld: "DF", Cd: "DF", Rd: "DF",
  Lm: "MD", Cm: "MD", Rm: "MD", Lf: "AV", Cf: "AV", Rf: "AV",
};
export const LINE_LABEL = { GR: "Guarda-redes", DF: "Defesa", MD: "Médio", AV: "Avançado" };
export const POS_COLOR = { GR: "#f5b83d", DF: "#6aaeff", MD: "#5fe08c", AV: "#ff6b6f" };
export const lineOf = (pos) => POS_LINE[pos] ?? "MD";
export const POS_LABEL = { Gk: "GR", Ld: "DE", Cd: "DC", Rd: "DD", Lm: "ME", Cm: "MC", Rm: "MD", Lf: "EE", Cf: "PL", Rf: "ED" };

/* ---------- Atributos (1 a 99) ---------- */
export const SKILLS = ["finalizacao", "criacao", "velocidade", "fisico", "defesa", "reflexos"];
export const SKILL_LABEL = {
  finalizacao: "Finalização", criacao: "Criação", velocidade: "Velocidade",
  fisico: "Físico", defesa: "Defesa", reflexos: "Reflexos",
};
export const SKILL_CAP = 99;

/* Características: pequenos bónus que dão personalidade aos jogadores. */
export const TRAITS = {
  finalizador: { label: "Finalizador", desc: "Mais frio em frente à baliza.", lines: ["AV", "MD"], boost: { finalizacao: 1.1 } },
  criativo: { label: "Criativo", desc: "Vê passes que os outros não veem.", lines: ["MD", "AV"], boost: { criacao: 1.1 } },
  muralha: { label: "Muralha", desc: "Muito difícil de ultrapassar.", lines: ["DF", "MD"], boost: { defesa: 1.1 } },
  pulmao: { label: "Pulmão", desc: "Aguenta o ritmo até ao fim.", lines: ["DF", "MD", "AV"], boost: { fisico: 1.15 } },
  foguete: { label: "Foguete", desc: "Explosivo no contra-ataque.", lines: ["DF", "MD", "AV"], boost: { velocidade: 1.12 } },
  aereo: { label: "Jogo aéreo", desc: "Domina as bolas altas.", lines: ["DF", "AV"], boost: { fisico: 1.06, finalizacao: 1.03 } },
  lider: { label: "Líder", desc: "Levanta o moral da equipa.", lines: ["GR", "DF", "MD", "AV"], boost: {} },
  paredao: { label: "Paredão", desc: "Reflexos de outro mundo.", lines: ["GR"], boost: { reflexos: 1.1 } },
};

/* Tradução dos atributos para os valores que o motor de jogo usa (escala interna). */
export const engineProfile = (p) => {
  const a = { ...p.skills };
  for (const t of p.traits ?? []) for (const [k, m] of Object.entries(TRAITS[t]?.boost ?? {})) a[k] = (a[k] ?? 1) * m;
  const q = (k) => Math.max(1, (a[k] ?? 1) / 4);
  if (p.pos === "Gk") {
    const r = q("reflexos");
    return { desarme: r, marcacao: r, controlo: r * 1.05, resistencia: r * 1.05, precisao: r, passe: q("criacao"), drible: q("velocidade"), potencia: q("finalizacao") };
  }
  return { desarme: q("defesa"), marcacao: q("defesa"), drible: q("velocidade"), controlo: q("criacao"), passe: q("criacao"), resistencia: q("fisico"), potencia: q("finalizacao"), precisao: q("finalizacao") };
};
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

/* O que conta para a qualidade de cada setor (soma 1). */
export const RATING_WEIGHTS = {
  GR: { reflexos: 0.85, fisico: 0.1, criacao: 0.05, velocidade: 0, finalizacao: 0, defesa: 0 },
  DF: { defesa: 0.55, fisico: 0.25, velocidade: 0.1, criacao: 0.1, finalizacao: 0, reflexos: 0 },
  MD: { criacao: 0.5, defesa: 0.15, fisico: 0.15, velocidade: 0.1, finalizacao: 0.1, reflexos: 0 },
  AV: { finalizacao: 0.5, velocidade: 0.25, criacao: 0.15, fisico: 0.1, defesa: 0, reflexos: 0 },
};
const ratingFor = (p, pos) => {
  const w = RATING_WEIGHTS[lineOf(pos)];
  return SKILLS.reduce((s, k) => s + w[k] * (p.skills[k] ?? 0), 0);
};
export const overallBase = (p) => Math.round(ratingFor(p, p.pos));
export const overallAt = (p, pos) => Math.round(ratingFor(p, pos) * posPenalty(p.pos, pos));

/* Jogadores guardados no modelo antigo passam para o novo ao serem lidos. */
export const isLegacySkills = (s) => s && s.desarme != null;
export const convertLegacyPlayer = (p) => {
  if (!isLegacySkills(p.skills)) return p;
  const o = p.skills, scale = (v) => Math.round(Math.max(1, Math.min(99, v * 4)));
  const seed = [...String(p.id)].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const isGk = p.pos === "Gk";
  const skills = {
    finalizacao: scale((o.potencia + o.precisao) / 2), criacao: scale((o.passe + o.controlo) / 2), velocidade: scale(o.drible),
    fisico: scale(o.resistencia), defesa: scale((o.desarme + o.marcacao) / 2),
    reflexos: isGk ? scale((0.5 * (o.desarme + o.marcacao) + o.controlo + o.resistencia + 0.5 * o.precisao) / 3.6) : 8 + (seed % 10),
  };
  const out = { ...p, skills, focus: p.focus ?? null };
  const ovr = overallBase(out);
  const line = lineOf(p.pos);
  const pool = Object.entries(TRAITS).filter(([, t]) => t.lines.includes(line)).map(([k]) => k);
  out.traits = p.traits?.length ? p.traits : seed % 100 < 42 ? [pool[seed % pool.length]] : [];
  out.pot = Math.round(Math.min(97, Math.max(ovr, ovr + (p.age <= 22 ? 6 : p.age <= 26 ? 3 : 0) + (p.talent ?? p.pot ?? 3) * 1.6)));
  out.contract = p.contract ?? 2 + (seed % 3);
  return out;
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

/* ---------- Evolução: automática ao jogar, orientada pelo foco escolhido ---------- */
export const growthCost = (cur) => Math.round(24 + cur * 0.25);
export const potentialGrade = (pot) => (pot >= 85 ? "S" : pot >= 75 ? "A" : pot >= 65 ? "B" : pot >= 55 ? "C" : "D");

/* ---------- Reputação do clube (nível) ---------- */
export const XP_WIN = 12;
export const XP_DRAW = 5;
export const XP_LOSS = 2;
export const MAX_LEVEL = 30;
export const xpForNext = (level) => Math.round(400 * Math.pow(level, 1.8));

/* As taças agrupam clubes por escalão (cada 3 níveis). */
export const cupTierOf = (level) => Math.ceil(level / 3);

/* ---------- Tempo real (o jogo é online: não há "avançar dia") ---------- */
export const CUP_SIZE = 8;                       // 8 managers → Quartos, Meias, Final
export const CUP_EVERY_MS = 30 * 60 * 1000;      // abre uma taça nova a cada 30 minutos
export const CUP_ROUND_MS = 5 * 60 * 1000;       // cada ronda joga-se 5 minutos depois da anterior
export const CUP_UPCOMING = 3;                   // taças futuras visíveis para inscrição
export const cupEntryFee = (tier) => 40 + tier * 45;
export const cupPrize = (tier) => Math.round((500 + tier * 520) * (1 + tier * 0.12));
export const cupRunnerUp = (tier) => Math.round(cupPrize(tier) * 0.35);

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

/* Evolução ganha por jogo, antes dos multiplicadores de idade e margem. */
export const MATCH_XP_BASE = 5;
export const MATCH_XP_MULT = { liga: 1.2, taca: 1.4, amigavel: 0.5 };

/* ---------- Economia: valores, salários e contratos ---------- */
export const STARTING_MONEY = 2500;
export const REWARD_WIN_BASE = 120;
export const REWARD_DRAW_BASE = 45;
export const REWARD_LOSS_BASE = 15;
export const REWARD_WIN_PER_LEVEL = 25;
export const TRANSFER_TAX = 0.1;                    // comissão retirada ao vendedor entre managers
export const sponsorPerDay = (level) => 120 + level * 30; // receita fixa diária, jogues ou não
const POS_DEMAND = { GR: 0.85, DF: 0.95, MD: 1, AV: 1.2 };
export const playerValue = (p) => {
  const ovr = overallBase(p);
  const ageF = p.age <= 21 ? 1.35 : p.age <= 25 ? 1.2 : p.age <= 29 ? 1 : p.age <= 32 ? 0.7 : 0.45;
  const room = 1 + Math.max(0, (p.pot ?? ovr) - ovr) * 0.012;
  const expiring = (p.contract ?? 3) <= 1 ? 0.8 : 1;
  return Math.max(100, Math.round((2000 * Math.pow(1.09, ovr - 50) * ageF * room * POS_DEMAND[lineOf(p.pos)] * expiring) / 50) * 50);
};
export const wagePerDay = (p) => Math.max(4, Math.round(playerValue({ ...p, contract: 3 }) * 0.004));
export const renewCost = (p) => Math.round(playerValue({ ...p, contract: 3 }) * 0.08);
export const PAY_EVERY_MS = 24 * HOUR_MS;

/* ---------- Mercado entre managers ---------- */
export const RESALE_LOCK_MS = AGE_MS;               // um jogador comprado não pode ser revendido logo
export const salePriceRange = (p) => { const v = playerValue({ ...p, contract: 3 }); return [Math.ceil(v * 0.5), Math.floor(v * 2)]; };

/* ---------- Treino de Elite: pagar para passar o limite do jogador ---------- */
export const ELITE_COSTS = [0.2, 0.3, 0.4, 0.6, 0.8]; // fração do valor em cada nível
export const ELITE_MAX_AGE = 27;
export const ELITE_MIN_TRAINING = 8;
export const ELITE_DAYS = 5;
export const ELITE_SLOTS = 3;
export const POT_HARD_CAP = 99;
export const eliteCost = (p) => Math.round(playerValue({ ...p, contract: 3 }) * (ELITE_COSTS[p.elite ?? 0] ?? Infinity));
export const eliteBlock = (game, p) => {
  if ((p.elite ?? 0) >= ELITE_COSTS.length) return "Já fez todos os programas possíveis.";
  if (p.eliteUntil) return "Já está num programa.";
  if (p.selling) return "Retira-o do mercado primeiro.";
  if (p.age > ELITE_MAX_AGE) return `Só até aos ${ELITE_MAX_AGE} anos.`;
  if (p.pot >= POT_HARD_CAP) return "Já está no limite máximo.";
  if (overallBase(p) < p.pot) return "Tem de atingir primeiro o potencial atual.";
  if ((game.club.buildings.treino ?? 0) < ELITE_MIN_TRAINING) return `Precisas do Centro de Treino no nível ${ELITE_MIN_TRAINING}.`;
  if (game.players.filter((x) => x.eliteUntil).length >= ELITE_SLOTS) return `Só ${ELITE_SLOTS} jogadores em programa ao mesmo tempo.`;
  if (game.club.money < eliteCost(p)) return "Dinheiro insuficiente.";
  return null;
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
  treino: { label: "Centro de Treino", desc: "Os jogadores evoluem mais depressa a jogar.", max: 10 },
  medico: { label: "Dep. Médico", desc: "Menos lesões e recuperação mais rápida.", max: 10 },
  academia: { label: "Academia", desc: "Revela jovens promessas, melhores a nível alto.", max: 10 },
};
export const buildingCost = (lvl) => Math.round(500 * Math.pow(1.8, lvl - 1));
export const STADIUM_SEATS_PER_LEVEL = 100;
export const stadiumCapacity = (lvl) => lvl * STADIUM_SEATS_PER_LEVEL;
export const TICKET_PRICE = 1;
export const gateIncome = (stadiumLvl, fans) => Math.round(Math.min(stadiumCapacity(stadiumLvl), Math.max(0, fans)) * TICKET_PRICE);

/* ---------- Boosters ---------- */
export const BOOSTERS = {
  energia: { label: "Recuperação", desc: "Repõe a energia de todo o plantel.", price: 400, icon: "⚡" },
  moral: { label: "Palestra", desc: "+18 de moral imediata.", price: 300, icon: "🔥" },
  olheiro: { label: "Rede de olheiros", desc: "3 agentes livres novos agora.", price: 450, icon: "🔭" },
};

/* ---------- Mercado ---------- */
export const SQUAD_CAP = 26;
export const SQUAD_MIN = 13;
export const MARKET_UNLOCK_LEVEL = 3;
export const MARKET_DRIP_COUNT = 3;
export const MARKET_DRIP_MS = 24 * 60 * 60 * 1000; // um lote novo por dia
export const INBOX_CAP = 60;
export const HISTORY_CAP = 40;
