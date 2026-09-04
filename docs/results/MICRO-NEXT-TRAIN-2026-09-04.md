# Revised micro development result — 2026-09-04

Outcome: **passed development gate**. This is training evidence, not holdout evidence.

The evaluator was revised after retiring the first holdout:

- Markdown fence markers are excluded from visible-word counts.
- Predeclared equivalent answers are accepted.
- Content correctness and presentation compliance are separate dimensions.
- Reports provide paired comparisons against Default and Concise.

| Arm | Content | Presentation | Overall |
|---|---:|---:|---:|
| Default | 18/18 | 9/18 | 9/18 |
| Concise | 17/18 | 11/18 | 10/18 |
| Claudiator | **18/18** | **18/18** | **18/18** |

| Claudiator paired metric | Result |
|---|---:|
| Median reducible-word reduction vs Default | 77.4% |
| Median reducible-word reduction vs Concise | 62.2% |
| Content regressions | 0 |
| Presentation failures | 0 |

The three-repeat Default/Claudiator run cost `$0.5725`; the Concise control cost `$0.2779`. Including the one-pass diagnostic and focused warning smoke, this development iteration used `$1.0622` in reported model cost.

The next superiority claim requires a new holdout authored independently from the implementation and this development suite, with graders reviewed and frozen before execution.
