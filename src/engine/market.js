/* Agentes livres + regras de venda.
   AGENTES LIVRES: cada treinador tem a sua própria secção, populada desde o
   NÍVEL 1 — MARKET_DRIP_COUNT (3) jogadores aleatórios novos por dia, com
   preço de compra, mas que NÃO pertencem a nenhum treinador real. As
   listagens expiram ao relógio.
   VENDAS: pôr um jogador à venda (a partir de MARKET_UNLOCK_LEVEL) marca-o com
   `selling` e ele passa a estar no MERCADO DE TRANSFERÊNCIAS global, comprável
   por qualquer outro manager real (server/club.mjs: listTransfers/buyTransfer).
   Já não há comprador simulado — o jogador só sai quando alguém o compra. */

import {
  playerValue, SQUAD_CAP, SQUAD_MIN, HOUR_MS, MARKET_DRIP_COUNT, MARKET_DRIP_MS,
} from "./constants.js";
import { genMarketPlayer } from "./generation.js";

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
