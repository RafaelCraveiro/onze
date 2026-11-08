/* Acesso à base de dados (Postgres).
   - Com DATABASE_URL: liga ao Postgres do Supabase (ou outro qualquer).
   - Sem DATABASE_URL, fora de produção: usa um Postgres embutido (PGlite) em
     server/pgdata, para o jogo correr em local sem configurar nada.

   A interface imita a do antigo node:sqlite (`db.prepare(sql).get/all/run`,
   com `?` nos parâmetros), mas tudo devolve Promises.

   TRANSAÇÕES: com SQLite síncrono cada pedido era naturalmente atómico. Em
   Postgres os pedidos intercalam-se nos `await`, e o padrão carregar → alterar
   → gravar podia duplicar dinheiro ou jogadores. Por isso `db.tx()` corre um
   pedido de cada vez: fila no processo + advisory lock no Postgres (protege
   também se um dia houver mais do que uma instância do servidor). */

import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TX_LOCK_ID = 727001;

const toPgPlaceholders = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

export const createDb = (driver) => {
  const txClient = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const conn = () => txClient.getStore() ?? driver;
  const query = (sql, params) => conn().query(toPgPlaceholders(sql), params);

  const runTx = async (fn) => {
    const client = await driver.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(${TX_LOCK_ID})`);
      const result = await txClient.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* a ligação caiu; o Postgres já desfez */ }
      throw err;
    } finally {
      client.release();
    }
  };

  return {
    prepare: (sql) => ({
      get: async (...params) => (await query(sql, params)).rows[0],
      all: async (...params) => (await query(sql, params)).rows,
      run: async (...params) => query(sql, params),
    }),
    // dentro de uma transação, usa a ligação dela (uma ligação do pg só tem .query)
    exec: (sql) => { const c = txClient.getStore(); return c ? c.query(sql) : driver.exec(sql); },
    tx: (fn) => {
      if (txClient.getStore()) return fn(); // já dentro de uma transação
      const result = queue.then(() => runTx(fn));
      queue = result.catch(() => {});
      return result;
    },
    close: () => driver.close(),
  };
};

const pgliteDriver = async (dataDir) => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const self = {
    query: (sql, params) => pg.query(sql, params),
    exec: (sql) => pg.exec(sql),
    connect: async () => ({ query: self.query, release: () => {} }),
    close: () => pg.close(),
  };
  return self;
};

const postgresDriver = async (url) => {
  const { default: pg } = await import("pg");
  pg.types.setTypeParser(20, Number); // BIGINT como número (ids de contas), não como texto
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  // sem isto, uma ligação inativa cortada pelo Supabase derrubava o servidor
  pool.on("error", (err) => console.error("[db] ligação perdida:", err.message));
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    connect: () => pool.connect(),
    close: () => pool.end(),
  };
};

export const createMemoryDb = async () => createDb(await pgliteDriver());

export const openDatabase = async () => {
  // ONZE_NO_ENV_FILE: os testes nunca podem ligar à base de dados real definida no .env
  if (!process.env.ONZE_NO_ENV_FILE) {
    try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch { /* sem .env */ }
  }
  const url = process.env.DATABASE_URL;
  if (url) return createDb(await postgresDriver(url));
  if (process.env.NODE_ENV === "production") throw new Error("Falta a variável DATABASE_URL (ligação ao Supabase).");
  const dataDir = process.env.PGLITE_DIR === "memory" ? undefined : (process.env.PGLITE_DIR ?? path.join(__dirname, "pgdata"));
  console.log("[db] Sem DATABASE_URL: a usar o Postgres local embutido.");
  return createDb(await pgliteDriver(dataDir));
};
