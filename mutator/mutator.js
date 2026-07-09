#!/usr/bin/env node
/**
 * NightBuild — Pricing Page Mutator
 *
 * What it does:
 *   Serves the fake pricing pages over local HTTP and advances them
 *   through 3 states, one every 3 minutes. The watcher fetches from this
 *   server on its own schedule and picks up each change on its next tick.
 *
 * Usage:
 *   node mutator/mutator.js   (from the repo root, or anywhere — paths are
 *                              resolved relative to this file, not cwd)
 *
 * Prerequisites:
 *   - Node.js 18+. Nothing else. No git, no GitHub, no remote hosting.
 *
 * State sequence:
 *   State 0 → Baseline. Matches the watcher's providers.json exactly.
 *             Its watcher exits NO_DIFF. (Serve this before the session starts.)
 *   State 1 → Changes planted: PRICE_CHANGE (SynthAI Developer $20→$25),
 *             BENEFIT_CHANGE (OrbitalAI Pro: fine_tuning→vision),
 *             EXTRACTION_WARNING (VectronAI Base: price_amount goes null).
 *             Watcher exits PENDING_APPROVAL.
 *   State 2 → More changes: PRICE_CHANGE (SynthAI Team $60→$75),
 *             PLAN_ADDED (SynthAI Enterprise), PLAN_REMOVED (OrbitalAI Starter),
 *             PLAN_ADDED (OrbitalAI Growth), PRICE_CHANGE + cadence change (VectronAI).
 *             Second diff set after the watcher approves Run 1.
 */

import http from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────────────

// The "remote" pages live inside this repo, not in any external site.
// Resolved relative to this file so it works no matter where you run it from.
const REMOTE_ROOT = resolve(__dirname, "../remote");
const PRICES_DIR = resolve(REMOTE_ROOT, "nightbuild/prices");

// Path to the state fixtures, relative to this script's location.
const STATES_DIR = resolve(__dirname, "states");

// Local server that stands in for the live pricing pages.
const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

// Interval between state changes, in milliseconds.
const INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Total number of states to serve (0, 1, 2).
const TOTAL_STATES = 3;

// Providers whose JSON files are managed.
const PROVIDERS = ["synthai", "orbitalai", "vectronai"];

// ── State descriptions (printed to console) ─────────────────────────────────

const STATE_INFO = [
  {
    label: "State 0 — Baseline",
    description: "Matches the watcher's providers.json. Its watcher will exit NO_DIFF.",
    changes: "No changes from catalogue.",
  },
  {
    label: "State 1 — First change set",
    description: "The watcher will exit PENDING_APPROVAL.",
    changes: [
      "SynthAI Developer: price_amount $20 → $25 (PRICE_CHANGE)",
      "OrbitalAI Pro: fine_tuning removed, vision added (BENEFIT_CHANGE)",
      "VectronAI Base: price_amount null (EXTRACTION_WARNING — not a diff, logged only)",
    ].join("\n    "),
  },
  {
    label: "State 2 — Second change set",
    description: "Triggers a second diff after the watcher approves and updates.",
    changes: [
      "SynthAI Team: price_amount $60 → $75 (PRICE_CHANGE)",
      "SynthAI Enterprise: new plan added (PLAN_ADDED)",
      "OrbitalAI Starter: removed (PLAN_REMOVED)",
      "OrbitalAI Growth: new plan added at $29 (PLAN_ADDED)",
      "VectronAI Base: price_amount $12 → $99, cadence monthly → annual (PRICE_CHANGE x2)",
    ].join("\n    "),
  },
];

// ── Static file server ────────────────────────────────────────────────────────
// Serves everything under REMOTE_ROOT at BASE_URL. This is the entire
// "hosting" layer — no external site, no deploy step.

function startServer() {
  const server = http.createServer((req, res) => {
    const filePath = resolve(REMOTE_ROOT, "." + req.url);

    // Refuse to serve anything outside REMOTE_ROOT.
    if (!filePath.startsWith(REMOTE_ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found", path: req.url }));
      return;
    }

    const contentType = extname(filePath) === ".json" ? "application/json" : "text/plain";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(filePath));
  });

  server.listen(PORT, () => {
    console.log(`[SERVING] ${BASE_URL} → ${REMOTE_ROOT}\n`);
  });

  return server;
}

// ── Write a state ──────────────────────────────────────────────────────────────

function writeState(state) {
  const info = STATE_INFO[state];
  const ts = new Date().toISOString();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Serving ${info.label}`);
  console.log(`Timestamp: ${ts}`);
  console.log(`Changes:\n    ${info.changes}`);
  console.log(`${"─".repeat(60)}\n`);

  if (!existsSync(PRICES_DIR)) {
    mkdirSync(PRICES_DIR, { recursive: true });
    console.log(`Created directory: ${PRICES_DIR}`);
  }

  for (const provider of PROVIDERS) {
    const srcPath = resolve(STATES_DIR, String(state), `${provider}.json`);
    const destPath = resolve(PRICES_DIR, `${provider}.json`);

    const content = JSON.parse(readFileSync(srcPath, "utf8"));
    content._state = state;
    content._updated_at = ts;

    writeFileSync(destPath, JSON.stringify(content, null, 2));
    console.log(`  Wrote ${provider}.json (state ${state})`);
  }

  console.log(`\nLive at ${BASE_URL}/nightbuild/prices/synthai.json`);
  console.log(`${info.description}\n`);
}

// ── Sleep ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMinutes(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         NightBuild — Pricing Page Mutator               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\nPID: ${process.pid}`);
  console.log(`Prices directory: ${PRICES_DIR}`);
  console.log(`States directory: ${STATES_DIR}`);
  console.log(`Interval: ${formatMinutes(INTERVAL_MS)} between states`);
  console.log(`Total states: ${TOTAL_STATES}\n`);
  console.log(`To stop early: kill ${process.pid} (macOS/Linux) or`);
  console.log(`taskkill /F /PID ${process.pid} (Windows)\n`);

  const server = startServer();

  for (let state = 0; state < TOTAL_STATES; state++) {
    writeState(state);

    if (state < TOTAL_STATES - 1) {
      const remaining = TOTAL_STATES - state - 1;
      console.log(`Next state (${state + 1}) in ${formatMinutes(INTERVAL_MS)}.`);
      console.log(`${remaining} state(s) remaining after this wait.\n`);
      await sleep(INTERVAL_MS);
    }
  }

  console.log(`All ${TOTAL_STATES} states served. Holding state ${TOTAL_STATES - 1} for one`);
  console.log(`more interval (${formatMinutes(INTERVAL_MS)}) so the watcher's final scheduled`);
  console.log(`fetch can land, then shutting the server down automatically.\n`);
  await sleep(INTERVAL_MS);

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Grace period elapsed. Stopping server.                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  server.close(() => process.exit(0));
}

main().catch((err) => {
  console.error("\n[FATAL]", err.message);
  process.exit(1);
});
