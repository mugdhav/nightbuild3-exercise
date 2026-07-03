# HARNESS.md — Provider Pricing Watcher

## Purpose

Constrain and orient an agent that monitors AI provider pricing pages
for plan or benefit changes, compares them against a canonical JSON
catalogue, and requests human approval before writing any update.

This harness is **read-only by default**. The agent fetches and compares;
it never mutates `providers.json` without an explicit approval signal.

---

## State files

| File | Role | Mutated by |
|---|---|---|
| `providers.json` | Canonical pricing catalogue (source of truth) | Human (on approval only) |
| `DIFF.md` | Structured diff report from most recent run | Agent (overwritten each run) |
| `APPROVAL.md` | Human decision record: approve/reject + rationale | Human |
| `RUN_LOG.md` | Timestamped run history with outcomes | Agent (append-only) |

---

## Context loaded on every run

```
providers.json          — full current catalogue
DIFF.md                 — previous run's diff (for continuity awareness)
RUN_LOG.md (last 5 entries)  — recent run history, not full file
```

Do not load `APPROVAL.md` into context unless the loop is in
`PENDING_APPROVAL` state. It is a human artefact, not agent input.

---

## Tool scoping

| Phase | Permitted tools | Blocked tools |
|---|---|---|
| Fetch | HTTP GET (provider URLs only, from `providers.json`) | File write, shell exec |
| Project | Schema-projection extractor | DOM traversal, full-page dump |
| Diff | JSON diff against `providers.json` | Any write to `providers.json` |
| Report | Write to `DIFF.md`, append to `RUN_LOG.md` | Write to `providers.json`, `APPROVAL.md` |
| Update | Write to `providers.json` | All network calls |

The Update phase is **only reachable when `APPROVAL.md` contains an
unprocessed `APPROVED` signal** for the current diff run ID.

---

## Schema-projection contract

The agent must not pass raw HTML to the diff engine.
For each provider page, extract only these fields:

```
plan_name        string   — exact plan label as shown on the page
price_amount     number   — numeric value only, no currency symbol
price_currency   string   — ISO 4217 code (USD, EUR, GBP)
price_cadence    string   — "monthly" | "annual" | "one-time"
included_units   object   — key: unit type, value: quantity or "unlimited"
feature_flags    string[] — list of named capabilities (no prose)
page_last_seen   string   — ISO 8601 timestamp of fetch
```

If a field cannot be reliably extracted, set it to `null` and flag it
in `DIFF.md` under `extraction_warnings`. Do not infer missing values.

Layout changes, navigation updates, and copy rewrites that do not affect
the above fields are **not diffs**. Discard them before comparison.

---

## Permissions

```
ALLOW  network.fetch WHERE url IN providers[*].pricing_url
DENY   network.fetch WHERE url NOT IN providers[*].pricing_url
DENY   file.write WHERE path == "providers.json" AND approval_state != "APPROVED"
DENY   file.write WHERE path == "APPROVAL.md"
DENY   shell.exec
```

---

## Verification gates

**Gate 1 — Schema validation (before diff):**
Projected output must validate against the schema-projection contract.
Any `null` field that was non-null in `providers.json` is an
`extraction_warning`, not a diff.

**Gate 2 — Diff classification (before report):**
Each detected change must be classified:

- `PRICE_CHANGE` — `price_amount` or `price_cadence` changed.
- `PLAN_ADDED` — new `plan_name` not present in `providers.json`.
- `PLAN_REMOVED` — `plan_name` in `providers.json` not found on page.
- `BENEFIT_CHANGE` — `included_units` or `feature_flags` changed.
- `EXTRACTION_WARNING` — field went null; may be a scrape failure, not a real change.

Do not write a `DIFF.md` containing only `EXTRACTION_WARNING` entries
without also logging the raw extraction output for human review.

**Gate 3 — Approval check (before update):**
Before any write to `providers.json`, verify:

1. `APPROVAL.md` exists and contains `STATUS: APPROVED`.
2. The `RUN_ID` in `APPROVAL.md` matches the current diff run ID.
3. The approved diff has not already been applied (check `RUN_LOG.md`).

If any check fails, abort the update phase and log the failure to
`RUN_LOG.md`. Do not retry automatically.

---

## Human gates

The agent pauses and waits for human action at two points:

```
DIFF_FOUND → write DIFF.md → [PAUSE: notify human, wait for APPROVAL.md]
APPROVED   → apply update → write RUN_LOG.md entry → [PAUSE: confirm to human]
```

The agent never self-approves. Approval signals must come from a human
writing to `APPROVAL.md` outside the agent session.

---

## Session protocol

On start:
1. Read `providers.json`, `DIFF.md`, and the last 5 lines of `RUN_LOG.md`.
2. Check `RUN_LOG.md` for `PENDING_APPROVAL` state. If found, read `APPROVAL.md`
   and branch to Update phase if approved, or idle if not yet actioned.
3. If no pending state, begin a new fetch run.

On end:
1. Append a run summary to `RUN_LOG.md` with: timestamp, run ID, providers checked,
   diff count by classification, and final state (`NO_DIFF | PENDING_APPROVAL | UPDATED | ERROR`).
2. Do not modify `providers.json` or `APPROVAL.md` during session teardown.

---

## Model tier

| Phase | Tier | Reason |
|---|---|---|
| Schema projection + diff classification | sonnet-tier | Structured extraction, deterministic classification |
| Diff report writing | haiku-tier | Templated output against a known format |
| Approval check + update | sonnet-tier | State logic must be correct; no ambiguity permitted |

Do not escalate to opus-tier unless extraction failures exceed 30% of
providers in a single run. That pattern indicates a structural page change
requiring human review of the schema-projection contract itself.

---

## Honest limitations

**Schema projection is brittle against major redesigns.**
If a provider overhauls their pricing page structure, the extractor will
produce `null` fields rather than wrong data (by design), but a full
catalogue blackout will look like 100% extraction failures, not a harness
error. Add a rate-of-null threshold alert to distinguish the two.

**Approval signal is file-based, not authenticated.**
`APPROVAL.md` written by any process will be treated as valid. In
production, gate the Update phase on a signed or authenticated approval
signal (webhook from a human-operated interface, not a file write).

**`providers.json` has no schema version.**
If the catalogue schema changes, old `DIFF.md` reports become incomparable.
Add a `schema_version` field to `providers.json` and validate it matches
the harness's expected version on every run start.
