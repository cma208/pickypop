import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PgQuery from 'pg-query-emscripten';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Parses every migration with PostgreSQL's own grammar, compiled to
 * WebAssembly. It is not a substitute for applying them ("supabase db reset"),
 * but it catches typos in seconds and without Docker.
 */

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

let parse: (sql: string) => { error: { message: string; cursorpos?: number } | null };

beforeAll(async () => {
  const pg = await PgQuery();
  parse = (sql: string) => pg.parse(sql);
});

describe('seed', () => {
  it('is plain SQL: the CLI sends it to PostgreSQL, so psql meta-commands break it', () => {
    const seed = readFileSync(fileURLToPath(new URL('../seed.sql', import.meta.url)), 'utf8');

    const metaCommands = seed
      .split('\n')
      .filter((line) => line.startsWith('\\'));
    expect(metaCommands).toEqual([]);
  });

  it('parses without syntax errors', () => {
    const seed = readFileSync(fileURLToPath(new URL('../seed.sql', import.meta.url)), 'utf8');

    expect(parse(seed).error?.message ?? null).toBeNull();
  });
});

describe('migrations', () => {
  it('there is at least one migration', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it.each(migrations)('%s parses without syntax errors', (file) => {
    const sql = readFileSync(migrationsDir + file, 'utf8');
    const result = parse(sql);

    expect(result.error?.message ?? null).toBeNull();
  });

  it.each(migrations)('%s is idempotent about types it creates', (file) => {
    const sql = readFileSync(migrationsDir + file, 'utf8');

    // Enums cannot be re-created, so a migration must never be edited after it
    // has been applied: this only guards against duplicates inside one file.
    const created = [...sql.matchAll(/create type public\.(\w+)/g)].map((match) => match[1]);
    expect(new Set(created).size).toBe(created.length);
  });
});
