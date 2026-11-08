# Onze — TODO

## ✅ FEITO: Mercado de transferências REAL + overhaul do 2D (2026-08-19)
- **Mercado só entre managers reais**: acabou o comprador simulado
  (`processSales` removido de `src/engine/market.js` e do tick horário em
  `realtime.js`). Pôr um jogador à venda marca-o com `selling` e ele passa a
  estar num mercado GLOBAL, comprável por qualquer outro treinador — o jogador
  e o dinheiro movem-se entre contas (soma zero). Os únicos jogadores "do
  sistema" continuam a ser os agentes livres (3/dia por conta).
  - `server/club.mjs`: `listTransfers` (vendas de outros, filtrável por posição)
    e `buyTransfer` (move a linha do jogador vendedor→comprador numa transação;
    ordem crítica: apagar do vendedor antes de inserir no comprador, pois
    `players.id` é PK global). Guardas: não comprar o próprio, sem dinheiro,
    plantel cheio, plantel do vendedor no mínimo, listagem já ida. Teto de preço
    anti-lavagem em `sellPlayer`.
  - Endpoints: `GET /api/transfers`, `POST /api/transfers/buy`.
  - Cliente: `game.transfers` + `refreshTransfers`/`buyTransferPlayer`
    (useGame), nova secção na MarketView (com perfil do vendedor clicável).
  - Teste: `node scripts/markettest.mjs` (2 contas — listar, comprar, soma zero,
    id único preservado, e todas as guardas). Todos os testes antigos passam.
- **Novo motor de coreografia do 2D** (`src/ui/components/pitchSim.js`): em vez
  de posições fixas com micro-tremor, os 22 jogadores são agentes com MOVIMENTO
  contínuo (steering: seek/arrive/separação), a bola circula de pé em pé por
  passes reais e sobe o campo (com pressing do defesa mais próximo e perdas de
  bola que invertem a posse), e os eventos já decididos (golos, defesas, cartões,
  lesões) são injetados ao minuto certo. O `MatchViewer2D.jsx` passou a
  RENDERIZADOR puro sobre `sim.state` (câmara broadcast a seguir a bola, campo
  rico, banners, confettis). Continua a NÃO decidir nada — o placar final é
  sempre `result.score`. Teste: `node scripts/pitchtest.mjs` (30 jogos: placar
  final certo, expulsos removidos, sem NaN, termina sempre).
  - Refinamentos (2ª ronda): os remates saem SEMPRE da zona de finalização
    (clamp à metade ofensiva — nunca da própria defesa; longshots arrancam um
    pouco mais atrás), com construção natural até à área (o portador conduz em
    velocidade e o assistente faz o último passe). SOM sintetizado (Web Audio,
    sem ficheiros): toque na bola nos passes, remate, golo, defesa e apito;
    botão 🔊/🔇 no viewer. O teste garante "nenhum remate nasce na metade
    defensiva".
  - Refinamentos (3ª ronda): fluidez — tirados os "saltos" da bola (nunca se
    cola a bola a um jogador distante; recomeços de falta/lesão e perdas de bola
    passam a bola SOLTA que um jogador vai buscar). Remates ao lado saem
    claramente por FORA do poste (deixaram de parecer golo). Guarda-redes
    MERGULHA a sério nas defesas (vai à linha, ao y do remate; batido salta ao
    lado). Pontapés de CANTO próprios: bola ao canto → cruzamento alto → remate
    de cabeça/afastamento. Faltas recomeçam como livre (bola parada). NOTA:
    penáltis em jogo não existem no motor estatístico (match.js) — só há
    penáltis de desempate nas taças (result.penalties); adicioná-los seria mexer
    no motor de simulação e recalibrar.

## ✅ FEITO: Taças multi-jogador reais no servidor (2026-07-19)
Ver histórico — taças partilhadas por nível, servidor autoritário, testado
ponta a ponta (browser vs conta conduzida por script).

## ✅ FEITO: Plantel + economia autoritários no servidor (2026-07-19)
Dinheiro, jogadores, mercado, construções e boosters já não vivem no
cliente — são geridos por `server/club.mjs` (schema `club`/`players`/
`market`/`meta`) e validados em cada pedido. O cliente só mostra o que o
servidor devolve; nenhuma ação económica é aceite sem revalidação.

- Endpoints novos: `GET /api/state`, `POST /api/lineup|tactics|training`,
  `POST /api/market/buy|sell|cancel`, `POST /api/squad/release`,
  `POST /api/club/upgrade|booster`, `POST /api/matches/friendly`.
- `server/cups.mjs` já não recebe equipas do cliente — `registerTeam` só
  confirma a intenção; o servidor constrói o XI a partir do plantel real
  guardado (`club.buildXITeam`) e aplica XP/dinheiro/evolução diretamente
  (`club.applyMatchResult`, `club.creditCupOutcome`) assim que cada jogo
  resolve, para ambos os lados se forem contas reais.
- Migração automática: contas antigas (save.data no cliente, tabela
  `saves`) são importadas para as novas tabelas na primeira visita
  (`club.initClubForUser` → `migrateLegacy`) — testado com todas as 5
  contas reais criadas nas sessões anteriores (dinheiro, plantel, registo
  e troféus preservados exatamente).
- Curva de XP nova: nível 1→2 = 100 XP, 2→3 = 300 XP (3×), depois duplica
  sempre (600, 1200, 2400…).
- Mercado: só abre (comprar/vender) a partir do **nível 3**; a torneira de
  3 agentes livres por dia já corre desde a criação da conta (drip
  acumula mesmo bloqueado). Talento 7/8/9 tornados muito raros em todas as
  fontes (plantel inicial ~1%, academia e mercado crescem devagar com o
  nível).
- Testes: `node scripts/clubtest.mjs` (economia isolada — criação, torneira,
  compra/venda, construções, boosters, migração), `node scripts/cuptest.mjs`
  (multiplayer + economia integradas — 2 contas reais, evolução dos
  jogadores confirmada no servidor, anti-cheat do lineup testado), além do
  `simtest.mjs` atualizado (motor puro).
- Ataque manual confirmado contra o servidor real: compra bloqueada por
  nível, IDs de jogadores inventados filtrados do lineup, XP/dinheiro só
  mudam com jogos reais.

## 🥇 Prioridade 1: Deploy (para haver jogadores reais a sério)
- [ ] Pôr online: Render/Railway free tier corre `npm run build && npm run server`
      (porta via `process.env.PORT`, já suportado). SQLite precisa de disco persistente.
- [ ] Sem isto, o multiplayer só funciona entre contas na mesma máquina.

## 🥈 Melhorias
- [ ] Email de verificação no registo (precisa de SMTP, ex.: Resend) + recuperação de password.
- [x] Perfil público de outro manager (clicar num adversário → palmarés, plantel). — FEITO
- [ ] Lobby/chat da taça enquanto se espera pelo adversário.
- [ ] Notificação (som/browser) quando a janela de registo abre.
- [x] 2D: bloco a deslizar com a bola, pressing, câmara a seguir o lance, celebração. — FEITO
      (falta ainda: guarda-redes a mergulhar em defesas/remates, repetição do golo).
- [ ] Bots do mundo partilhado (server/world.mjs) evoluírem persistentemente
      (hoje a força é fixa por processo — reinicia com o servidor).
- [ ] Apagar conta (endpoint + botão com confirmação).
- [ ] Otimizar `persistGame`: hoje faz DELETE+INSERT de todos os jogadores a
      cada ação — bom para ~26 jogadores/conta, mas vale a pena rever se o
      número de contas simultâneas crescer muito.
