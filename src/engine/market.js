/* Mercado de transferências — listagens de managers simulados + vendas do utilizador.
   O mercado só abre (compra/venda) a partir do nível MARKET_UNLOCK_LEVEL, mas a
   torneira de agentes livres já corre desde a criação da conta: MARKET_DRIP_COUNT
   jogadores novos por MARKET_DRIP_MS (~3/dia), para haver progresso acumulado
   quando o jogador finalmente desbloqueia. As listagens expiram ao relógio. */

import {
  playerValue, SQUAD_CAP, SQUAD_MIN, HOUR_MS, MARKET_DRIP_COUNT, MARKET_DRIP_MS,
} from "./constants.js";
import { genMarketPlayer } from "./generation.js";
import { managerName } from "./names.js";

export const refreshMarket = (market, rng, clubLevel, now = Date.now()) => {
  let listings = market.listings.filter((l) => (l.expiresAt ?? 0) > now);
  let nextDripAt = market.nextDripAt ?? now; // 1º lote logo na criação da conta
  for (let guard = 0; guard < 90 && now >= nextDripAt; guard++) {
    for (let i = 0; i < MARKET_DRIP_COUNT; i++) {
      const player = genMarketPlayer(rng, clubLevel);
      const value = playerValue(player);
      listings.push({
        id: `l${nextDripAt}-${Math.floor(rng() * 1e9).toString(36)}`,
        player,
        price: Math.round((value * (0.9 + rng() * 0.45)) / 50) * 50,
        seller: managerName(rng),
        expiresAt: nextDripAt + HOUR_MS * (36 + rng() * 36), // 1,5–3 dias de validade
        listedAt: nextDripAt,
      });
    }
    nextDripAt += MARKET_DRIP_MS;
  }
  return { ...market, listings, nextDripAt };
};

export const canBuy = (game, listing) => {
  if (game.club.money < listing.price) return "Dinheiro insuficiente.";
  if (game.players.length >= SQUAD_CAP) return `Plantel cheio (máx. ${SQUAD_CAP}).`;
  return null;
};

export const canSell = (game) => {
  const notSelling = game.players.filter((p) => !p.selling);
  if (notSelling.length <= SQUAD_MIN) return `Plantel no mínimo (${SQUAD_MIN}) — não podes vender mais.`;
  return null;
};

/* Processa vendas do utilizador (1x por hora): preço justo vende mais depressa. */
export const processSales = (players, rng, rate = 1) => {
  const sold = [];
  const kept = [];
  for (const p of players) {
    if (!p.selling) { kept.push(p); continue; }
    const fair = playerValue(p);
    const ratio = p.selling / Math.max(1, fair);
    const pSell = Math.max(0.03, Math.min(0.8, (1.35 - ratio) * 0.65)) * rate;
    if (rng() < pSell) sold.push(p);
    else kept.push(p);
  }
  return { sold, kept };
};
