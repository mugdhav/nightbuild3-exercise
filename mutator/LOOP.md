# LOOP.md — Pricing Page Mutator

## Loop type

**Interval, fixed iteration count, self-terminating.**

The mutator writes 3 states, one every `INTERVAL_MS`, then holds the
last state for one more interval and shuts itself down. It does not run
indefinitely and does not need to be manually stopped in the normal case.

---

## Trigger

```
trigger: manual invoke only (no cron — this is a one-shot session run)
input:   mutator/states/{0,1,2}/*.json  (read from this repo)
output:  remote/nightbuild/prices/*.json (written to this repo,
         served over http://localhost:8787)
```

---

## Exit conditions

| Condition | State | Next action |
|---|---|---|
| States 0, 1, 2 written, grace interval elapsed | `DONE` | Server closes, process exits 0 |
| Fatal error (e.g. fixture file missing) | `FATAL` | Log error, process exits 1 |
| Manually killed before `DONE` | `STOPPED` | No cleanup needed — files under `remote/` are left as last written |

There is no `PENDING_APPROVAL`-style halt. The mutator never waits on a
human mid-run.

---

## Iteration structure

```
main:
    start_http_server(port=8787, root=remote/)
    print pid, stop-command hint

    for state in [0, 1, 2]:
        write_state(state)     # copy mutator/states/{state}/*.json into
                                # remote/nightbuild/prices/, stamping
                                # _state and _updated_at
        if state < 2:
            sleep(INTERVAL_MS)

    # Gate 2 (HARNESS.md): grace period before shutdown
    sleep(INTERVAL_MS)
    server.close()
    exit(0)
```

---

## Session timing

```
t=0        state 0 written  (baseline — verify the watcher sees NO_DIFF)
t+3min     state 1 written  (start the watcher now, if not already running)
t+6min     state 2 written  (watcher sees a second diff after approving Run 1)
t+9min     grace period ends, server shuts down automatically
```

Two moments to act on:
1. After state 0 is written: confirm the pages are reachable
   (`curl http://localhost:8787/nightbuild/prices/synthai.json`).
2. After state 1 is written: start the watcher.

No action is needed at t+9min — the shutdown is automatic. See
`HARNESS.md` for the manual early-stop command, needed only if the
session is being aborted before completion.

---

## What this loop does not handle

- **Concurrent mutator instances.** Only one process should write to a
  given `remote/` directory at a time. There is no lock file.

- **Confirmation that the watcher's final fetch landed.** The grace
  period is a fixed 1-interval guess, not a handshake. See the
  corresponding limitation in `HARNESS.md`.

- **Resuming a partially-run session.** If the mutator is killed at
  state 1 and restarted, it starts over from state 0 rather than
  resuming at state 1. There is no run log to read state back from.
