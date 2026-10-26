import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "starotaku",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-25",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Backs the data cache `kvDataAdapter()` wires up in vite.config.ts. Without this
      // binding the adapter has no store, so every `fetch`/`use cache` entry misses and
      // each render re-hits the upstream — which is what exhausted AniList's per-IP rate
      // limit on the Worker's shared egress.
      VINEXT_KV_CACHE: bindings.kv(),
    },
  }),
});
