import { defineConfig, devices } from "@playwright/test";

// Real-browser check of the reader against the live sources and the real MAL API — unlike
// e2e/, which runs against a mock. Needs a production build (`pnpm build`) first:
//   READER_IDS=13,2,116778 pnpm playwright test --config scripts/reader-live/playwright.reader.config.ts
const PORT = 3011;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.browser\.ts/,
  workers: 1,
  timeout: 420_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm next start -p ${PORT}`,
    // Commands run from this config's folder by default; the build lives at the repo root.
    cwd: "../..",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { ENABLE_ADULT_READER: "1" },
  },
});
