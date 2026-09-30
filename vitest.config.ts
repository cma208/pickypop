import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The Angular app has its own runner: pnpm --filter @pickypop/web test
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/**'],
  },
});
