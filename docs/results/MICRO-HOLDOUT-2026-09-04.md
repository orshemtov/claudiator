# Micro holdout result — 2026-09-04

Formal outcome: **failed**. Claudiator improved materially but passed 13/18 cells; the preregistered gate required 18/18.

| Condition | Value |
|---|---|
| Claudiator commit | `fa64dc7` |
| Claude Code | 2.1.259 |
| Model | Haiku |
| Holdout fingerprint | `349e6aedc4389f304a696a6c7724923f026daf4c4c19f454f18049f3b612b3c3` |
| Runs | 3 per case and arm; 54/54 completed |
| Reported cost | `$0.8822` |

## Results

| Case | Default | Concise | Claudiator |
|---|---:|---:|---:|
| Single command | 0/3 | 0/3 | 0/3 |
| Exact label | 2/3 | 3/3 | 3/3 |
| Definition | 0/3 | 0/3 | 2/3 |
| Security action | 0/3 | 0/3 | 3/3 |
| Destructive warning | 1/3 | 0/3 | 2/3 |
| Requested depth | 3/3 | 3/3 | 3/3 |
| **Total** | **6/18** | **6/18** | **13/18** |

| Paired metric | Claudiator |
|---|---:|
| Median reducible-word reduction vs Default | 51.6% |
| Median reducible-word reduction vs Concise | 34.6% |
| Critical protected-information losses | 0 |

## Failure audit

| Failures | Classification | Evidence |
|---:|---|---|
| 3 | Holdout specification defect | Every arm returned the valid shorter alias `git status -s`; the grader required `git status --short` and counted the Markdown fence as an extra word. |
| 1 | Genuine definition miss | Claudiator returned a correct 28-word sentence against the frozen 25-word ceiling. |
| 1 | Genuine warning-format miss | Claudiator returned 15 words but repeated the command using five display lines against the frozen three-line ceiling. |

The formal score is not retroactively adjusted. This holdout is retired and cannot be used to tune Claudiator. Any next evaluation must use newly authored cases and freeze their graders before execution.
