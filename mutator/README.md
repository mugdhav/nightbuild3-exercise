# NightBuild3 — Pricing Page Mutator

This tool runs in your terminal during the NightBuild3 session. It
advances three fake Artificial Intelligence (AI) provider pricing pages
through 3 states by committing and pushing JSON files to
`https://www.vmugdha.in/nightbuild/prices/`.

The watcher (run via a coding agent, from `watcher/`) reads those pages
and diffs them against its local `providers.json`.

---

## How it works

The mutator is a Node.js loop with exactly 3 iterations and a fixed exit.
It does not run indefinitely.

| Iteration | State | What the watcher sees |
|---|---|---|
| 1 (t=0) | 0 — Baseline | Watcher exits `NO_DIFF`. Use this to verify setup before the session. |
| 2 (t+3min) | 1 — First change set | Watcher exits `PENDING_APPROVAL`. Approve to write `APPROVAL.md`. |
| 3 (t+6min) | 2 — Second change set | Watcher exits `PENDING_APPROVAL` again after Run 1 is approved. |

Changes planted per state:

**State 1:**
- SynthAI Developer: `price_amount` $20 → $25 (`PRICE_CHANGE`)
- OrbitalAI Pro: `fine_tuning` removed, `vision` added (`BENEFIT_CHANGE`)
- VectronAI Base: `price_amount` → `null` (`EXTRACTION_WARNING` — not a diff)

**State 2:**
- SynthAI Team: `price_amount` $60 → $75 (`PRICE_CHANGE`)
- SynthAI Enterprise: new plan added (`PLAN_ADDED`)
- OrbitalAI Starter: removed (`PLAN_REMOVED`)
- OrbitalAI Growth: new plan at $29 added (`PLAN_ADDED`)
- VectronAI Base: `price_amount` $12 → $99, `price_cadence` monthly → annual (`PRICE_CHANGE`)

---

## Prerequisites

Verify in your terminal:

1. Node.js 18 or later:
   ```
   node --version
   ```

2. Git installed and configured with push access to this repo:
   ```
   git --version
   git remote -v
   ```
   The `origin` remote must point to this repo (the repo that publishes
   to `www.vmugdha.in` via GitHub Pages).

3. GitHub Pages is enabled on this repo, serving from the correct branch
   (`main` or `gh-pages`), with the custom domain `www.vmugdha.in`
   configured.

4. This repo has a `nightbuild/prices/` directory, or the mutator will
   create it on the first push.

---

## Running the mutator

From the repo root:

```
node mutator/mutator.js
```

The mutator prints each push to the console, waits 3 minutes, then pushes
the next state. It exits automatically after pushing State 2.

**Do not close the terminal while the mutator is running.**

---

## Session timing

Run the mutator before and during the session, not after.

```
Before session:  node mutator/mutator.js
                 (State 0 pushes immediately — verify setup)

                 ← 3 minutes pass →

                 (State 1 pushes — start the watcher now)

                 ← 3 minutes pass →

                 (State 2 pushes — a second diff appears if Run 1 was approved)

                 Mutator exits. Session complete.
```

Two moments to act on:
1. After State 0 is confirmed live: verify the pricing pages are reachable.
2. After State 1 is pushed: start the watcher.

---

## Verifying a push

After each push, confirm the live page reflects the new state:

```
curl https://www.vmugdha.in/nightbuild/prices/synthai.json
```

The response includes `"_state": N` where N is the state just pushed.
GitHub Pages propagates commits within approximately 30 seconds. If the
field still shows the previous state after 60 seconds, check the Pages
build status at `https://github.com/mugdhav/nightbuild3-exercise/actions`.

---

## Re-running a state

If you need to re-push a specific state (for example, if a diff was
missed), run:

```
node mutator/mutator.js --state 1
```

This pushes only State 1 and exits immediately without waiting.

Add a `--state` flag handler or run the mutator interactively. The current
implementation does not support `--state` out of the box — use it as a
reference to manually copy and push a single state if needed, or modify
`main()` to accept a start state argument.

---

## Resetting to baseline

To reset the live pages to State 0 after the session, run the mutator
again. State 0 pushes first, within the first iteration.

Alternatively, delete the `nightbuild/prices/` directory, commit, and
push:

```
git rm -r nightbuild/prices
git commit -m "nightbuild: remove pricing fixtures after session"
git push
```
