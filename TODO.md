# Onze — TODO

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
- [ ] Perfil público de outro manager (clicar num adversário → palmarés, plantel).
- [ ] Lobby/chat da taça enquanto se espera pelo adversário.
- [ ] Notificação (som/browser) quando a janela de registo abre.
- [ ] 2D: pressão defensiva ao portador, guarda-redes a mergulhar, repetição do golo.
- [ ] Bots do mundo partilhado (server/world.mjs) evoluírem persistentemente
      (hoje a força é fixa por processo — reinicia com o servidor).
- [ ] Apagar conta (endpoint + botão com confirmação).
- [ ] Otimizar `persistGame`: hoje faz DELETE+INSERT de todos os jogadores a
      cada ação — bom para ~26 jogadores/conta, mas vale a pena rever se o
      número de contas simultâneas crescer muito.
