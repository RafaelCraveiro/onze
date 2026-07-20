/* Mercado — duas secções: AGENTES LIVRES (desde o nível 1: 3 jogadores
   aleatórios novos por dia, só teus, sem dono real) e as tuas VENDAS
   (mercado a sério — abre no nível MARKET_UNLOCK_LEVEL). */

import { Section, Btn, PosBadge, Talent, Pill } from "../components/bits.jsx";
import { overallBase, playerValue, MARKET_UNLOCK_LEVEL } from "../../engine/constants.js";
import { canBuy } from "../../engine/market.js";
import { fmtMoney, fmtWhen, overallColor } from "../helpers.js";

export default function MarketView({ game, actions, onShowPlayer }) {
  const selling = game.players.filter((p) => p.selling);
  const sellLocked = game.club.level < MARKET_UNLOCK_LEVEL;

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
            <p className="text-[11px] text-[#9aa08e]">Preços perto do valor real vendem mais depressa. Os compradores aparecem ao longo do tempo — volta mais tarde.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
