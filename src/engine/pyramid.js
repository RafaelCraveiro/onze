/* Pirâmide de divisões: regras puras, usadas pelo servidor e pelas simulações.
   Cada divisão tem o dobro dos grupos da anterior. Em cada grupo sobem 2 e descem 4,
   o que equilibra: cada grupo de cima recebe os 2 primeiros de 2 grupos de baixo. */

export const GROUP_SIZE = 12;
export const ROUNDS = (GROUP_SIZE - 1) * 2;   // uma jornada por dia
export const SEASON_DAYS = ROUNDS;
export const PROMOTED = 2;
export const RELEGATED = 4;
export const DOWN_RANK = GROUP_SIZE - RELEGATED + 1;
export const MIN_DIVISIONS = 8;
export const INACTIVE_DAYS = 30;
export const LATE_JOIN_ROUND = 11;

export const capacityOf = (d) => GROUP_SIZE * 2 ** (d - 1);

/* Número de divisões para n jogadores ativos: nunca menos de 8; cresce quando enche. */
export const divisionsFor = (n) => {
  let d = 1, total = capacityOf(1);
  while (total < n) { d++; total += capacityOf(d); }
  return Math.max(MIN_DIVISIONS, d);
};

/* Força dos bots: as divisões de cima são claramente mais exigentes. */
export const botLevelFor = (division) => 1 + (MIN_DIVISIONS - Math.min(division, MIN_DIVISIONS)) * 2;

export const seasonPrize = (division, rank) =>
  Math.round(1500 * Math.pow(1.5, MIN_DIVISIONS - Math.min(division, MIN_DIVISIONS)) * (GROUP_SIZE + 1 - rank) / GROUP_SIZE);

export const nextDivision = ({ division, rank, late = false, maxDivision }) => {
  if (rank <= PROMOTED && !late && division > 1) return division - 1;
  if (rank >= DOWN_RANK && division < maxDivision) return division + 1;
  return division;
};

/* users: [{ id, division, lastRank }] → [{ division, groups: [[id…]] }].
   Se uma divisão transbordar, os piores classificados passam para a de baixo.
   Os grupos recebem os jogadores por ordem, como cabeças de série. */
export const assignSeason = (users, maxDivision, rng = Math.random) => {
  const out = [];
  let carry = [];
  for (let d = 1; d <= maxDivision; d++) {
    const here = [...carry, ...users.filter((u) => u.division === d)]
      .map((u) => ({ u, r: rng() }))
      .sort((a, b) => (a.u.lastRank ?? 6.5) - (b.u.lastRank ?? 6.5) || a.r - b.r)
      .map((x) => x.u);
    const cap = capacityOf(d);
    carry = d < maxDivision ? here.slice(cap) : [];
    const list = d < maxDivision ? here.slice(0, cap) : here;
    if (!list.length) continue;
    const count = Math.ceil(list.length / GROUP_SIZE);
    const groups = Array.from({ length: count }, () => []);
    list.forEach((u, i) => groups[i % count].push(u.id));
    out.push({ division: d, groups });
  }
  return out;
};
