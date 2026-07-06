# NightBuild3 — Pricing Page Mutator (Instructor Tool)

This tool runs on the command prompt of your local Windows machine during
the NightBuild3 session. It advances three fake Artificial Intelligence
(AI) provider pricing pages through 3 states by committing and pushing
JSON files to your website repo every 3 minutes.

Participant watchers read those pages from `https://www.vmugdha.in/nightbuild/prices/`
and diff them against their local `providers.json`.

---

## How it works

The mutator is a Node.js loop with exactly 3 iterations and a fixed exit.
It does not run indefinitely.

| Iteration | State | What participants see |
|---|---|---|
| 1 (t=0) | 0 — Baseline | Watcher exits `NO_DIFF`. Use this to verify setup before the session. |
| 2 (t+3min) | 1 — First change set | Watcher exits `PENDING_APPROVAL`. Participants write `APPROVAL.md`. |
| 3 (t+6min) | 2 — Second change set | Watcher exits `PENDING_APPROVAL` again after they approve Run 1. |

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

**On the command prompt of your local Windows machine, verify:**

1. Node.js 18 or later:
   ```
   node --version
   ```

2. Git installed and configured with push access to the website repo:
   ```
   git --version
   git remote -v
   ```
   The `origin` remote must point to your website repo
   (the repo that publishes to `www.vmugdha.in` via GitHub Pages).

3. GitHub Pages is enabled on the website repo, serving from the correct
   branch (`main` or `gh-pages`), with the custom domain `www.vmugdha.in`
   configured.

4. The website repo has a `nightbuild/prices/` directory, or the mutator
   will create it on the first push.

---

## Setup

**Step 1.** Clone or copy this mutator directory into your website repo.
The directory structure inside your website repo should be:

```
your-website-repo/
├── nightbuild/
│   └── prices/              ← created by the mutator on first push
├── mutator/
│   ├── mutator.js
│   ├── package.json
│   └── states/
│       ├── 0/  synthai.json  orbitalai.json  vectronai.json
│       ├── 1/  synthai.json  orbitalai.json  vectronai.json
│       └── 2/  synthai.json  orbitalai.json  vectronai.json
└── ... (rest of your site)
```

**Step 2.** Verify the mutator can reach the `states/` directory. The
mutator resolves state files relative to its own location, not relative
to the current working directory.

---

## Running the mutator

Navigate to your website repo root on the command prompt of your local
Windows machine, then run:

```
node mutator/mutator.js
```

On macOS or Linux:

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
                 (State 0 pushes immediately — participants verify setup)

                 ← 3 minutes pass →

                 (State 1 pushes — signal participants to start their watchers)

                 ← 3 minutes pass →

                 (State 2 pushes — participants who approved Run 1 will see a second diff)

                 Mutator exits. Session complete.
```

Signal participants at these two moments:
1. After State 0 is confirmed live: "Verify the pricing pages are reachable."
2. After State 1 is pushed: "Start your watcher now."

---

## Verifying a push

After each push, confirm the live page reflects the new state on the
command prompt of your local Windows machine:

```
curl https://www.vmugdha.in/nightbuild/prices/synthai.json
```

On macOS or Linux:

```
curl https://www.vmugdha.in/nightbuild/prices/synthai.json
```

The response includes `"_state": N` where N is the state just pushed.
GitHub Pages propagates commits within approximately 30 seconds. If the
field still shows the previous state after 60 seconds, check the Pages
build status at `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`.

---

## Re-running a state

If you need to re-push a specific state (for example, if participants
missed a diff), run:

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

Alternatively, delete the `nightbuild/prices/` directory from the website
repo, commit, and push:

```
git rm -r nightbuild/prices
git commit -m "nightbuild: remove pricing fixtures after session"
git push
```
