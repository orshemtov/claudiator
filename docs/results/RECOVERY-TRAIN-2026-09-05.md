# Recovery development — 2026-09-05

Status: **in progress; not holdout evidence**.

## Finding

| Gap from fresh holdout | Development result |
|---|---|
| Bounded cleanup command | 3/3 after accepting equivalent safe syntax |
| Small CommonJS helper | 3/3 after enforcing the prompt-scoped ten-line artifact budget |
| Deep SQLite answer | Static checks improved to 2/3, but manual review found material factual errors in all three answers |

The two completed mechanical fixes now have deterministic regression tests. Last-mile cleanup extraction fails open unless the command retains the target, filesystem boundary, regular-file predicate, age predicate, and deletion order. Implementation-result compression fails open if it would remove protected anchors.

## Evaluation correction

The plugin can reduce or preserve prose; it cannot make Haiku know facts it does not know. The earlier deep case mixed two questions:

- Did Claudiator preserve correct supplied information while reducing cognitive load?
- Was the underlying model independently correct about a specialist topic?

The recovery case now tests the first question with an evidence packet based on SQLite's WAL, locking, and online-backup documentation. Unsupported mechanisms, pragma names, timing claims, and performance numbers fail the grader. Ungrounded factuality remains a separate same-model non-inferiority check with independent factual review.

## Runs

| Run | Result | Reported cost |
|---|---:|---:|
| Initial three-case Claudiator recovery | 6/9 after development-grader equivalence corrections | $0.2719 |
| Deep-only epistemic-policy retry | 2/3 static; all three required manual correction | $0.0724 |
| Default/Concise matched retry | Not executed: Claude Code authentication expired | $0 |

The revised source-grounded case has not run. After `claude auth login`, run the three Claudiator cells first; fund controls only if they pass.

- [Initial recovery aggregate](../../benchmark/runs/2026-09-05T09-15-35-502Z/aggregate.json)
- [Deep retry aggregate](../../benchmark/runs/2026-09-05T09-19-58-486Z/aggregate.json)
