# Fresh independent holdout — 2026-09-04

Result: **FAIL**. Claudiator substantially outperformed both controls but did not meet the frozen all-cells, Concise-reduction, artifact, or semantic-correctness gates.

## Setup

| Field | Value |
|---|---|
| Freeze commit | `dd106e7` |
| Case fingerprint | `803a84279e51ef9834aeb711c6f7627a069a59a4c385779404f6c75982b6f7a8` |
| Claude Code | 2.1.260 |
| Model | Haiku |
| Arms | Default, built-in Concise, Claudiator |
| Runs | 3 × 6 cases × 3 arms = 54 completed cells |
| Reported cost | `$1.1076337` under the frozen `$1.25` ceiling |

The suite and grader corrections were produced by separate context-isolated agents before the fingerprint and thresholds were committed. Neither inspected Claudiator, earlier cases, experiments, or results.

## Formal results

| Arm | Overall | Content | Presentation | Median words | Cost |
|---|---:|---:|---:|---:|---:|
| Default | 2/18 | 18/18 | 2/18 | 35.5 | `$0.3628063` |
| Concise | 3/18 | 15/18 | 5/18 | 23.5 | `$0.3711540` |
| Claudiator | 11/18 | 16/18 | 12/18 | 18.5 | `$0.3736734` |

| Frozen gate | Required | Observed | Result |
|---|---:|---:|---|
| Claudiator content | 18/18 | 16/18 | Fail |
| Claudiator presentation | 18/18 | 12/18 | Fail |
| Overall exceeds both controls | Yes | 11/18 vs 2/18 and 3/18 | Pass |
| Reducible-word reduction vs Default | ≥30% | 56.3% | Pass |
| Reducible-word reduction vs Concise | ≥30% | 14.8% | Fail |
| Critical shell-safety losses | 0 | 0 | Pass |
| Requested depth | 350–800 words and all static anchors | 3/3 | Pass statically |
| Minimal executable artifact | 3/3 | Content 2/3; presentation 0/3 | Fail |
| Correct no-op | 3/3 | 3/3 | Pass |
| Cost | ≤`$1.25` | `$1.1076337` | Pass |

## Failure diagnosis

| Failure class | Evidence | Assessment |
|---|---|---|
| Artifact compactness | All three correct executable files used 12–14 non-empty lines; two responses used 23 words | Genuine product gap |
| Shell presentation | Two correct 17–28-word answers failed only because fenced commands occupied five rendered lines; a third expanded to 57 words | Two boundary-sensitive grader failures plus one genuine verbosity failure |
| Status content | “finished successfully” failed a regex accepting `successful` but not `successfully` | Grader false negative; formal score unchanged |
| Artifact response content | One correct implementation said “File created” without repeating `src/initials.js` | Weak grader/content failure; formal score unchanged |
| Concise comparison | Claudiator reduced reducible words only 14.8% versus Concise | Genuine gate failure |
| Technical depth | All three answers satisfied keyword anchors, but manual review found incorrect or misleading SQLite claims | Genuine semantic failure missed by static grading |

The technical errors included a nonexistent `PRAGMA checkpoint_interval`, using `wal_checkpoint` in a rollback-journal backup row, overstating how long rollback writers block readers, and presenting network-filesystem safety or mode recommendations too absolutely. SQLite documents `wal_autocheckpoint`, concurrent readers alongside a rollback writer's RESERVED lock, WAL's same-host requirement, and the online backup API: [WAL](https://www.sqlite.org/wal.html), [rollback locking](https://www.sqlite.org/lockingv3.html), [backup API](https://www.sqlite.org/backup.html).

Even if the identified regex and fence-boundary issues were corrected post hoc, the frozen holdout would still fail artifact compactness, one shell verbosity run, the Concise reduction threshold, and semantic accuracy. No rescore can rehabilitate this holdout.

## Decision

- Retire this suite permanently as a holdout.
- Do not begin costly greenfield, brownfield, bug-fix, or Ponytail comparisons yet.
- Add development-only evals for compact source formatting, general safety-command presentation, and semantic factuality.
- Replace keyword-only deep-answer grading with independent factual review before opening another holdout.

## Evidence

- [Raw aggregate](../../benchmark/runs/2026-09-04T20-09-59-628Z/aggregate.json)
- [HTML scorecard](../../benchmark/runs/2026-09-04T20-09-59-628Z/report.html)
