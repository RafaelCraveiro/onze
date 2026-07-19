/* "Segundo jogador" — uma conta real conduzida por script, para testar o
   multiplayer contra a conta que está no browser. O plantel e a economia
   vivem inteiramente no servidor agora — este script só chama a API.
   Uso:
     node scripts/rival.mjs criar                  → cria a conta rival (plantel gerado no servidor)
     node scripts/rival.mjs inscrever <cupId?>     → inscreve na 1ª taça aberta (ou na indicada)
     node scripts/rival.mjs estado                 → mostra as taças do rival
     node scripts/rival.mjs registar               → confirma a equipa na ronda aberta (o servidor usa o plantel real)
*/
const BASE = process.env.ONZE_URL ?? "http://localhost:4320";
const EMAIL = "rival@onze.pt";
const PASS = "rival123";
const CLUB = "Rival Real FC";
const EMB = { shape: "circulo", pattern: "metades", symbol: "🐉", c1: "#9333ea", c2: "#facc15" };

const api = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
};

const login = async () => {
  try { return await api("POST", "/api/login", { email: EMAIL, password: PASS }); }
  catch { return null; }
};

const cmd = process.argv[2] ?? "estado";

if (cmd === "criar") {
  const existing = await login();
  if (existing) { console.log("rival já existe:", CLUB, "| nível", existing.game.club.level); process.exit(0); }
  const out = await api("POST", "/api/register", { email: EMAIL, password: PASS, clubName: CLUB, emblem: EMB });
  console.log("✅ rival criado:", CLUB, "| nível", out.game.club.level, "| dinheiro", out.game.club.money, "| plantel", out.game.players.length);
  process.exit(0);
}

const session = await login();
if (!session) { console.error("rival não existe — corre primeiro: node scripts/rival.mjs criar"); process.exit(1); }
const token = session.token;

if (cmd === "estado") {
  const { cups } = await api("GET", "/api/cups", null, token);
  for (const c of cups) {
    const mine = c.entrants.includes("you") ? " ⭐INSCRITO" : "";
    console.log(`${c.state.padEnd(10)} ${c.name} (nv ${c.level}) inscritos=${c.entrants.length}/${c.size} inicio=${new Date(c.startsAt).toLocaleTimeString("pt-PT")}${mine}`);
    if (c.rounds) c.rounds.forEach((r, i) => console.log(`   ronda ${i}: ` + r.map((m) => `${c.info[m.h]?.name ?? m.h} ${m.score ? m.score.join("-") : "vs"} ${c.info[m.a]?.name ?? m.a}`).join(" | ")));
  }
  process.exit(0);
}

if (cmd === "inscrever") {
  const wanted = process.argv[3];
  const { cups } = await api("GET", "/api/cups", null, token);
  const open = cups.filter((c) => c.state === "inscricao").sort((a, b) => a.startsAt - b.startsAt);
  const cup = wanted ? cups.find((c) => c.id === wanted) : open[0];
  if (!cup) { console.error("sem taça para inscrever"); process.exit(1); }
  const out = await api("POST", `/api/cups/${cup.id}/enroll`, {}, token);
  console.log(`✅ rival inscrito em ${out.cup.name} (${out.cup.entrants.length}/${out.cup.size}) — id ${cup.id}`);
  process.exit(0);
}

if (cmd === "registar") {
  const { cups } = await api("GET", "/api/cups", null, token);
  const cup = cups.find((c) => c.state === "decorrer" && c.entrants.includes("you"));
  if (!cup) { console.error("rival não tem taça a decorrer"); process.exit(1); }
  const out = await api("POST", `/api/cups/${cup.id}/register`, {}, token);
  if (out.resolved) {
    const gU = out.isHome ? out.result.score[0] : out.result.score[1];
    const gO = out.isHome ? out.result.score[1] : out.result.score[0];
    console.log(`✅ rival jogou contra ${out.opp.team}: ${gU}-${gO} (${out.result.events?.length ?? 0} eventos)`);
  } else {
    console.log("✅ rival registou a equipa — à espera do adversário");
  }
  process.exit(0);
}

console.error("comando desconhecido");
process.exit(1);
