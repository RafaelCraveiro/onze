/* Mercado — três secções:
   1) AGENTES LIVRES (desde o nível 1): 3 jogadores aleatórios novos por dia, só
      teus, sem dono real — a única "oferta do sistema".
   2) MERCADO DE TRANSFERÊNCIAS (global): jogadores que OUTROS managers reais
      puseram à venda. Comprar move o jogador para o teu plantel e o dinheiro
      para o vendedor. Não há compradores simulados.
   3) AS TUAS VENDAS: os teus jogadores à venda (visíveis a todos até alguém
      comprar). Vender abre no nível MARKET_UNLOCK_LEVEL. */

import { useEffect, useState } from "react";
import { Section, Btn, PosBadge, Talent, Pill } from "../components/bits.jsx";
import {
  overallBase, playerValue, MARKET_UNLOCK_LEVEL, SQUAD_CAP, lineOf, LINE_LABEL,
} from "../../engine/constants.js";
import { canBuy } from "../../engine/market.js";
import { fmtMoney, fmtWhen, overallColor } from "../helpers.js";

const LINE_FILTERS = ["Todas", "GR", "DF", "MD", "AV"];

export default function MarketView({ game, actions, onShowPlayer, onShowProfile }) {
  const selling = game.players.filter((p) => p.selling);
  const sellLocked = game.club.level < MARKET_UNLOCK_LEVEL;
  const transfers = game.transfers ?? [];
  const [line, setLine] = useState("Todas");

  // o mercado de transferências é global e vivo — refresca ao abrir e em ciclo
  useEffect(() => {
    actions.refreshTransfers?.();
    const iv = setInterval(() => actions.refreshTransfers?.(), 12000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = line === "Todas" ? transfers : transfers.filter((t) => lineOf(t.player.pos) === line);
  const buyBlock = (price) =>
    game.club.money < price ? "Dinheiro insuficiente." :
    game.players.length >= SQUAD_CAP ? `Plantel cheio (máx. ${SQUAD_CAP}).` : null;

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="Agentes livres"
        right={<span className="text-[11px] text-[#9aa08e]">3 novos por dia · só teus · sem dono real</span>}
      >
        <div className="flex flex-col gap-1.5">
          {game.market.listings.length === 0 && (
            <p className="text-xs text-[#9aa08e]">Sem agentes livres neste momento — o próximo lote chega em breve.</p>
          )}
          {game.market.listings.map((l) => {
            const p = l.player;
            const block = canBuy(game, l);
            return (
              <div key={l.id} className="flex items-center gap-2 rounded-md border border-[#e6e8da] bg-[#fbfcf7] px-2 py-1.5">
                <span>{p.flag}</span>
                <PosBadge pos={p.pos} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#3d7a0e]">
                    <button className="underline decoration-dotted hover:text-[#2f5e0b]" title="Ver a página do jogador" onClick={() => onShowPlayer?.(p)}>
                      {p.name}
                    </button>
                    <span className="ml-2 text-xs font-normal text-[#9aa08e]">{p.age} anos</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-[#6b7261]">
                    <Talent t={p.talent} />
                    <span>agente livre</span>
                    <span className="text-[#b3b8a5]">· expira às {fmtWhen(l.expiresAt)}</span>
                  </p>
                </div>
                <b className="text-lg" style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b>
                <div className="flex flex-col items-end">
                  <Btn disabled={!!block} title={block ?? ""} onClick={() => actions.buyPlayer(l.id)}>
                    {fmtMoney(l.price)}
                  </Btn>
                  <span className="text-[10px] text-[#9aa08e]">valor {fmtMoney(playerValue(p))}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Mercado de transferências"
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-[#9aa08e] sm:inline">jogadores de managers reais ({transfers.length})</span>
            <select value={line} onChange={(e) => setLine(e.target.value)} className="rounded border border-[#c9cdb6] bg-white px-2 py-1 text-xs">
              {LINE_FILTERS.map((f) => (
                <option key={f} value={f}>{f === "Todas" ? "Todas as posições" : LINE_LABEL[f]}</option>
              ))}
            </select>
          </div>
        }
      >
        {transfers.length === 0 ? (
          <p className="text-xs text-[#9aa08e]">
            Ainda não há jogadores à venda por outros managers. Quando alguém puser um jogador no mercado, aparece aqui — e podes comprá-lo na hora.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-xs text-[#9aa08e]">Nenhum jogador nesta posição de momento.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {shown.map((t) => {
              const p = t.player;
              const block = buyBlock(t.price);
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-md border border-[#e6e8da] bg-[#fbfcf7] px-2 py-1.5">
                  <span>{p.flag}</span>
                  <PosBadge pos={p.pos} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#3d7a0e]">
                      <button className="underline decoration-dotted hover:text-[#2f5e0b]" title="Ver a página do jogador" onClick={() => onShowPlayer?.(p, t.sellerName)}>
                        {p.name}
                      </button>
                      <span className="ml-2 text-xs font-normal text-[#9aa08e]">{p.age} anos</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6b7261]">
                      <Talent t={p.talent} />
                      <span className="text-[#9aa08e]">de</span>
                      <button className="font-semibold text-[#2563eb] underline decoration-dotted" title="Ver o perfil do manager" onClick={() => onShowProfile?.(t.sellerName)}>
                        {t.sellerName}
                      </button>
                    </p>
                  </div>
                  <b className="text-lg" style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</b>
                  <div className="flex flex-col items-end">
                    <Btn kind="gold" disabled={!!block} title={block ?? ""} onClick={() => actions.buyTransferPlayer(t.id)}>
                      {fmtMoney(t.price)}
                    </Btn>
                    <span className="text-[10px] text-[#9aa08e]">valor {fmtMoney(playerValue(p))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title={`As tuas vendas (${selling.length})`}
        right={sellLocked ? <Pill color="#c0392b">abre no nível {MARKET_UNLOCK_LEVEL}</Pill> : undefined}
      >
        {sellLocked ? (
          <p className="text-xs text-[#9aa08e]">
            🔒 Vender jogadores no mercado só a partir do <b>nível {MARKET_UNLOCK_LEVEL}</b> — estás no nível {game.club.level}.
            Vence taças para subir de nível!
          </p>
        ) : selling.length === 0 ? (
          <p className="text-xs text-[#9aa08e]">Nenhum jogador à venda. Abre a ficha de um jogador no Plantel para o vender.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selling.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border border-[#e6e8da] bg-[#fbfcf7] px-2 py-1.5">
                <PosBadge pos={p.pos} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                <span className="text-sm font-bold text-[#d97706]">{fmtMoney(p.selling)}</span>
                <span className="text-[10px] text-[#9aa08e]">(valor {fmtMoney(playerValue(p))})</span>
                <Btn kind="dark" onClick={() => actions.cancelSale(p.id)}>Retirar</Btn>
              </div>
            ))}
            <p className="text-[11px] text-[#9aa08e]">Estão no mercado de transferências, visíveis a todos os managers — só saem quando alguém os comprar (podes continuar a usá-los até lá). Preços perto do valor real atraem mais compradores.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
