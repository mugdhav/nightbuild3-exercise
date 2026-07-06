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

Open two terminal windows on the same machine, or one per role.

**Terminal 1 — Mutator (instructor), run from your website repo root:**

```
node nightbuild/mutator/mutator.js
```

**Terminal 2 — Watcher (participant), run from `watcher/`:**

```
node watcher.js --schedule
```

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
