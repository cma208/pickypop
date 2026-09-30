declare module 'pg-query-emscripten' {
  export interface PgParseError {
    message: string;
    cursorpos?: number;
  }

  export interface PgParseResult {
    parse_tree?: unknown;
    error: PgParseError | null;
  }

  export interface PgQueryModule {
    parse(sql: string): PgParseResult;
  }

  const init: () => Promise<PgQueryModule>;
  export default init;
}
