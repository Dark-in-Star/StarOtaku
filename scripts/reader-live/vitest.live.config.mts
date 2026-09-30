import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname, "../..");

// Hits the real sources over the network — never part of `pnpm test`. Run with:
//   pnpm vitest run --config scripts/reader-live/vitest.live.config.mts
export default defineConfig({
  root,
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { "server-only": path.resolve(root, "src/test/mocks/server-only.ts") },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/reader-live/**/*.live.ts"],
    testTimeout: 30 * 60_000,
    hookTimeout: 60_000,
  },
});
