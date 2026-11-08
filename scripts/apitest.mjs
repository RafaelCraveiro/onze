/* Teste da API real (Express + Postgres embutido em memória): contas, sessões,
   transações por pedido e pedidos em simultâneo (sem duplicar dinheiro). */
process.env.PGLITE_DIR = "memory";
delete process.env.DATABASE_URL;
process.env.ONZE_NO_ENV_FILE = "1";

const { app, db } = await import("../server/app.mjs");
const srv = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}`;

let fails = 0;
const check = (name, cond, detail = "") => { if (cond) console.log(`  ✔ ${name}`); else { fails++; console.error(`  ✘ ${name} ${detail}`); } };
const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};
const EMB = { shape: "escudo", pattern: "liso", symbol: "⚽", c1: "#2563eb", c2: "#fff" };
const account = (n, clubName = `Clube ${n}`) => ({ email: `teste${n}@exemplo.test`, password: "segredo123", clubName, emblem: EMB });

console.log("\n[1] Contas e sessões");
const a = await call("POST", "/api/register", null, account(1, "Alpha FC"));
check("registo cria conta e clube", a.status === 200 && a.body.game?.players?.length === 20, JSON.stringify(a.body).slice(0, 150));
const dupName = await call("POST", "/api/register", null, account(2, "alpha fc"));
check("nome de clube repetido, com outras maiúsculas, recusado", dupName.status === 409 && dupName.body.error === "clube-existe", JSON.stringify(dupName));
const dupMail = await call("POST", "/api/register", null, account(1, "Outro FC"));
check("email repetido recusado", dupMail.status === 409 && dupMail.body.error === "email-existe");
const wrong = await call("POST", "/api/login", null, { email: "teste1@exemplo.test", password: "errada" });
check("password errada recusada", wrong.status === 401);
const login = await call("POST", "/api/login", null, { email: "teste1@exemplo.test", password: "segredo123" });
check("login devolve sessão e emblema", login.status === 200 && login.body.emblem?.symbol === "⚽");
const token = login.body.token;
check("pedido sem sessão recusado", (await call("GET", "/api/state")).status === 401);
const me = await call("GET", "/api/me", token);
check("/api/me devolve o clube", me.body.clubName === "Alpha FC");
const b = await call("POST", "/api/register", null, account(3, "Beta SC"));
const profile = await call("GET", "/api/profile/beta%20sc", token);
check("perfil público encontrado sem distinção de maiúsculas", profile.body.profile?.clubName === "Beta SC");

console.log("\n[2] Rotas e jogos");
check("rota /api desconhecida dá 404 sem prender a fila", (await call("GET", "/api/nao-existe", token)).status === 404);
const friendly = await call("POST", "/api/matches/friendly", token, {});
check("amigável jogado", Array.isArray(friendly.body.result?.events));
const cups = await call("GET", "/api/cups", token);
check("taças listadas", cups.body.cups?.length >= 3, JSON.stringify(cups.body).slice(0, 150));
const target = cups.body.cups.filter((c) => c.state === "inscricao").sort((x, y) => x.startsAt - y.startsAt)[0];
const enrolled = await call("POST", `/api/cups/${target.id}/enroll`, token, {});
check("inscrição na taça", enrolled.body.ok === true, JSON.stringify(enrolled.body).slice(0, 150));

const lg = await call("GET", "/api/league", token);
check("a conta entra numa liga de 12 clubes", lg.body.league?.table?.length === 12, JSON.stringify(lg.body).slice(0, 150));
const pid = a.body.game.players[3].id;
check("definir foco pela API", (await call("POST", `/api/squad/${pid}/focus`, token, { focus: "fisico" })).body.ok === true);
check("renovar pela API", (await call("POST", `/api/squad/${pid}/renew`, token, {})).body.ok === true);

console.log("\n[3] Pedidos em simultâneo não duplicam nada");
await db.prepare("UPDATE club SET money = 100000 WHERE user_id = 1").run();
const before = (await call("GET", "/api/state", token)).body.game;
const listing = before.market.listings[0];
const squad = before.players.length;
const money = before.club.money;
const results = await Promise.all(Array.from({ length: 12 }, () => call("POST", "/api/market/buy", token, { listingId: listing.id })));
const okCount = results.filter((r) => r.body.ok).length;
check("12 compras iguais em paralelo: só 1 aceite", okCount === 1, `(${okCount})`);
const after = (await call("GET", "/api/state", token)).body.game;
check("dinheiro debitado uma só vez", after.club.money === money - listing.price, `(${money} → ${after.club.money}, preço ${listing.price})`);
check("plantel só com +1", after.players.length === squad + 1, `(${squad} → ${after.players.length})`);

console.log("\n[4] Erros desfazem o pedido inteiro");
const moneyBefore = (await db.prepare("SELECT money FROM club WHERE user_id = 1").get()).money;
const failed = await db.tx(async () => {
  await db.prepare("UPDATE club SET money = 1 WHERE user_id = 1").run();
  throw new Error("falha simulada");
}).catch((e) => e.message);
check("a falha chega a quem chamou", failed === "falha simulada");
check("dinheiro intacto após rollback", (await db.prepare("SELECT money FROM club WHERE user_id = 1").get()).money === moneyBefore);
check("a fila continua a funcionar após uma falha", (await call("GET", "/api/me", token)).status === 200);

console.log("\n[5] Tabelas fechadas à API pública do Supabase");
const open = await db.prepare("SELECT relname FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND NOT relrowsecurity").all();
check("RLS ativo em todas as tabelas", open.length === 0, JSON.stringify(open));

check("sessão do segundo utilizador independente", typeof b.body.token === "string" && b.body.token !== token);
await call("POST", "/api/logout", token, {});
check("logout invalida a sessão", (await call("GET", "/api/me", token)).status === 401);

srv.close();
await db.close();
console.log(fails === 0 ? "\n✅ API + POSTGRES OK" : `\n❌ ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
