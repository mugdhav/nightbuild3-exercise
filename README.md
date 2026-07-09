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
├── watcher/                     ← participant component
│   ├── watcher.js               ← the watcher loop
│   ├── providers.json           ← local pricing catalogue (starts intentionally stale)
│   ├── HARNESS.md               ← harness spec: read before running
│   ├── LOOP.md                  ← loop spec: read before running
│   ├── DIFF.md                  ← written by the watcher when changes are detected
│   ├── RUN_LOG.md               ← append-only run history
│   ├── APPROVAL.md.template     ← copy this to create APPROVAL.md
│   └── README.md                ← participant instructions
│
└── mutator/                     ← instructor component
    ├── mutator.js               ← the mutator loop
    ├── package.json
    ├── README.md                ← instructor instructions
    └── states/
        ├── 0/   synthai.json  orbitalai.json  vectronai.json
        ├── 1/   synthai.json  orbitalai.json  vectronai.json
        └── 2/   synthai.json  orbitalai.json  vectronai.json
```

---

## What this repo contains

| Folder | Component | Who runs it | Loop type |
|---|---|---|---|
| `watcher/` | Pricing watcher | Participant | Goal-conditioned, 3 iterations, fixed exit |
| `mutator/` | Pricing page mutator | Instructor | Interval, 3 iterations, fixed exit |

The two loops communicate through a shared public URL:
`https://www.vmugdha.in/nightbuild/prices/`

The mutator commits and pushes JSON pricing fixtures to that URL every
3 minutes, cycling through 3 states. The watcher fetches from that URL,
diffs the result against a local catalogue, and halts for human approval
before applying any update. Both loops run exactly 3 iterations and exit.

---

## Who runs the watcher loop

You do not run `watcher.js` at a terminal yourself. You ask a coding
agent (Claude Code, Codex, Antigravity, Cursor, or similar) to run the
loop on your behalf. The agent is the thing `HARNESS.md` and `LOOP.md`
are written to constrain. Concretely:

- The agent invokes `watcher.js`, watches its output, and reports each
  diff to you conversationally (in addition to the `DIFF.md` file the
  script writes). A diff here is a mismatch between the prices on the
  remote pages (`https://www.vmugdha.in/nightbuild/prices/`) and your
  local catalogue (`providers.json`) — caused by the mutator periodically
  changing the remote prices while your local copy stays fixed until you
  approve an update.
- When a diff is pending, the agent asks you to approve bringing the
  local catalogue into alignment with the remote pricing pages.
- On approval, **the agent writes `APPROVAL.md`** itself, with the
  matching `RUN_ID` and `STATUS: APPROVED` — you never hand-edit that
  file yourself.
- On the next iteration, `watcher.js` reads `APPROVAL.md` and applies
  the update.

Your only action at the approval gate is answering yes or no.

---

## How the two loops relate

```
Mutator (instructor)        Live pages (vmugdha.in)       Watcher (participant)

State 0 → git push  →→→   synthai.json            →→→   fetch → diff → NO_DIFF
State 1 → git push  →→→   orbitalai.json          →→→   fetch → diff → PENDING_APPROVAL
State 2 → git push  →→→   vectronai.json          →→→   fetch → diff → PENDING_APPROVAL
exits automatically                                       exits automatically
```

---

## Quick start

You run both loops yourself, in two terminal windows.

**Terminal 1 — Mutator, run from the repo root:**

```
node mutator/mutator.js
```

This one you run directly — it's a deterministic script with no agent
involved. It pushes the 3 pricing states to
`https://www.vmugdha.in/nightbuild/prices/` on a timer.

**Terminal 2 — Watcher:**

Don't run `watcher.js` yourself. Instead, ask a coding agent (Claude Code,
Codex, Antigravity, Cursor, or similar) to run the loop for you from
inside `watcher/`. See "Who runs the watcher loop" above.

Node.js 18 or later is required. Neither component has npm dependencies.

---

## Prerequisites for the mutator

The mutator commits and pushes to a GitHub Pages repo. Before running it,
configure Git with push access to the repo that serves `vmugdha.in`, and
verify with `git remote -v` from inside that repo root.

---

## Component documentation

- `watcher/README.md` — participant instructions: how to run the watcher,
  what to expect on each iteration, and extension exercises.
- `mutator/README.md` — instructor instructions: session timing, state
  sequence, and how to verify each push.
- `watcher/HARNESS.md` — harness spec: phase permissions, schema-projection
  contract, and verification gates.
- `watcher/LOOP.md` — loop spec: exit conditions, iteration structure,
  and retry policy.
