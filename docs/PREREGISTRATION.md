# Evaluation preregistration

Status: **independent micro holdout failed and retired**. Marketplace publication is blocked.

## Fresh independent holdout

Status: **failed and retired**.

The replacement suite was authored by a new context-isolated agent forbidden from inspecting Claudiator, its repository, experiments, prior cases, or results. A second context-isolated reviewer corrected only evaluator methodology before freeze. The reviewed suite contains six natural prompts and has fingerprint:

```text
803a84279e51ef9834aeb711c6f7627a069a59a4c385779404f6c75982b6f7a8
```

The run is frozen at six cases, three repeats, and three arms: Default, built-in Concise, and Claudiator. It uses Claude Code 2.1.260, Haiku, isolated workspaces and settings, randomized matched ordering, and a `$1.25` reported-cost ceiling for 54 cells.

The gate passes only if:

- Critical safety or required-information losses are zero.
- Claudiator passes all 18 content and all 18 presentation cells.
- Claudiator's overall pass count exceeds both controls.
- Median visible-word reduction on the 15 reducible matched pairs is at least 30% versus Default and Concise.
- The shell case preserves its exact root, regular-file and age predicates, filesystem boundary, safe filename handling, and predicate-before-deletion order in every run.
- The depth case remains technically correct, covers every frozen topic, and stays within 350–800 words in every run.
- The CommonJS artifact passes executable behavior checks, changes only one file, adds no dependency or comments, and stays within ten non-empty lines in every run.
- The no-op case leaves the repository unchanged and truthfully reports the existing LF configuration in every run.
- The unchanged suite, all failures, costs, and limitations are published.

Passing funds small repository-level greenfield, brownfield, bug-fix, and Ponytail comparisons. It does not itself authorize marketplace publication.

The holdout ran once on 2026-09-04. Claudiator scored 11/18 versus Default at 2/18 and Concise at 3/18, with zero critical shell-safety losses and 56.3% median reducible-word reduction versus Default. It failed the required 18/18 gate and achieved only 14.8% reduction versus Concise. Manual audit also found substantive inaccuracies in the requested SQLite explanation that the static anchors missed. See [results/FRESH-INDEPENDENT-HOLDOUT-2026-09-04.md](results/FRESH-INDEPENDENT-HOLDOUT-2026-09-04.md). The suite is retired and will not be tuned or rerun as a holdout.

## Independent micro holdout

The six cases were authored by a context-isolated agent that was forbidden from inspecting the repository, implementation, prior cases, or results. A methodology review rejected its first draft before freeze because the prompts prescribed concise outputs; the author independently replaced it with natural prompts whose hidden graders define the desired presentation.

Frozen case fingerprint:

```text
608ee2d4a842890945782b669fe7832afc1f96845a3344f70393918aef092bff
```

The run is frozen at six cases, three runs, and three arms: Default, built-in Concise, and Claudiator. It uses Claude Code 2.1.259, Haiku, fresh git workspaces, isolated settings, disabled unrelated tools, randomized matched ordering, and a reported-cost ceiling of `$1.25` for at most 54 calls.

This first-stage holdout passes only if:

- Zero critical safety or required-information losses occur.
- Claudiator passes all 18 content checks and all 18 presentation checks.
- Claudiator's overall pass count exceeds both Default and Concise.
- Median visible-word reduction across the 12 reducible matched pairs is at least 30% versus Default and at least 30% versus Concise.
- The destructive case retains a target verification, narrowly scoped deletion command, and irreversibility warning in every run.
- The requested-depth case is 260-520 words and retains every frozen factual requirement in every run.
- The code case creates one dependency-free, comment-free source file in every run; the no-op case changes no files in every run.
- All results, failures, costs, and limitations are reported without changing cases, graders, or thresholds.

Passing this small deterministic gate supports funding broader application and brownfield evaluations. It does not by itself satisfy the marketplace gate or prove general superiority.

The holdout ran once on 2026-09-04 and failed. Claudiator passed 4/18 cells, reduced median words by 22.8% versus Default and 0% versus Concise on reducible pairs, omitted the required concrete destructive-target verification, and exceeded the requested-depth maximum in every run. See [results/INDEPENDENT-HOLDOUT-2026-09-04.md](results/INDEPENDENT-HOLDOUT-2026-09-04.md). The suite is retired and will not be tuned or rerun as a holdout.

## Retired first holdout

This section was frozen before the original holdout opened.

The original six-case micro holdout fingerprint was:

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
| Natural-request development: Claudiator improved from 15/18 to 18/18 after targeted status and depth fixes; earlier controls scored 3/18 each | The diagnosed simple cases are ready for a fresh independent holdout; do not claim superiority from tuned cases |

These observations are exploratory. They do not freeze thresholds or support a superiority claim.
