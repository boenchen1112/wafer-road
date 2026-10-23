import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Integration tests that run the real Worker + Durable Object inside workerd (via Miniflare).
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
  test: { include: ['test/workers/**/*.test.ts'], testTimeout: 20_000 },
});
