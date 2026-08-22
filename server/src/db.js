// =========================================================
// Postgres connection pool
// =========================================================
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres providers (Supabase, Neon, Railway, Render, Heroku)
  // require TLS with a self-signed chain — relax verification for those.
  ssl: process.env.DATABASE_URL && /supabase|neon|railway|render|heroku/i.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[db] idle client error:", err);
});

/**
 * Run a function inside a transaction. The callback receives a dedicated
 * client. Automatically rolls back on throw, always releases the client.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
