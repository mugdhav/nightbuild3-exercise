# LOOP.md — Provider Pricing Watcher

## Loop type

**Goal-conditioned with human gate.**

The loop runs on a fixed daily interval. Each iteration is stateless with
respect to prior fetches: it compares current page state against
`providers.json`, not against the previous run's fetch. Progress
accumulates in `providers.json` as approved updates land; the loop
does not carry in-memory state across runs.

---

## Trigger

```
schedule: daily at 08:00 UTC
trigger:  cron OR manual invoke (for forced check)
input:    providers.json (read from repo root)
```

---

## Exit conditions

| Condition | Exit state | Next action |
|---|---|---|
| No diffs found across all providers | `NO_DIFF` | Log run, idle until next schedule |
| Diffs found, report written | `PENDING_APPROVAL` | Notify human, halt until `APPROVAL.md` written |
| Approval received, update applied | `UPDATED` | Log run, commit updated `providers.json`, idle |
| Approval rejected | `REJECTED` | Log rejection with reason, idle until next schedule |
| Extraction failure rate > 30% | `ERROR` | Log error, notify human, halt loop |

The loop never self-transitions from `PENDING_APPROVAL` to `UPDATED`.
That transition requires a human writing `APPROVAL.md`.

---

## Iteration structure

```
run_start:
    run_id = generate_id()          # e.g. "2025-07-03-08:00"
    load(providers.json)
    check RUN_LOG.md for PENDING_APPROVAL state
    if PENDING_APPROVAL and APPROVAL.md exists:
        branch → APPROVAL_CHECK

FETCH_PHASE:
    for each provider in providers.json:
        response = http.get(provider.pricing_url, timeout=15s)
        if response.status != 200:
            log extraction_warning(provider.id, "HTTP {status}")
            continue
        projected = schema_project(response.body)
        validate(projected)         # Gate 1
        store projected in run_buffer[provider.id]

DIFF_PHASE:
    for each provider in run_buffer:
        diff = compare(run_buffer[provider.id], providers.json[provider.id])
        if diff:
            classify(diff)          # Gate 2
            append to diff_list

    if extraction_warning_rate > 0.30:
        exit(ERROR)

    if diff_list is empty:
        append to RUN_LOG.md: {run_id, state: NO_DIFF, timestamp}
        exit(NO_DIFF)

REPORT_PHASE:
    write DIFF.md:
        - run_id
        - timestamp
        - for each diff in diff_list:
            provider, classification, field, old_value, new_value
        - extraction_warnings (if any)
    notify_human(run_id, diff_count)
    append to RUN_LOG.md: {run_id, state: PENDING_APPROVAL, diff_count, timestamp}
    exit(PENDING_APPROVAL)          # loop halts here

APPROVAL_CHECK:
    read APPROVAL.md
    if APPROVAL.md.run_id != current PENDING_APPROVAL run_id:
        log mismatch, exit(ERROR)
    if APPROVAL.md.status == "APPROVED":
        branch → UPDATE_PHASE
    if APPROVAL.md.status == "REJECTED":
        append to RUN_LOG.md: {run_id, state: REJECTED, reason: APPROVAL.md.reason}
        exit(REJECTED)

UPDATE_PHASE:
    verify Gate 3 (approval validity)
    for each approved diff in diff_list:
        apply diff → providers.json
    commit(providers.json, message: "pricing update: {run_id}")
    append to RUN_LOG.md: {run_id, state: UPDATED, changes_applied, timestamp}
    exit(UPDATED)
```

---

## Retry policy

| Failure type | Retry | Limit | On limit exceeded |
|---|---|---|---|
| HTTP timeout (single provider) | Yes, after 30s | 2 retries | Log extraction_warning, continue to next provider |
| HTTP timeout (all providers) | No | — | exit(ERROR), notify human |
| Schema validation failure | No | — | Log extraction_warning, skip provider |
| Approval file malformed | No | — | exit(ERROR), notify human |
| `providers.json` write failure | No | — | exit(ERROR), do not retry writes |

Do not retry failed writes. A partial write to `providers.json` corrupts
the catalogue. On any write failure, restore `providers.json` from the
last committed state and exit.

---

## `DIFF.md` format

```markdown
# Pricing Diff Report
run_id: {run_id}
generated: {ISO 8601 timestamp}
status: PENDING_APPROVAL

## Changes ({n} found)

### {provider_name}

| Field | Classification | Current (providers.json) | Detected on page |
|---|---|---|---|
| price_amount | PRICE_CHANGE | 20.00 | 25.00 |
| feature_flags | BENEFIT_CHANGE | ["GPT-4o", "100 msg/day"] | ["GPT-4o", "150 msg/day"] |

---

## Extraction warnings ({n} found)

| Provider | Field | Reason |
|---|---|---|
| {name} | {field} | {reason} |

---

## Instructions for approver

To approve: write APPROVAL.md with STATUS: APPROVED and RUN_ID: {run_id}.
To reject:  write APPROVAL.md with STATUS: REJECTED, RUN_ID: {run_id}, and REASON: {your reason}.
```

---

## `APPROVAL.md` contract

The human writes this file. The agent reads it. Format is strict.

```markdown
RUN_ID: {run_id}
STATUS: APPROVED | REJECTED
REASON: {required if REJECTED, optional if APPROVED}
REVIEWED_BY: {name or identifier}
REVIEWED_AT: {ISO 8601 timestamp}
```

Any deviation from this format causes the approval check to exit with
`ERROR` rather than apply the update. This is intentional: a malformed
approval is not an approval.

---

## `RUN_LOG.md` append format

```
{ISO 8601} | {run_id} | {state} | providers_checked={n} | diffs={n} | warnings={n}
```

Example:
```
2025-07-03T08:04:11Z | 2025-07-03-08:00 | PENDING_APPROVAL | providers_checked=12 | diffs=3 | warnings=1
2025-07-04T08:03:58Z | 2025-07-04-08:00 | NO_DIFF | providers_checked=12 | diffs=0 | warnings=0
```

---

## Notification contract

The loop emits a notification at two points:

**On `PENDING_APPROVAL`:**
```
Subject: [Pricing Watcher] {n} change(s) found — approval required
Body:    Run ID: {run_id}
         Providers with changes: {list}
         Review DIFF.md and write APPROVAL.md to proceed.
```

**On `UPDATED`:**
```
Subject: [Pricing Watcher] providers.json updated ({run_id})
Body:    {n} change(s) applied. See RUN_LOG.md for details.
```

**On `ERROR`:**
```
Subject: [Pricing Watcher] ERROR — loop halted ({run_id})
Body:    Reason: {error description}
         Loop will not resume until error is resolved manually.
```

Notification channel (email, Slack, webhook) is configured in environment
variables, not in this spec. The loop calls `notify(subject, body)` and
does not know or care about the channel.

---

## Calibration notes

**Interval:** Daily at 08:00 UTC is a starting default. Most providers
update pricing on business days. If false-positive extraction warnings
cluster on weekends (CDN routing, A/B tests), shift to weekday-only.

**Extraction warning threshold (30%):** Arbitrary starting value.
After 30 real runs, plot warning rate per provider. Providers with
persistent >10% warning rates likely need provider-specific projection
logic rather than a generic extractor.

**Timeout (15s):** Set conservatively for JS-rendered pages.
If a provider uses server-side rendering, reduce to 5s to surface
failures faster.

---

## What this loop does not handle

- **Price history.** The loop detects the current diff against
  `providers.json`; it does not record a time series of all historical
  prices. Add a `price_history.json` and an append-only write phase if
  that is needed.

- **New providers.** The loop only checks URLs already in `providers.json`.
  Adding a new provider requires a human to add the entry first.
  The loop does not discover providers.

- **Approval expiry.** An `APPROVAL.md` file has no TTL. An approval
  written six months ago for a run that was never applied will still
  be treated as valid. Add an `EXPIRES_AT` field and validate it in
  Gate 3 if approval staleness is a concern.
