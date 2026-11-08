/* Copia as contas e o progresso do antigo SQLite (server/onze.db) para o Postgres
   definido em DATABASE_URL. O SQLite só é lido, nunca alterado.
   Uso: npm run migrar:supabase [-- caminho/para/onze.db]
   Recusa correr se o destino já tiver contas, para não misturar dados. */
import { DatabaseSync } from "node:sqlite";

const srcPath = process.argv[2] ?? "server/onze.db";
const src = new DatabaseSync(srcPath, { readOnly: true });
const { db } = await import("../server/app.mjs");

const TABLES = ["users", "sessions", "saves", "club", "players", "market", "meta", "cups", "cup_entrants", "cup_matches", "cup_regs"];
const BATCH = 300;

const existing = await db.prepare("SELECT COUNT(*)::int AS n FROM users").get();
if (existing.n > 0) {
  console.error(`O destino já tem ${existing.n} conta(s). Nada foi copiado.`);
  process.exit(1);
}

const copyTable = async (table) => {
  const rows = src.prepare(`SELECT * FROM ${table}`).all();
  if (table === "players") rows.forEach((r, seq) => { r.seq = seq; });
  if (!rows.length) return 0;
  // bases antigas têm colunas que o jogo já não usa: só se copia o que existe no destino
  const known = new Set((await db.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?").all(table)).map((c) => c.column_name));
  const cols = Object.keys(rows[0]).filter((c) => known.has(c));
  const dropped = Object.keys(rows[0]).filter((c) => !known.has(c));
  if (dropped.length) console.log(`  (${table}: colunas antigas ignoradas: ${dropped.join(", ")})`);
  const row = `(${cols.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    await db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${part.map(() => row).join(", ")}`)
      .run(...part.flatMap((r) => cols.map((c) => r[c])));
  }
  return rows.length;
};

const copied = {};
await db.tx(async () => {
  for (const t of TABLES) copied[t] = await copyTable(t);
  await db.exec("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))");
});

let ok = true;
for (const t of TABLES) {
  const { n } = await db.prepare(`SELECT COUNT(*)::int AS n FROM ${t}`).get();
  const same = n === copied[t];
  if (!same) ok = false;
  console.log(`${same ? "✔" : "✘"} ${t}: ${copied[t]} → ${n}`);
}
const srcMoney = src.prepare("SELECT COALESCE(SUM(money), 0) AS s FROM club").get().s;
const { s: dstMoney } = await db.prepare("SELECT COALESCE(SUM(money), 0) AS s FROM club").get();
if (srcMoney !== dstMoney) ok = false;
console.log(`${srcMoney === dstMoney ? "✔" : "✘"} dinheiro total: ${srcMoney} → ${dstMoney}`);

await db.close();
console.log(ok ? "\n✅ MIGRAÇÃO OK" : "\n❌ A MIGRAÇÃO TEM DIFERENÇAS");
process.exit(ok ? 0 : 1);
