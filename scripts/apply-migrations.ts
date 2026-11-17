/**
 * Applies pending Drizzle migrations over the HTTP driver.
 *
 * `drizzle-kit migrate` uses the websocket driver, which cannot reach a
 * remote Neon instance from every environment. This script reads the same
 * migration files and the same `drizzle/meta/_journal.json`, applies whatever
 * has not been recorded in `drizzle.__drizzle_migrations`, and records it with
 * the same SHA-256 hash drizzle-kit uses.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@neondatabase/serverless";

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  // Migrations that were applied out of band (for example through
  // `drizzle-kit push`) and only need their bookkeeping row written.
  const recordOnly = new Set(
    process.argv
      .filter((arg) => arg.startsWith("--record-only="))
      .flatMap((arg) => arg.slice("--record-only=".length).split(","))
      .map((tag) => tag.trim())
      .filter(Boolean),
  );

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as {
    entries: JournalEntry[];
  };

  const client = new Client(connectionString);
  await client.connect();

  try {
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS "drizzle"`,
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const applied = await client.query(
      `SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY id`,
    );
    const appliedHashes = new Set(
      applied.rows.map((row: { hash: string }) => row.hash),
    );

    for (const entry of journal.entries) {
      const file = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
      if (!fs.existsSync(file)) {
        console.warn(`Missing migration file: ${entry.tag}.sql`);
        continue;
      }

      const sql = fs.readFileSync(file, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");

      if (appliedHashes.has(hash)) {
        console.log(`= ${entry.tag} already applied`);
        continue;
      }

      console.log(`> ${entry.tag} applying`);
      if (recordOnly.has(entry.tag)) {
        console.log(`  (recorded without running)`);
      } else {
        for (const statement of splitStatements(sql)) {
          await client.query(statement);
        }
      }

      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, entry.when],
      );
      console.log(`< ${entry.tag} applied`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
