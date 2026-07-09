# HARNESS.md — Pricing Page Mutator

## Purpose

Constrain and orient an agent that serves 3 fixed states of fake pricing
pages to a local HTTP endpoint, on a timer, for the watcher to fetch and
diff against. The mutator has no decisions to make — it does not read
the watcher's catalogue, does not classify anything, and does not ask
for approval. Its only job is to write the right fixture at the right
time and keep serving it.

This harness exists for two reasons: to cap the mutator at exactly 3
write iterations, and to keep it from touching anything outside its own
output directory.

---

## State files

| File / directory | Role | Mutated by |
|---|---|---|
| `mutator/states/{0,1,2}/*.json` | Fixture source for each state | Nobody at runtime (read-only) |
| `remote/nightbuild/prices/*.json` | The "live" pages the watcher fetches | Agent, on each of the 3 iterations |

Nothing under `watcher/` (`providers.json`, `DIFF.md`, `APPROVAL.md`,
`RUN_LOG.md`) is ever read or written by the mutator. The two loops only
communicate through the HTTP endpoint, never through shared files.

---

## Tool scoping

| Phase | Permitted tools | Blocked tools |
|---|---|---|
| Serve | HTTP listen on `localhost:8787`, serve files under `remote/` | Outbound network calls of any kind |
| Write state | File write, scoped to `remote/nightbuild/prices/*.json` | Write to any path outside `remote/`, especially anything under `watcher/` |
| Read fixture | File read, scoped to `mutator/states/**` | — |

There is no git, no shell exec beyond the Node process itself, and no
credential of any kind involved. That is the point of this design: an
agent running the mutator needs no push access to any repository.

---

## Permissions

```
ALLOW  file.read  WHERE path STARTS_WITH "mutator/states/"
ALLOW  file.write WHERE path STARTS_WITH "remote/nightbuild/prices/"
ALLOW  network.listen WHERE port == 8787
DENY   file.write WHERE path STARTS_WITH "watcher/"
DENY   file.write WHERE path NOT STARTS_WITH "remote/nightbuild/prices/"
DENY   network.fetch  # the mutator never calls out, only serves
DENY   shell.exec WHERE command MATCHES "git .*"
```

---

## Verification gate — iteration cap

**Gate 1 — Exactly 3 write iterations, then stop mutating:**

Before writing a state, verify the state index is `0`, `1`, or `2`. After
state `2` is written, the write loop must not run again. There is no
state `3`. An agent asked to "keep the mutator running" after this point
should refuse to add a 4th state and explain that the loop is
intentionally exhausted — the exercise only defines 3 states.

**This is not the same as the process exiting.** The write loop halting
and the HTTP server halting are two different things.

**Gate 2 — Automatic shutdown, one interval after the last state:**

After state `2` is written, the process holds it for exactly one more
`INTERVAL_MS` (3 minutes) — long enough for the watcher's last scheduled
fetch to land — then calls `server.close()` and exits. An agent does not
need to run a manual stop command in the normal case; the process is
self-terminating by design.

**Manual stop command (early termination only):** if the mutator needs
to be stopped before its automatic shutdown — e.g. the session is being
aborted — the agent should kill the process by PID, printed at startup:

```
kill <pid>                    # macOS/Linux
taskkill /F /PID <pid>        # Windows
```

Do not use a broad kill (`pkill node`, `taskkill /F /IM node.exe`) — it
would also kill any watcher process or other unrelated Node processes
running on the same machine.

---

## Human gates

None. Unlike the watcher, the mutator never pauses for approval. It runs
to completion (3 states written, one grace interval, then shutdown)
without asking anything of the human. The only human decision is *when*
to start it (see `LOOP.md` session timing).

---

## Honest limitations

**No approval step means no way to pause between states.** If a state
was pushed by mistake, the fix is to re-run with `--state N` (see
`README.md`), not to intervene mid-loop.

**The grace period (one interval) is a fixed guess, not a confirmation.**
If the watcher's clock has drifted or it started late, its final fetch
may still miss the shutdown window. There is no handshake between the
two loops confirming the last fetch actually happened before the server
closes.

**Single-writer, not concurrent-safe.** Only one mutator instance should
run against a given `remote/` directory at a time. Running two
instances concurrently will race on the same files with no locking.
