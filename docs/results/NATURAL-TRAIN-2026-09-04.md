# Natural-request development evaluation — 2026-09-04

Result: **PASS for development, not a holdout**. After diagnosing the retired independent holdout, Claudiator passed all 18 repeated content and presentation checks on six natural-request cases.

## What changed

- Infer direct answers, status updates, implementation results, no-ops, destructive commands, and explicit depth from natural requests.
- Preserve destructive-action verification and irreversibility warnings in compact answers.
- Join short status facts into one readable line without paraphrasing them.
- Keep requested detailed answers bounded without truncating technical content.
- Remove model-dependent evaluator hooks; all production hooks are deterministic local commands.

## Final Claudiator-only confirmation

| Field | Value |
|---|---:|
| Claude Code | 2.1.260 |
| Model | Haiku |
| Cases | 6 |
| Repeats | 3 |
| Cells | 18 |
| Overall | 18/18 |
| Content | 18/18 |
| Presentation | 18/18 |
| Median visible words | 19.5 |
| Cost | `$0.3731479` |

| Category | Result | Median words |
|---|---:|---:|
| Direct answer | 3/3 | 2 |
| Minimal code artifact | 3/3 | 19 |
| Correct no-op | 3/3 | 5 |
| Professional status | 3/3 | 31 |
| Destructive safety | 3/3 | 25 |
| Requested depth | 3/3 | 413 |

## Development comparison

An earlier three-arm run used the same six cases, fingerprint, Claude Code version, model, and three repeats. It preceded the final status and depth refinements, so it is diagnostic rather than a final matched superiority result.

| Arm | Overall | Content | Presentation | Median words | Cost |
|---|---:|---:|---:|---:|---:|
| Default | 3/18 | 14/18 | 3/18 | 45 | `$0.3384838` |
| Concise | 3/18 | 14/18 | 4/18 | 32.5 | `$0.3533555` |
| Claudiator before final refinements | 15/18 | 18/18 | 15/18 | 18.5 | `$0.3635937` |

In that matched run, Claudiator's median visible-word reduction on the 12 reducible pairs was 71.5% versus Default and 58.3% versus Concise. The subsequent focused regressions fixed the three presentation failures, followed by the 18/18 Claudiator-only confirmation above.

## Evidence boundary

- These cases were created and repeatedly used during development.
- The final Claudiator run is not paired with newly rerun controls.
- The result proves the diagnosed simple failure modes are now controlled; it does not prove general superiority.
- The marketplace gate remains blocked until a new independently authored holdout passes, followed by repository-level coding evaluations.

## Reproduce

```sh
node benchmark/run.mjs --suite natural-train --arms claudiator --model haiku --runs 3 --max-cost-usd 0.45
```

## Raw evidence

- [Final Claudiator aggregate](../../benchmark/runs/2026-09-04T19-36-05-986Z/aggregate.json)
- [Final Claudiator scorecard](../../benchmark/runs/2026-09-04T19-36-05-986Z/report.html)
- [Earlier matched aggregate](../../benchmark/runs/2026-09-04T19-18-47-972Z/aggregate.json)
- [Earlier matched scorecard](../../benchmark/runs/2026-09-04T19-18-47-972Z/report.html)
