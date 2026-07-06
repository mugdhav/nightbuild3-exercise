#!/usr/bin/env node
/**
 * NightBuild — Pricing Page Mutator
 *
 * Run this script from inside your website repo (the repo that publishes
 * to www.vmugdha.in via GitHub Pages).
 *
 * What it does:
 *   Advances the fake pricing pages through 3 states, one every 3 minutes.
 *   Each state is committed and pushed so GitHub Pages serves the update
 *   within ~30 seconds. Participant watchers pick up the change on their
 *   next scheduled tick.
 *
 * Usage (run from your website repo root):
 *   node path/to/mutator.js
 *
 * Prerequisites:
 *   - Git is installed and configured with push access to the website repo.
 *   - GitHub Pages is enabled on the repo and serving from the correct branch.
 *   - The nightbuild/prices/ directory exists (or will be created on first run).
 *
 * State sequence:
 *   State 0 → Baseline. Matches participants' providers.json exactly.
 *             Their watcher exits NO_DIFF. (Run before the session starts.)
 *   State 1 → Changes planted: PRICE_CHANGE (SynthAI Developer $20→$25),
 *             BENEFIT_CHANGE (OrbitalAI Pro: fine_tuning→vision),
 *             EXTRACTION_WARNING (VectronAI Base: price_amount goes null).
 *             Participant watcher exits PENDING_APPROVAL.
 *   State 2 → More changes: PRICE_CHANGE (SynthAI Team $60→$75),
 *             PLAN_ADDED (SynthAI Enterprise), PLAN_REMOVED (OrbitalAI Starter),
 *             PLAN_ADDED (OrbitalAI Growth), PRICE_CHANGE + cadence change (VectronAI).
 *             Second diff set after participants approve Run 1.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────────────

// Path to the nightbuild/prices/ directory inside the website repo.
// This script is run from the website repo root, so this is relative to cwd.
const PRICES_DIR = resolve(process.cwd(), "nightbuild/prices");

// Path to the state directories, relative to this script's location.
const STATES_DIR = resolve(__dirname, "states");

// Git commit author shown in the repo history.
const GIT_AUTHOR = "NightBuild Mutator <nightbuild@vmugdha.in>";

// Interval between state pushes, in milliseconds.
const INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Total number of states to push (0, 1, 2).
const TOTAL_STATES = 3;

// Providers whose JSON files are managed.
const PROVIDERS = ["synthai", "orbitalai", "vectronai"];

// ── State descriptions (printed to console for the instructor) ─────────────────

const STATE_INFO = [
  {
    label: "State 0 — Baseline",
    description: "Matches participants' providers.json. Their watcher will exit NO_DIFF.",
    changes: "No changes from catalogue.",
  },
  {
    label: "State 1 — First change set",
    description: "Participants' watcher will exit PENDING_APPROVAL.",
    changes: [
      "SynthAI Developer: price_amount $20 → $25 (PRICE_CHANGE)",
      "OrbitalAI Pro: fine_tuning removed, vision added (BENEFIT_CHANGE)",
      "VectronAI Base: price_amount null (EXTRACTION_WARNING — not a diff, logged only)",
    ].join("\n    "),
  },
  {
    label: "State 2 — Second change set",
    description: "Triggers a second diff after participants approve and update.",
    changes: [
      "SynthAI Team: price_amount $60 → $75 (PRICE_CHANGE)",
      "SynthAI Enterprise: new plan added (PLAN_ADDED)",
      "OrbitalAI Starter: removed (PLAN_REMOVED)",
      "OrbitalAI Growth: new plan added at $29 (PLAN_ADDED)",
      "VectronAI Base: price_amount $12 → $99, cadence monthly → annual (PRICE_CHANGE x2)",
    ].join("\n    "),
  },
];

// ── Git helpers ────────────────────────────────────────────────────────────────

function git(command, options = {}) {
  try {
    const output = execSync(`git ${command}`, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: options.silent ? "pipe" : "inherit",
    });
    return output?.trim() ?? "";
  } catch (err) {
    throw new Error(`git ${command} failed: ${err.message}`);
  }
}

function currentBranch() {
  return git("rev-parse --abbrev-ref HEAD", { silent: true });
}

// ── Push a state ──────────────────────────────────────────────────────────────

function pushState(state) {
  const info = STATE_INFO[state];
  const ts = new Date().toISOString();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Pushing ${info.label}`);
  console.log(`Timestamp: ${ts}`);
  console.log(`Changes:\n    ${info.changes}`);
  console.log(`${"─".repeat(60)}\n`);

  // Ensure the prices directory exists in the website repo.
  if (!existsSync(PRICES_DIR)) {
    mkdirSync(PRICES_DIR, { recursive: true });
    console.log(`Created directory: ${PRICES_DIR}`);
  }

  // Copy each provider's JSON for this state into the prices directory,
  // injecting a _state and _updated_at field so participants can verify
  // they are reading the correct version.
  for (const provider of PROVIDERS) {
    const srcPath = resolve(STATES_DIR, String(state), `${provider}.json`);
    const destPath = resolve(PRICES_DIR, `${provider}.json`);

    const content = JSON.parse(readFileSync(srcPath, "utf8"));
    content._state = state;
    content._updated_at = ts;

    writeFileSync(destPath, JSON.stringify(content, null, 2));
    console.log(`  Wrote ${provider}.json (state ${state})`);
  }

  // Stage, commit, push.
  git(`add ${PRICES_DIR}`);

  const commitMsg = `nightbuild: pricing state ${state} — ${info.label} [${ts}]`;
  // Use --allow-empty in case a re-run pushes the same state twice.
  git(`commit --allow-empty -m "${commitMsg}" --author="${GIT_AUTHOR}"`);

  const branch = currentBranch();
  git(`push origin ${branch}`);

  console.log(`\nPushed to origin/${branch}.`);
  console.log(`GitHub Pages will serve the update within ~30 seconds.`);
  console.log(`Verify: https://www.vmugdha.in/nightbuild/prices/synthai.json\n`);
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
  console.log(`\nRunning from: ${process.cwd()}`);
  console.log(`Prices directory: ${PRICES_DIR}`);
  console.log(`States directory: ${STATES_DIR}`);
  console.log(`Interval: ${formatMinutes(INTERVAL_MS)} between states`);
  console.log(`Total states: ${TOTAL_STATES} (will exit after state ${TOTAL_STATES - 1})\n`);

  // Confirm git status before starting.
  try {
    const status = git("status --short", { silent: true });
    if (status) {
      console.warn("[WARNING] Working tree has uncommitted changes:");
      console.warn(status);
      console.warn("The mutator will commit its own changes on top of these.\n");
    }
  } catch {
    console.error("[ERROR] Not inside a git repository or git is not installed.");
    process.exit(1);
  }

  for (let state = 0; state < TOTAL_STATES; state++) {
    pushState(state);

    if (state < TOTAL_STATES - 1) {
      const remaining = TOTAL_STATES - state - 1;
      console.log(`Next state (${state + 1}) in ${formatMinutes(INTERVAL_MS)}.`);
      console.log(`${remaining} state(s) remaining after this wait.\n`);
      await sleep(INTERVAL_MS);
    }
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Mutator complete. All 3 states pushed. Exiting.        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\n[FATAL]", err.message);
  process.exit(1);
});
