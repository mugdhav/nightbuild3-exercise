# NightBuild3 Exercise — Harness and Loop Engineering

You will implement the harness and run the participant watcher loop three
times, observing all three exit states the loop is capable of producing.

The instructor runs a separate mutator loop that updates three fake
Artificial Intelligence (AI) provider pricing pages on a public URL every
3 minutes. Your watcher reads those pages, diffs them against your local
catalogue, and halts for your approval before writing any update.

---

## Prerequisites

- Node.js 18 or later. Verify on the command prompt of your local Windows
  machine:

  ```
  node --version
  ```

  On macOS or Linux, run the same command in a terminal.

- Git installed and configured:

  ```
  git --version
  ```

---

## Repo structure

```
nightbuild3-exercise/
├── providers.json          ← your local pricing catalogue (starts intentionally stale)
├── watcher/
│   └── watcher.js          ← the participant loop implementation
├── HARNESS.md              ← harness spec — read before running anything
├── LOOP.md                 ← loop spec — read before running anything
├── DIFF.md                 ← written by the watcher when changes are detected
├── RUN_LOG.md              ← append-only run history
└── APPROVAL.md.template    ← copy this to create APPROVAL.md
```

---

## Step 1 — Clone the repo

On the command prompt of your local Windows machine:

```
git clone https://github.com/mugdhav/nightbuild3-exercise.git
cd nightbuild3-exercise
```

On macOS or Linux, run the same commands in a terminal.

---

## Step 2 — Read the specs

Open `HARNESS.md` and `LOOP.md` before running anything.

`HARNESS.md` defines which files the agent reads and writes in each phase,
the schema-projection contract (the 7 fields extracted per provider page),
the three verification gates, and the two human gates where the loop halts.

`LOOP.md` defines the five exit states, the full iteration structure from
fetch through report through update, and the retry policy per failure type.

The watcher in `watcher/watcher.js` is a direct implementation of those
specs. Trace each action in the terminal output back to the relevant
section of the spec as you run the steps below.

---

## Step 3 — Confirm the live pricing pages are reachable

Wait for the instructor's signal that State 0 (baseline) is live. Then
verify on the command prompt of your local Windows machine:

```
curl https://www.vmugdha.in/nightbuild/prices/synthai.json
```

On macOS or Linux:

```
curl https://www.vmugdha.in/nightbuild/prices/synthai.json
```

Expected output: a JSON object containing `"provider": "SynthAI"` and
`"_state": 0`. If the request fails or `_state` is not `0`, notify the
instructor before continuing.

---

## Step 4 — Start the watcher

Wait for the instructor's signal that State 1 has been pushed. Then start
the watcher on a 3-minute schedule.

On the command prompt of your local Windows machine:

```
node watcher/watcher.js --schedule
```

On macOS or Linux:

```
node watcher/watcher.js --schedule
```

Leave this terminal open. The watcher runs immediately, then every 3 minutes.

---

## Run 1 — PENDING_APPROVAL

The watcher fetches all three provider pages, projects the schema fields,
and diffs the result against `providers.json`.

Expected terminal output:

```
Phase 1: Fetching provider pages...
Phase 2: Diffing against catalogue...
Phase 3: Writing DIFF.md (2 change(s), 1 warning(s))...

[DIFF.md written] 2 change(s), 1 warning(s)
[ACTION REQUIRED] Write APPROVAL.md, then re-run the watcher.
```

Open `DIFF.md`. Before proceeding, verify all three of the following:

- `SynthAI / Developer / price_amount` is classified as `PRICE_CHANGE`.
  The catalogue holds `20.00`; the page now returns `25.00`.
- `OrbitalAI / Pro / feature_flags` is classified as `BENEFIT_CHANGE`.
  `fine_tuning` was removed and `vision` was added.
- `VectronAI / Base / price_amount` appears under **Extraction warnings**,
  not under Changes. The page returned `null` for this field. The harness
  treats a field going null as a potential scrape failure, not a confirmed
  pricing change, so it logs the warning and does not block on approval.

The loop has halted at the first human gate defined in `HARNESS.md`.

---

## Step 5 — Write APPROVAL.md

Copy `APPROVAL.md.template` to `APPROVAL.md`.

On the command prompt of your local Windows machine:

```
copy APPROVAL.md.template APPROVAL.md
```

On macOS or Linux:

```
cp APPROVAL.md.template APPROVAL.md
```

Open `APPROVAL.md` in any text editor and fill in:

- `RUN_ID`: copy the value exactly from the top of `DIFF.md`.
  Format: `YYYY-MM-DD-HH:MM`.
- `REVIEWED_BY`: your name or any identifier.
- `REVIEWED_AT`: current date and time in ISO 8601 format.
  Example: `2025-07-04T09:30:00Z`.

Set `STATUS: APPROVED` and save the file. The completed file:

```
RUN_ID: 2025-07-04-09:25
STATUS: APPROVED
REASON: Verified SynthAI price increase and OrbitalAI feature swap
REVIEWED_BY: your-name
REVIEWED_AT: 2025-07-04T09:30:00Z
```

The watcher validates this file strictly. A missing `RUN_ID` or `STATUS`
exits with `ERROR` rather than proceeding.

---

## Run 2 — UPDATED

On its next 3-minute tick, the watcher detects `PENDING_APPROVAL` in
`RUN_LOG.md`, reads `APPROVAL.md`, and runs Gate 3 from `HARNESS.md`:

1. `APPROVAL.md` exists and contains `STATUS: APPROVED`.
2. The `RUN_ID` in `APPROVAL.md` matches the pending run.
3. The approved diff has not already been applied.

Expected terminal output:

```
[STATE] Prior run <id> is PENDING_APPROVAL.
[APPROVAL] Approved. Loading last diff for update...
[providers.json updated]
[APPROVAL.md deleted — consumed]
```

Open `providers.json` and verify:

- `SynthAI / Developer / price_amount` is `25.00`.
- `OrbitalAI / Pro / feature_flags` contains `vision`, not `fine_tuning`.
- `VectronAI / Base / price_amount` is still `12.00`. The extraction
  warning was not applied as a diff.

`APPROVAL.md` has been deleted. A consumed approval cannot be replayed.

---

## Run 3 — NO_DIFF or second PENDING_APPROVAL

On the next tick, one of two things happens depending on whether the
instructor has pushed State 2.

**State 2 not yet live:** the watcher finds no classified diffs against
the now-updated `providers.json` and exits `NO_DIFF`.

**State 2 live:** the watcher finds a second set of changes and exits
`PENDING_APPROVAL`. `DIFF.md` is overwritten with the new report.
Repeat Steps 5 and 6 to approve and apply.

Read `RUN_LOG.md` after Run 3. A complete three-run session shows:

```
... | PENDING_APPROVAL | providers_checked=3 | diffs=2 | warnings=1
... | UPDATED          | applied_from_approval=true
... | NO_DIFF          | providers_checked=3 | diffs=0 | warnings=1
```

---

## Stopping the watcher

Press `Ctrl+C` in the terminal running `--schedule`.

---

## What the watcher does not do (by design)

Read the **Honest limitations** section in `HARNESS.md` and the **What
this loop does not handle** section in `LOOP.md`. These are intentional
exclusions. For each one, identify what additional component it would
require and where in the iteration structure it would be inserted.

---

## Extension exercises

**Trigger ERROR.** Set one `pricing_url` in `providers.json` to an
invalid URL and run a single tick:

```
node watcher/watcher.js
```

Read the error in `RUN_LOG.md`, then restore the correct URL.

**Trigger ID_MISMATCH.** Write `APPROVAL.md` with a `RUN_ID` that does
not match the pending run. Observe Gate 3 reject it. Find the Gate 3
check in `watcher/watcher.js`.

**Trigger REJECTED.** Write `APPROVAL.md` with `STATUS: REJECTED` and a
`REASON`. Run the watcher and read the log entry. Note that a rejection
discards the diff and starts a fresh fetch on the next tick.
