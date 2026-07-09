# NightBuild3 — Harness and Loop Engineering Exercise

This repository contains two coordinated loops that demonstrate harness
and loop engineering in practice. Run them together to observe a
goal-conditioned loop respond to live external state changes driven by a
separate interval loop.

---

## Repo structure

```
nightbuild3-exercise/
├── README.md                    ← you are here
├── .gitignore
│
├── remote/                      ← gitignored, created at runtime by the mutator
│   └── nightbuild/prices/       ← the "live" pages, served over localhost
│
├── watcher/
│   ├── watcher.js               ← the watcher loop
│   ├── providers.json           ← local pricing catalogue (starts intentionally stale)
│   ├── HARNESS.md               ← harness spec: read before running
│   ├── LOOP.md                  ← loop spec: read before running
│   ├── DIFF.md                  ← written by the watcher when changes are detected
│   ├── RUN_LOG.md               ← append-only run history
│   ├── APPROVAL.md.template     ← the format your agent writes APPROVAL.md in
│   └── README.md
│
└── mutator/
    ├── mutator.js               ← the mutator loop
    ├── package.json
    ├── HARNESS.md               ← harness spec: read before running
    ├── LOOP.md                  ← loop spec: read before running
    ├── README.md
    └── states/
        ├── 0/   synthai.json  orbitalai.json  vectronai.json
        ├── 1/   synthai.json  orbitalai.json  vectronai.json
        └── 2/   synthai.json  orbitalai.json  vectronai.json
```

---

## What this repo contains

| Folder | Component | Loop type |
|---|---|---|
| `watcher/` | Pricing watcher | Goal-conditioned, 3 iterations, fixed exit |
| `mutator/` | Pricing page mutator | Interval, 3 iterations + grace period, self-terminating |

The two loops communicate through a local HTTP endpoint:
`http://localhost:8787/nightbuild/prices/`. Nothing external is
involved — the pages live inside this repo, in `remote/`, and the
mutator is what serves them.

The mutator writes JSON pricing fixtures to that endpoint every
3 minutes, cycling through 3 states, then shuts itself down. The
watcher fetches from that endpoint, diffs the result against a local
catalogue, and halts for human approval before applying any update.

---

## Who runs each loop

Neither loop is meant to be run at a terminal directly by you. You ask a
coding agent (Claude Code, Codex, Antigravity, Cursor, or similar) to
run each one on your behalf. The agent is the thing each component's
`HARNESS.md` and `LOOP.md` are written to constrain.

**Watcher:**
- The agent invokes `watcher.js`, watches its output, and reports each
  diff to you conversationally (in addition to the `DIFF.md` file the
  script writes). A diff here is a mismatch between the prices the
  mutator is currently serving and your local catalogue
  (`providers.json`) — caused by the mutator periodically changing them
  while your local copy stays fixed until you approve an update.
- When a diff is pending, the agent asks you to approve bringing the
  local catalogue into alignment with the served pricing pages.
- On approval, **the agent writes `APPROVAL.md`** itself, with the
  matching `RUN_ID` and `STATUS: APPROVED` — you never hand-edit that
  file yourself.
- On the next iteration, `watcher.js` reads `APPROVAL.md` and applies
  the update.

Your only action at the watcher's approval gate is answering yes or no.

**Mutator:**
- The agent invokes `mutator.js`, which writes each of the 3 states in
  turn and reports state transitions to you.
- No approval gate here — the mutator never asks for one. It runs to
  completion and shuts its own server down automatically; see
  `mutator/HARNESS.md` for its scope (writes confined to `remote/`, no
  network calls out, capped at 3 iterations) and `mutator/LOOP.md` for
  timing and the automatic shutdown.

---

## How the two loops relate

```
Mutator                     Local pages (localhost:8787)      Watcher

State 0 → write  →→→   synthai.json                →→→   fetch → diff → NO_DIFF
State 1 → write  →→→   orbitalai.json              →→→   fetch → diff → PENDING_APPROVAL
State 2 → write  →→→   vectronai.json              →→→   fetch → diff → PENDING_APPROVAL
grace period, then shuts down                              exits automatically
```

---

## Quick start

Ask a coding agent to run each loop, one per terminal/session.

**Mutator, from the repo root:**

```
node mutator/mutator.js
```

**Watcher, from `watcher/`:**

```
node watcher.js --schedule
```

Both commands above are what the agent runs on your behalf — you
shouldn't need to type them yourself. Node.js 18 or later is required.
Neither component has npm dependencies, and neither needs git beyond the
initial `git clone`.

---

## Component documentation

- `watcher/README.md` — how to run the watcher, what to expect on each
  iteration, and extension exercises.
- `mutator/README.md` — session timing, state sequence, and how to
  verify each state.
- `watcher/HARNESS.md` / `mutator/HARNESS.md` — harness specs: phase
  permissions, tool scoping, and verification gates for each loop.
- `watcher/LOOP.md` / `mutator/LOOP.md` — loop specs: exit conditions,
  iteration structure, and (for the mutator) the automatic-shutdown gate.
