#!/usr/bin/env node
/**
 * NightBuild Exercise — Pricing Watcher
 *
 * Implements the loop defined in LOOP.md.
 *
 * Single run:  node watcher.js  (from inside watcher/)
 * Scheduled:   node watcher.js --schedule  (from inside watcher/)
 *
 * In --schedule mode, the watcher runs immediately, then every 3 minutes,
 * for a maximum of 3 iterations. It exits automatically after the third run.
 * This matches the mutator's 3-state sequence: each watcher iteration
 * corresponds to one mutator state push.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // all state files live alongside watcher.js in watcher/

// ── File paths ────────────────────────────────────────────────────────────────
const PROVIDERS_PATH = path.join(ROOT, "providers.json");
const DIFF_PATH = path.join(ROOT, "DIFF.md");
const APPROVAL_PATH = path.join(ROOT, "APPROVAL.md");
const RUN_LOG_PATH = path.join(ROOT, "RUN_LOG.md");

// ── Utilities ─────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString();
}

function runId() {
  const now = new Date();
  return `${now.toISOString().slice(0, 16).replace("T", "-")}`;
}

function appendLog(line) {
  fs.appendFileSync(RUN_LOG_PATH, line + "\n");
  console.log("[RUN_LOG]", line);
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ── Phase: check for pending approval from a prior run ────────────────────────
function checkPendingApproval() {
  if (!fs.existsSync(RUN_LOG_PATH)) return null;
  const log = fs.readFileSync(RUN_LOG_PATH, "utf8");
  const lines = log.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  if (!last.includes("PENDING_APPROVAL")) return null;
  // Extract run_id from the last PENDING_APPROVAL line
  const match = last.match(/\|\s*([\d\-T:]+)\s*\|/);
  return match ? match[1].trim() : null;
}

// ── Phase: fetch + schema-project each provider ───────────────────────────────
async function fetchAndProject(provider) {
  const ts = timestamp();
  console.log(`  Fetching ${provider.name} → ${provider.pricing_url}`);

  let body;
  try {
    const res = await fetch(provider.pricing_url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return { warning: `HTTP ${res.status}`, providerId: provider.id };
    }
    body = await res.json();
  } catch (err) {
    return { warning: err.message, providerId: provider.id };
  }

  // Schema-project: extract only the fields the harness cares about.
  // Raw HTML/JSON from the source is never passed directly to the diff.
  const projected = (body.plans || []).map((plan) => ({
    plan_name: plan.plan_name ?? null,
    price_amount: plan.price_amount ?? null,
    price_currency: plan.price_currency ?? null,
    price_cadence: plan.price_cadence ?? null,
    included_units: plan.included_units ?? null,
    feature_flags: plan.feature_flags ?? null,
    page_last_seen: ts,
  }));

  return { providerId: provider.id, providerName: provider.name, plans: projected };
}

// ── Phase: classify diffs between projected data and providers.json ───────────
function classifyDiffs(providerId, providerName, projectedPlans, cataloguePlans) {
  const diffs = [];
  const warnings = [];

  const catalogueByName = Object.fromEntries(cataloguePlans.map((p) => [p.plan_name, p]));
  const projectedByName = Object.fromEntries(projectedPlans.map((p) => [p.plan_name, p]));

  // Check for PLAN_ADDED
  for (const name of Object.keys(projectedByName)) {
    if (!catalogueByName[name]) {
      diffs.push({ providerId, providerName, plan: name, classification: "PLAN_ADDED", field: "plan_name", from: null, to: name });
    }
  }

  // Check for PLAN_REMOVED
  for (const name of Object.keys(catalogueByName)) {
    if (!projectedByName[name]) {
      diffs.push({ providerId, providerName, plan: name, classification: "PLAN_REMOVED", field: "plan_name", from: name, to: null });
    }
  }

  // Check field-level changes on matching plans
  for (const name of Object.keys(projectedByName)) {
    if (!catalogueByName[name]) continue;
    const projected = projectedByName[name];
    const catalogue = catalogueByName[name];

    // EXTRACTION_WARNING: field went null in projected but was non-null in catalogue
    for (const field of ["price_amount", "price_currency", "price_cadence", "included_units", "feature_flags"]) {
      if (projected[field] === null && catalogue[field] !== null) {
        warnings.push({ providerId, providerName, plan: name, field, reason: "field null in projected output; may be a scrape failure" });
      }
    }

    // PRICE_CHANGE
    if (projected.price_amount !== null && projected.price_amount !== catalogue.price_amount) {
      diffs.push({ providerId, providerName, plan: name, classification: "PRICE_CHANGE", field: "price_amount", from: catalogue.price_amount, to: projected.price_amount });
    }
    if (projected.price_cadence !== null && projected.price_cadence !== catalogue.price_cadence) {
      diffs.push({ providerId, providerName, plan: name, classification: "PRICE_CHANGE", field: "price_cadence", from: catalogue.price_cadence, to: projected.price_cadence });
    }

    // BENEFIT_CHANGE — feature_flags
    if (projected.feature_flags !== null) {
      const added = projected.feature_flags.filter((f) => !catalogue.feature_flags.includes(f));
      const removed = catalogue.feature_flags.filter((f) => !projected.feature_flags.includes(f));
      if (added.length > 0 || removed.length > 0) {
        diffs.push({
          providerId, providerName, plan: name, classification: "BENEFIT_CHANGE", field: "feature_flags",
          from: catalogue.feature_flags, to: projected.feature_flags,
          added, removed,
        });
      }
    }

    // BENEFIT_CHANGE — included_units
    if (projected.included_units !== null) {
      const unitKeys = new Set([...Object.keys(catalogue.included_units || {}), ...Object.keys(projected.included_units)]);
      for (const key of unitKeys) {
        if (projected.included_units[key] !== catalogue.included_units?.[key]) {
          diffs.push({
            providerId, providerName, plan: name, classification: "BENEFIT_CHANGE", field: `included_units.${key}`,
            from: catalogue.included_units?.[key] ?? null, to: projected.included_units[key] ?? null,
          });
        }
      }
    }
  }

  return { diffs, warnings };
}

// ── Phase: write DIFF.md ──────────────────────────────────────────────────────
function writeDiff(id, allDiffs, allWarnings) {
  const groupByProvider = {};
  for (const d of allDiffs) {
    if (!groupByProvider[d.providerName]) groupByProvider[d.providerName] = [];
    groupByProvider[d.providerName].push(d);
  }

  let md = `# Pricing Diff Report\nrun_id: ${id}\ngenerated: ${timestamp()}\nstatus: PENDING_APPROVAL\n\n`;
  md += `## Changes (${allDiffs.length} found)\n\n`;

  for (const [name, diffs] of Object.entries(groupByProvider)) {
    md += `### ${name}\n\n`;
    md += `| Plan | Field | Classification | Current (providers.json) | Detected on page |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const d of diffs) {
      const from = Array.isArray(d.from) ? d.from.join(", ") : String(d.from);
      const to = Array.isArray(d.to) ? d.to.join(", ") : String(d.to);
      md += `| ${d.plan} | ${d.field} | ${d.classification} | ${from} | ${to} |\n`;
    }
    md += "\n";
  }

  if (allWarnings.length > 0) {
    md += `## Extraction warnings (${allWarnings.length} found)\n\n`;
    md += `| Provider | Plan | Field | Reason |\n|---|---|---|---|\n`;
    for (const w of allWarnings) {
      md += `| ${w.providerName} | ${w.plan} | ${w.field} | ${w.reason} |\n`;
    }
    md += "\n";
  }

  md += `---\n\n## Instructions for approver\n\n`;
  md += `To approve: copy \`APPROVAL.md.template\`, fill in \`RUN_ID: ${id}\`, set \`STATUS: APPROVED\`, and save as \`APPROVAL.md\`.\n`;
  md += `To reject:  same process but set \`STATUS: REJECTED\` and add \`REASON: your reason\`.\n`;

  fs.writeFileSync(DIFF_PATH, md);
  console.log(`\n[DIFF.md written] ${allDiffs.length} change(s), ${allWarnings.length} warning(s)`);
  console.log("[ACTION REQUIRED] Write APPROVAL.md, then re-run the watcher.\n");
}

// ── Phase: validate APPROVAL.md ───────────────────────────────────────────────
function readApproval(expectedRunId) {
  if (!fs.existsSync(APPROVAL_PATH)) return null;
  const raw = fs.readFileSync(APPROVAL_PATH, "utf8");
  const fields = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) fields[key.trim()] = rest.join(":").trim();
  }
  if (!fields.RUN_ID || !fields.STATUS) {
    console.error("[ERROR] APPROVAL.md is malformed. Required fields: RUN_ID, STATUS.");
    return "MALFORMED";
  }
  if (fields.RUN_ID !== expectedRunId) {
    console.error(`[ERROR] APPROVAL.md RUN_ID mismatch. Expected: ${expectedRunId}, found: ${fields.RUN_ID}`);
    return "ID_MISMATCH";
  }
  return fields.STATUS.toUpperCase() === "APPROVED" ? "APPROVED" : "REJECTED";
}

// ── Phase: apply approved diffs to providers.json ─────────────────────────────
async function applyUpdate(runBuffer) {
  const catalogue = readJSON(PROVIDERS_PATH);

  for (const [providerId, projected] of Object.entries(runBuffer)) {
    const provider = catalogue.providers.find((p) => p.id === providerId);
    if (!provider) continue;

    const projectedByName = Object.fromEntries(projected.plans.map((p) => [p.plan_name, p]));

    for (const plan of provider.plans) {
      const updated = projectedByName[plan.plan_name];
      if (!updated) continue;

      if (updated.price_amount !== null) plan.price_amount = updated.price_amount;
      if (updated.price_cadence !== null) plan.price_cadence = updated.price_cadence;
      if (updated.feature_flags !== null) plan.feature_flags = updated.feature_flags;
      if (updated.included_units !== null) plan.included_units = updated.included_units;
      plan.page_last_seen = updated.page_last_seen;
    }
  }

  fs.writeFileSync(PROVIDERS_PATH, JSON.stringify(catalogue, null, 2));
  console.log("[providers.json updated]");
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function runWatcher() {
  const id = runId();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pricing Watcher — run ${id}`);
  console.log(`${"=".repeat(60)}\n`);

  // Session start: check for pending approval from a prior run
  const pendingRunId = checkPendingApproval();
  if (pendingRunId) {
    console.log(`[STATE] Prior run ${pendingRunId} is PENDING_APPROVAL.`);
    const approval = readApproval(pendingRunId);
    if (approval === "APPROVED") {
      console.log("[APPROVAL] Approved. Loading last diff for update...");
      // Re-fetch to apply. In production this would read the run_buffer from disk.
      // For the exercise, re-fetch now.
      const catalogue = readJSON(PROVIDERS_PATH);
      const runBuffer = {};
      for (const provider of catalogue.providers) {
        const result = await fetchAndProject(provider);
        if (!result.warning) runBuffer[result.providerId] = result;
      }
      await applyUpdate(runBuffer);
      appendLog(`${timestamp()} | ${pendingRunId} | UPDATED | applied_from_approval=true`);
      // Remove APPROVAL.md so it isn't re-processed next run
      fs.unlinkSync(APPROVAL_PATH);
      console.log("[APPROVAL.md deleted — consumed]\n");
      return;
    } else if (approval === "REJECTED") {
      const raw = fs.readFileSync(APPROVAL_PATH, "utf8");
      const reason = raw.match(/REASON:\s*(.+)/)?.[1] ?? "no reason given";
      appendLog(`${timestamp()} | ${pendingRunId} | REJECTED | reason=${reason}`);
      fs.unlinkSync(APPROVAL_PATH);
      console.log("[REJECTED] Changes discarded. Starting a fresh run.\n");
      // Fall through to a new fetch run
    } else if (approval === "MALFORMED" || approval === "ID_MISMATCH") {
      appendLog(`${timestamp()} | ${pendingRunId} | ERROR | approval_check_failed=${approval}`);
      console.error("[HALTED] Fix APPROVAL.md and re-run.\n");
      return;
    } else {
      // No APPROVAL.md yet — still waiting
      console.log("[WAITING] No APPROVAL.md found yet. Nothing to do.\n");
      return;
    }
  }

  // FETCH PHASE
  console.log("Phase 1: Fetching provider pages...\n");
  const catalogue = readJSON(PROVIDERS_PATH);
  const runBuffer = {};
  const fetchWarnings = [];
  let fetchedCount = 0;

  for (const provider of catalogue.providers) {
    const result = await fetchAndProject(provider);
    if (result.warning) {
      fetchWarnings.push({ providerName: provider.name, reason: result.warning });
      console.log(`  [WARNING] ${provider.name}: ${result.warning}`);
    } else {
      runBuffer[result.providerId] = result;
      fetchedCount++;
    }
  }

  const total = catalogue.providers.length;
  const warningRate = (total - fetchedCount) / total;
  if (warningRate > 0.30) {
    appendLog(`${timestamp()} | ${id} | ERROR | fetch_warning_rate=${(warningRate * 100).toFixed(0)}%`);
    console.error("\n[ERROR] More than 30% of providers failed to fetch. Loop halted.");
    console.error("Check network access to the fixture URLs in providers.json.\n");
    return;
  }

  // DIFF PHASE
  console.log("\nPhase 2: Diffing against catalogue...\n");
  const allDiffs = [];
  const allWarnings = [];

  for (const [providerId, projected] of Object.entries(runBuffer)) {
    const catalogueProvider = catalogue.providers.find((p) => p.id === providerId);
    const { diffs, warnings } = classifyDiffs(
      providerId, projected.providerName,
      projected.plans, catalogueProvider.plans
    );
    allDiffs.push(...diffs);
    allWarnings.push(...warnings);
  }

  if (allDiffs.length === 0) {
    // Warnings without diffs: log them but do not require approval.
    // Extraction warnings are informational — they may indicate a scrape
    // failure, not a real pricing change. A human should monitor the
    // warning count in RUN_LOG.md over time, not approve every occurrence.
    appendLog(`${timestamp()} | ${id} | NO_DIFF | providers_checked=${fetchedCount} | diffs=0 | warnings=${allWarnings.length}`);
    if (allWarnings.length > 0) {
      console.log(`[NO_DIFF] No pricing changes found. ${allWarnings.length} extraction warning(s) logged.\n`);
      console.log("Extraction warnings (field went null — may be a scrape failure, not a real change):");
      for (const w of allWarnings) {
        console.log(`  ${w.providerName} / ${w.plan} / ${w.field}: ${w.reason}`);
      }
      console.log();
    } else {
      console.log("[NO_DIFF] Catalogue is current. Nothing to update.\n");
    }
    return;
  }

  // REPORT PHASE — only reached when at least one classified diff exists
  console.log(`\nPhase 3: Writing DIFF.md (${allDiffs.length} change(s), ${allWarnings.length} warning(s))...\n`);
  writeDiff(id, allDiffs, allWarnings);
  appendLog(`${timestamp()} | ${id} | PENDING_APPROVAL | providers_checked=${fetchedCount} | diffs=${allDiffs.length} | warnings=${allWarnings.length}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
const SCHEDULE_MS    = 3 * 60 * 1000; // 3 minutes — matches the mutator push interval
const MAX_ITERATIONS = 3;             // matches the mutator's 3-state sequence

if (process.argv.includes("--schedule")) {
  console.log(`[SCHEDULED] Watcher will run every 3 minutes, ${MAX_ITERATIONS} times, then exit.\n`);

  let iteration = 0;

  async function tick() {
    iteration++;
    console.log(`[ITERATION ${iteration}/${MAX_ITERATIONS}]\n`);
    await runWatcher();
    if (iteration >= MAX_ITERATIONS) {
      console.log(`\n[DONE] ${MAX_ITERATIONS} iterations complete. Watcher exiting.\n`);
      process.exit(0);
    }
  }

  tick();
  setInterval(tick, SCHEDULE_MS);
} else {
  runWatcher();
}
