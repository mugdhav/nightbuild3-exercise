# NightBuild3 — Pricing Page Mutator

This tool advances three fake Artificial Intelligence (AI) provider
pricing pages through 3 states, serving them over local HTTP at
`http://localhost:8787/nightbuild/prices/`. The pages live entirely
inside this repo, in `remote/`, and the mutator is the thing serving
them.

The watcher (run via a coding agent, from `watcher/`) reads those pages
and diffs them against its local `providers.json`.

You don't have to run the mutator yourself either — you can ask a coding
agent (Claude Code, Codex, Antigravity, Cursor, or similar) to run it on
your behalf, the same way you'd ask one to run the watcher. See
`HARNESS.md` and `LOOP.md` for what the agent is constrained to do.

---

## How it works

The mutator is a Node.js loop with exactly 3 write iterations, then a
one-interval grace period, then it shuts its own server down. It does
not run indefinitely and does not need to be manually stopped in the
normal case.

| Iteration | State | What the watcher sees |
|---|---|---|
| 1 (t=0) | 0 — Baseline | Watcher exits `NO_DIFF`. Use this to verify setup before the session. |
| 2 (t+3min) | 1 — First change set | Watcher exits `PENDING_APPROVAL`. Approve to write `APPROVAL.md`. |
| 3 (t+6min) | 2 — Second change set | Watcher exits `PENDING_APPROVAL` again after Run 1 is approved. |
| — (t+9min) | Grace period ends | Server shuts down automatically. |

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

Just Node.js 18 or later:

```
node --version
```

That's it. `remote/` is created automatically on first run.

---

## Running the mutator

From the repo root:

```
node mutator/mutator.js
```

The mutator prints its PID, starts serving `remote/` on
`http://localhost:8787`, writes each state to the console, waits 3
minutes, writes the next state, and so on. After state 2, it holds for
one more interval, then shuts the server down and exits automatically.

**Keep the terminal open until it exits** (about 9 minutes total).

---

## Session timing

```
t=0        State 0 written  (verify the pricing pages are reachable)

           ← 3 minutes pass →

t+3min     State 1 written  (start the watcher now)

           ← 3 minutes pass →

t+6min     State 2 written  (a second diff appears if Run 1 was approved)

           ← 3 minutes pass →

t+9min     Grace period ends. Server shuts down automatically.
```

Two moments to act on:
1. After State 0 is written: verify the pricing pages are reachable.
2. After State 1 is written: start the watcher.

No action is needed at t+9min — shutdown is automatic. See
`HARNESS.md` for the manual early-stop command, needed only if you're
aborting the session before it completes on its own.

---

## Verifying a state

After each state is written, confirm the served page reflects it:

```
curl http://localhost:8787/nightbuild/prices/synthai.json
```

The response includes `"_state": N` where N is the state just written.
Since this is a local server, there's no propagation delay — the change
is visible immediately.

---

## Re-running a state

If you need to re-serve a specific state (for example, if a diff was
missed), run:

```
node mutator/mutator.js --state 1
```

This writes only State 1 and exits immediately without waiting.

Add a `--state` flag handler or run the mutator interactively. The current
implementation does not support `--state` out of the box — use it as a
reference to manually copy a single state's fixtures into `remote/nightbuild/prices/`
if needed, or modify `main()` to accept a start state argument.

---

## Resetting to baseline

To reset the served pages to State 0, run the mutator again — State 0 is
written first, within the first iteration.

Alternatively, delete the `remote/` directory. Nothing needs to be
committed or pushed; it's a local, gitignored working directory.
