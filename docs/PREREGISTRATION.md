# Evaluation preregistration

Status: **revised development gate passed; independent holdout required**. Marketplace publication is blocked.

Freeze this document after the pilot and before opening the holdout.

The six-case micro holdout is authored but unopened. Its case fingerprint is:

```text
349e6aedc4389f304a696a6c7724923f026daf4c4c19f454f18049f3b612b3c3
```

The micro holdout is frozen at three runs per case and arm. First-stage superiority requires:

- Claudiator passes all 18 cells with no correctness, safety, format, or requested-depth failure.
- Every protected command, warning, and non-repeatable secret constraint is retained.
- Median visible-word reduction is at least 30% on the nine reducible matched pairs versus both Default and Concise.
- Claudiator's total pass rate exceeds both Default and Concise.
- Exact command and label cases do not grow; all requested-depth cases contain at least 150 words and every required concept.
- The run uses Claude Code 2.1.259, Haiku, isolated settings, and a reported-cost ceiling of `$1.05`.

These criteria were frozen before any `micro-holdout` execution.

The holdout ran once on 2026-09-04. Claudiator passed 13/18 cells versus 6/18 for both Default and Concise, with zero critical information losses and 51.6% median reducible-word reduction versus Default. It failed the required 18/18 correctness/format gate. See [results/MICRO-HOLDOUT-2026-09-04.md](results/MICRO-HOLDOUT-2026-09-04.md). The cases are retired and will not be used for product tuning.

The revised development-only suite subsequently passed 18/18 for Claudiator. It does not rehabilitate the retired holdout or support a superiority claim. The next holdout must be authored independently and frozen under the revised grader contract.

| Decision | Pilot output | Frozen value |
|---|---|---|
| Removable-content definition | Pending | Pending |
| Minimum useful improvement | Pending | Pending |
| Correctness non-inferiority margin | Pending | Pending |
| Human agreement floor | Pending | Pending |
| Runs per case | Pending | Pending |
| Local-renderer latency ceiling | Pending | Pending |
| Semantic-renderer cost/latency ceiling | Pending | Pending |

The holdout passes only if:

- Critical protected-information losses: zero.
- Correctness and safety: non-inferior to the strongest relevant control.
- Comprehension time: materially and statistically better than Default and Concise.
- Coding subset: materially and statistically better than Ponytail for reader effort, with no artifact-quality regression.
- Every category and failed run is reported.

Changing a frozen threshold invalidates the holdout and requires a new holdout set.

## Pilot observations

| Observation | Consequence |
|---|---|
| The first budgeted run completed 23 of 39 cells at `$0.5091`; cutoff produced uneven arm coverage | Do not compare aggregate arm scores; future pilots run Default/Claudiator pairs first |
| A strict-command repair reduced Claudiator from 21 words to 4 while retaining correctness | Keep literal quantity and format contracts |
| Compact secret-response attempts fell from 104 words to 51, 22, and 26, but still missed the 20-word gate | Prompt-only compression is not yet reliable enough |
| Contract-aware local rendering reduced the training security action to 5 displayed words and command warning to 10; both passed while raw output remained intact | Repeat before treating this as reliable; do not open the holdout yet |
| Requested-depth controls produced 714–842 words and passed content checks | Brevity rules did not erase explicitly requested depth in the observed controls |
| The first micro gate isolates six cheap response shapes from repository implementation work | Prove reliable control before funding larger greenfield and brownfield comparisons |
| Three-run micro training: Default 10/18, Concise 11/18, current Claudiator 18/18 | Open the frozen micro holdout without further tuning |
| Current Claudiator reduced the nine reducible training pairs by a 63.4% median versus Default | Keep the preregistered holdout floor at 30%; do not raise it after observing training |

These observations are exploratory. They do not freeze thresholds or support a superiority claim.
