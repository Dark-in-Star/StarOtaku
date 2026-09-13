#!/usr/bin/env node
// Generates web (public/icons/) and Android (android/app/src/main/res/...) icon/splash
// assets from the single source-of-truth logo at public/logo.webp.
//
// Uses @jsquash/* (WASM codecs, no native build step — this repo's pnpm-workspace.yaml
// disallows native postinstall builds via `allowBuilds`) instead of `sharp`.
//
// Run with: pnpm generate:icons

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { init as initWebpDecode } from "@jsquash/webp/decode.js";
import decodeWebp from "@jsquash/webp/decode.js";
import { initResize } from "@jsquash/resize";
import resize from "@jsquash/resize";
import { init as initPngEncode } from "@jsquash/png/encode.js";
import encodePng from "@jsquash/png/encode.js";

globalThis.ImageData = class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
};

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_LOGO = `${REPO_ROOT}public/logo.webp`;

const DARK_BG = [0x14, 0x10, 0x0f, 0xff];
const LIGHT_BG = [0xff, 0xff, 0xff, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

// Node's fetch can't load file:// URLs, which is how these WASM codecs try to load
// themselves by default — so every codec is initialized with pre-read wasm bytes instead.
async function wasmBytes(specifier) {
  return readFile(fileURLToPath(import.meta.resolve(specifier)));
}

async function initCodecs() {
  const webpModule = await WebAssembly.compile(await wasmBytes("@jsquash/webp/codec/dec/webp_dec.wasm"));
  await initWebpDecode(webpModule);
  await initResize(await wasmBytes("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm"));
  await initPngEncode(await wasmBytes("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));
}

function createCanvas(size, [r, g, b, a]) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return new ImageData(data, size, size);
}

// Straight (non-premultiplied) "source over" alpha compositing.
function compositeOver(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    const ddy = dy + y;
    if (ddy < 0 || ddy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const ddx = dx + x;
      if (ddx < 0 || ddx >= dst.width) continue;

      const si = (y * src.width + x) * 4;
      const sa = src.data[si + 3] / 255;
      if (sa <= 0) continue;

      const di = (ddy * dst.width + ddx) * 4;
      const da = dst.data[di + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        const outC = outA > 0 ? (src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / outA : 0;
        dst.data[di + c] = Math.round(outC);
      }
      dst.data[di + 3] = Math.round(outA * 255);
    }
  }
}

function circleMask(img) {
  const { width: w, height: h, data } = img;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy > r * r) {
        data[(y * w + x) * 4 + 3] = 0;
      }
    }
  }
  return img;
}

// Places `source` (already-decoded full logo) scaled to `scale` of `canvasSize`,
// centered on a solid (or transparent) background of `canvasSize`.
async function renderIcon(source, canvasSize, scale, bg) {
  const contentSize = Math.round(canvasSize * scale);
  const resizedLogo = contentSize === source.width
    ? source
    : await resize(source, { width: contentSize, height: contentSize });
  const canvas = createCanvas(canvasSize, bg);
  const offset = Math.round((canvasSize - contentSize) / 2);
  compositeOver(canvas, resizedLogo, offset, offset);
  return canvas;
}

async function writePng(image, outPath) {
  const pngBuffer = await encodePng(image);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(pngBuffer));
  console.log(`wrote ${outPath.replace(REPO_ROOT, "")}`);
}

// Standard Android density buckets, expressed as px for a given dp baseline.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const ADAPTIVE_ICON_DP = 108; // full adaptive-icon canvas
const ADAPTIVE_SAFE_SCALE = 0.62; // keeps content inside the ~66dp safe zone
const LEGACY_ICON_DP = 48; // pre-API-26 launcher icon canvas
const LEGACY_ICON_SCALE = 0.82;

async function main() {
  await initCodecs();

  const source = await decodeWebp(new Uint8Array(await readFile(SOURCE_LOGO)));
  console.log(`source logo: ${source.width}x${source.height}`);

  const webIconsDir = `${REPO_ROOT}public/icons/`;
  const androidResDir = `${REPO_ROOT}android/app/src/main/res/`;

  // --- Web / PWA icons -----------------------------------------------------
  await writePng(await renderIcon(source, 192, 1, TRANSPARENT), `${webIconsDir}icon-192.png`);
  await writePng(await renderIcon(source, 512, 1, TRANSPARENT), `${webIconsDir}icon-512.png`);
  await writePng(await renderIcon(source, 512, 0.65, DARK_BG), `${webIconsDir}maskable-icon-512.png`);
  await writePng(await renderIcon(source, 180, 0.82, LIGHT_BG), `${webIconsDir}apple-touch-icon.png`);

  // --- Android splash drawable (background color comes from colors.xml) ---
  await writePng(await renderIcon(source, 512, 1, TRANSPARENT), `${androidResDir}drawable/splash.png`);

  // --- Android adaptive icon foreground (transparent, one per density) ----
  for (const [density, mult] of Object.entries(DENSITIES)) {
    const size = Math.round(ADAPTIVE_ICON_DP * mult);
    const img = await renderIcon(source, size, ADAPTIVE_SAFE_SCALE, TRANSPARENT);
    await writePng(img, `${androidResDir}mipmap-${density}/ic_launcher_foreground.png`);
  }

  // --- Android legacy launcher icons (flattened, pre-API-26 fallback) -----
  for (const [density, mult] of Object.entries(DENSITIES)) {
    const size = Math.round(LEGACY_ICON_DP * mult);
    const square = await renderIcon(source, size, LEGACY_ICON_SCALE, DARK_BG);
    await writePng(square, `${androidResDir}mipmap-${density}/ic_launcher.png`);

    const round = await renderIcon(source, size, LEGACY_ICON_SCALE, DARK_BG);
    await writePng(circleMask(round), `${androidResDir}mipmap-${density}/ic_launcher_round.png`);
  }

  // --- Play Console store listing icon (flattened, opaque, 512x512) -------
  await writePng(await renderIcon(source, 512, 0.78, DARK_BG), `${REPO_ROOT}android/store-icon-512.png`);

  console.log("\nDone. Re-run `pnpm generate:icons` any time public/logo.webp changes.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
