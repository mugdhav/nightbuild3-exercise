# NightBuild3 Exercise — Pricing Watcher

## What this is

The watcher is a goal-conditioned loop that runs every 3 minutes for
exactly 3 iterations, then exits. Each iteration fetches three fake
Artificial Intelligence (AI) provider pricing pages from a locally
served URL, diffs the result against your local catalogue
(`providers.json`), and halts for your approval before applying any
update.

You separately run a mutator loop (see `mutator/`) that serves those
pages from `http://localhost:8787/nightbuild/prices/` and changes them
on a matching 3-minute schedule — the pages live inside this repo. The
watcher detects those changes as they land — a diff is just a mismatch between the prices the
mutator is currently serving and what's in your local catalogue, caused
by the mutator periodically changing them while your local copy stays
fixed until you approve an update.

You don't run `watcher.js` at a terminal yourself. You ask a coding agent
(Claude Code, Codex, Antigravity, Cursor, or similar) to run the loop for
you. The agent is the thing `HARNESS.md` and `LOOP.md` are written to
constrain — it invokes `watcher.js`, reports each diff to you
conversationally, asks you to approve bringing the local catalogue into
alignment with the remote pages, and writes `APPROVAL.md` itself once you
say yes. You never hand-edit `APPROVAL.md`.

---

## Prerequisites

- Node.js 18 or later:

  ```
  node --version
  ```

- Git installed:

  ```
  git --version
  ```

---

## Files in this folder

```
watcher/
├── watcher.js            ← the loop — your agent runs this
├── providers.json        ← your local catalogue (starts intentionally stale)
├── HARNESS.md             ← harness spec: read before running
├── LOOP.md                ← loop spec: read before running
├── DIFF.md                ← written by the watcher when changes are detected
├── RUN_LOG.md             ← append-only run history
└── APPROVAL.md.template  ← the format your agent writes APPROVAL.md in
```

---

## Step 1 — Clone the repo

```
git clone https://github.com/mugdhav/nightbuild3-exercise.git
cd nightbuild3-exercise/watcher
```

---

## Step 2 — Read the specs

Open `HARNESS.md` and `LOOP.md` before running anything.

`HARNESS.md` defines which files the agent reads and writes in each phase,
the schema-projection contract (the 7 fields extracted per provider page),
the three verification gates, and the two human gates where the loop halts.

`LOOP.md` defines the five exit states, the full iteration structure from
fetch through report through update, and the retry policy per failure type.

`watcher.js` is a direct implementation of those specs. Trace each action
in the terminal output back to the relevant section of the spec as you
go.

---

## Step 3 — Confirm the live pricing pages are reachable

Wait for State 0 (baseline) to be live — you'll know because you just ran
the mutator and it printed the State 0 write.

```
curl http://localhost:8787/nightbuild/prices/synthai.json
```

Expected output: a JSON object containing `"provider": "SynthAI"` and
`"_state": 0`. Since this is served locally, the change is visible
immediately — if the request fails, check that the mutator is still
running.

---

## Step 4 — Start the watcher

Wait for State 1 to be pushed. Then ask your agent to run the watcher
loop from inside `watcher/`, for example:

```
node watcher.js --schedule
```

The watcher runs immediately, then every 3 minutes, for 3 iterations
total. It prints `[ITERATION N/3]` at the start of each run and exits
automatically after the third iteration. Keep this session open until it
exits.

---

## Iteration 1 — PENDING_APPROVAL

The watcher fetches all three provider pages, projects the schema fields,
and diffs the result against `providers.json`.

Expected terminal output:

```
[ITERATION 1/3]

Phase 1: Fetching provider pages...
Phase 2: Diffing against catalogue...
Phase 3: Writing DIFF.md (2 change(s), 1 warning(s))...

[DIFF.md written] 2 change(s), 1 warning(s)
[ACTION REQUIRED] Write APPROVAL.md, then re-run the watcher.
```

Your agent should report the diff to you directly, but open `DIFF.md` too
and verify all three of the following:

- `SynthAI / Developer / price_amount` is classified as `PRICE_CHANGE`.
  The catalogue holds `20.00`; the page now returns `25.00`.
- `OrbitalAI / Pro / feature_flags` is classified as `BENEFIT_CHANGE`.
  `fine_tuning` was removed and `vision` was added.
- `VectronAI / Base / price_amount` appears under **Extraction warnings**,
  not under Changes. The page returned `null` for this field. The harness
  treats a field going null as a potential scrape failure, not a confirmed
  pricing change.

The loop has halted at the first human gate defined in `HARNESS.md`.

---

## Step 5 — Approve the update

Your agent will ask whether to bring the local catalogue into alignment
with the remote pages. Say yes.

Your agent then writes `APPROVAL.md` itself, in the format specified by
`APPROVAL.md.template`:

```
RUN_ID: 2025-07-04-09:25
STATUS: APPROVED
REASON: Verified SynthAI price increase and OrbitalAI feature swap
REVIEWED_BY: your-name
REVIEWED_AT: 2025-07-04T09:30:00Z
```

`RUN_ID` must match the value at the top of `DIFF.md` exactly. The
watcher validates this file strictly — a missing `RUN_ID` or `STATUS`
field causes it to exit with `ERROR` rather than proceed.

If you'd rather write it yourself for the exercise, copy the template and
fill it in:

```
copy APPROVAL.md.template APPROVAL.md   # Windows
cp APPROVAL.md.template APPROVAL.md     # macOS/Linux
```

---

## Iteration 2 — UPDATED

On its next 3-minute tick, the watcher detects `PENDING_APPROVAL` in
`RUN_LOG.md`, reads `APPROVAL.md`, and runs Gate 3 from `HARNESS.md`:

1. `APPROVAL.md` exists and contains `STATUS: APPROVED`.
2. The `RUN_ID` in `APPROVAL.md` matches the pending run.
3. The approved diff has not already been applied.

Expected terminal output:

```
[ITERATION 2/3]

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

## Iteration 3 — NO_DIFF or second PENDING_APPROVAL

On the third tick, one of two things happens depending on whether
State 2 has been pushed yet.

**State 2 not yet live:** the watcher finds no classified diffs against
the now-updated `providers.json` and exits `NO_DIFF`.

**State 2 live:** the watcher finds a second set of changes and exits
`PENDING_APPROVAL`. `DIFF.md` is overwritten with the new report.

After Iteration 3, the watcher prints:

```
[DONE] 3 iterations complete. Watcher exiting.
```

Read `RUN_LOG.md`. A complete three-iteration session shows:

```
... | PENDING_APPROVAL | providers_checked=3 | diffs=2 | warnings=1
... | UPDATED          | applied_from_approval=true
... | NO_DIFF          | providers_checked=3 | diffs=0 | warnings=1
```

---

## What the watcher does not do (by design)

Read the **Honest limitations** section in `HARNESS.md` and the **What
this loop does not handle** section in `LOOP.md`. These are intentional
exclusions. For each one, identify what additional component it would
require and where in the iteration structure it would be inserted.

---

## Extension exercises

**Trigger ERROR.** Set one `pricing_url` in `providers.json` to an
invalid URL and run a single iteration:

```
node watcher.js
```

Read the error in `RUN_LOG.md`, then restore the correct URL.

**Trigger ID_MISMATCH.** Write `APPROVAL.md` with a `RUN_ID` that does
not match the pending run. Observe Gate 3 reject it. Find the Gate 3
check in `watcher.js`.

**Trigger REJECTED.** Write `APPROVAL.md` with `STATUS: REJECTED` and a
`REASON`. Run the watcher and read the log entry. Note that a rejection
discards the diff and starts a fresh fetch on the next iteration.
