import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

/**
 * Parses every migration with PostgreSQL's own grammar, compiled to
 * WebAssembly. It is not a substitute for applying them ("supabase db reset"),
 * but it catches typos in seconds and without Docker.
 *
 * Files are split into statements first: the WebAssembly parser gives up on
 * large inputs, and a failure points at the exact statement this way. Each
 * file also gets a fresh parser, because the module misbehaves after a few
 * hundred parses in a row.
 */

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

/** Splits on semicolons at the end of a line, leaving $$ bodies alone. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let insideBody = false;

  for (const line of sql.split('\n')) {
    current += line + '\n';
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) insideBody = !insideBody;
    if (!insideBody && line.trimEnd().endsWith(';')) {
      statements.push(current);
      current = '';
    }
  }
  if (current.trim() !== '') statements.push(current);

  return statements.filter((statement) => statement.trim() !== '');
}

/** First meaningful line, to name the statement in a failure message. */
function describeStatement(statement: string): string {
  const line = statement
    .split('\n')
    .map((text) => text.trim())
    .find((text) => text !== '' && !text.startsWith('--'));

  return line?.slice(0, 70) ?? '(empty)';
}

async function findSyntaxError(sql: string): Promise<string | null> {
  const pg = await PgQuery();

  for (const statement of splitStatements(sql)) {
    const result = pg.parse(statement);
    if (result.error) {
      return `${result.error.message}\n  en: ${describeStatement(statement)}`;
    }
  }

  return null;
}

describe('seed', () => {
  const seed = () => readFileSync(fileURLToPath(new URL('../seed.sql', import.meta.url)), 'utf8');

  it('is plain SQL: the CLI sends it to PostgreSQL, so psql meta-commands break it', () => {
    expect(seed().split('\n').filter((line) => line.startsWith('\\'))).toEqual([]);
  });

  it('parses without syntax errors', async () => {
    expect(await findSyntaxError(seed())).toBeNull();
  });
});

describe('migrations', () => {
  it('there is at least one migration', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it.each(migrations)('%s parses without syntax errors', async (file) => {
    expect(await findSyntaxError(readFileSync(migrationsDir + file, 'utf8'))).toBeNull();
  });

  // Money is numeric, never floating point: half a sol has to stay half a sol
  // after a thousand additions. Catching it here is cheaper than finding a
  // cash balance that is off by a cent.
  it.each(migrations)('%s declares no column as floating point', (file) => {
    const sql = readFileSync(migrationsDir + file, 'utf8');
    const floats = [...sql.matchAll(/^\s*\w+\s+(real|double precision|float\d*)\b/gim)];

    expect(floats.map((match) => match[0].trim())).toEqual([]);
  });

  it.each(migrations)('%s is idempotent about types it creates', (file) => {
    const sql = readFileSync(migrationsDir + file, 'utf8');

    // Enums cannot be re-created, so a migration must never be edited after it
    // has been applied: this only guards against duplicates inside one file.
    const created = [...sql.matchAll(/create type public\.(\w+)/g)].map((match) => match[1]);
    expect(new Set(created).size).toBe(created.length);
  });
});
