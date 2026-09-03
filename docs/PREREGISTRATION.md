# Evaluation preregistration

Status: **unfrozen; pilot underway**. Marketplace publication is blocked.

Freeze this document after the pilot and before opening the holdout.

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
| Requested-depth controls produced 714–842 words and passed content checks | Brevity rules did not erase explicitly requested depth in the observed controls |

These observations are exploratory. They do not freeze thresholds or support a superiority claim.
