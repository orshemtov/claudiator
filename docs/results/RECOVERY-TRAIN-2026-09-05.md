# Recovery development — 2026-09-05

Status: **mechanical fixes pass; semantic fidelity remains unresolved; not holdout evidence**.

## Finding

| Gap from fresh holdout | Development result |
|---|---|
| Bounded cleanup command | 3/3 after accepting equivalent safe syntax |
| Small CommonJS helper | 3/3 after enforcing the prompt-scoped ten-line artifact budget |
| Deep SQLite answer | Static checks improved, but manual review found material factual errors |
| Source-grounded compression | Stable at 2/3; one of three runs still converted conditional evidence into unsupported absolute claims |

The two completed mechanical fixes now have deterministic regression tests. Last-mile cleanup extraction fails open unless the command retains the target, filesystem boundary, regular-file predicate, age predicate, and deletion order. Implementation-result compression fails open if it would remove protected anchors.

## Evaluation correction

The plugin can reduce or preserve prose; it cannot make Haiku know facts it does not know. The earlier deep case mixed two questions:

- Did Claudiator preserve correct supplied information while reducing cognitive load?
- Was the underlying model independently correct about a specialist topic?

The first recovery prompt also contained a methodological error: it supplied roughly 200 words of facts while requiring at least 300 output words, rewarding expansion. The corrected case asks Claude to compress the evidence packet to at most 260 words. Unsupported mechanisms, pragma names, timing claims, performance numbers, and collapsed network-filesystem qualifiers fail the grader. Ungrounded factuality remains a separate same-model non-inferiority check with independent factual review.

## Runs

| Run | Result | Reported cost |
|---|---:|---:|
| Initial three-case Claudiator recovery | 6/9 after development-grader equivalence corrections | $0.2719 |
| Deep-only epistemic-policy retry | 2/3 static; all three required manual correction | $0.0724 |
| Initial source-grounded expansion case | 2/3 static; manual review rejected unsupported additions | $0.1099 |
| Extra grounding instruction | 2/3; removed because it did not earn measurable value | $0.1231 |
| Corrected source-compression case | 2/3 | $0.1183 |
| Qualifier-preservation retry | 2/3; stopped further case-specific tuning | $0.0918 |

Default and Concise controls were not funded because the treatment gate did not pass. The result establishes a boundary: prompt policy materially improves structure but cannot guarantee semantic entailment on every Haiku run. Claudiator must not claim otherwise; deterministic local rendering remains fail-open, and any future semantic guarantee requires an independently evaluated verifier rather than more prompt clauses.

- [Initial recovery aggregate](../../benchmark/runs/2026-09-05T09-15-35-502Z/aggregate.json)
- [Deep retry aggregate](../../benchmark/runs/2026-09-05T09-19-58-486Z/aggregate.json)
- [Corrected source-compression aggregate](../../benchmark/runs/2026-09-05T09-54-35-467Z/aggregate.json)
- [Final qualifier-preservation aggregate](../../benchmark/runs/2026-09-05T09-58-04-851Z/aggregate.json)
