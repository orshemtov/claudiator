# Independent micro holdout — 2026-09-04

Result: **FAIL**. Claudiator improved on Default but did not meet the frozen superiority, preservation, or concision gates.

## Setup

| Field | Value |
|---|---|
| Freeze commit | `49c7b91` |
| Case fingerprint | `608ee2d4a842890945782b669fe7832afc1f96845a3344f70393918aef092bff` |
| Claude Code | 2.1.259 |
| Model | Haiku |
| Arms | Default, built-in Concise, Claudiator |
| Runs | 3 × 6 cases × 3 arms = 54 completed cells |
| Reported cost | `$1.1637783` under the frozen `$1.25` ceiling |

Cases were independently authored without repository, implementation, prior-case, or prior-result access. The first draft was rejected before freeze because its prompts prescribed concise answers. The replacement used natural prompts and hidden presentation constraints.

## Results

| Arm | Overall | 95% Wilson CI | Content | Presentation | Median words | Cost |
|---|---:|---:|---:|---:|---:|---:|
| Default | 2/18 (11.1%) | 3.1–32.8% | 4/18 | 3/18 | 52 | `$0.3873218` |
| Concise | 0/18 (0.0%) | 0.0–17.6% | 1/18 | 6/18 | 31.5 | `$0.3690255` |
| Claudiator | 4/18 (22.2%) | 9.0–45.2% | 6/18 | 7/18 | 24 | `$0.4074310` |

| Frozen gate | Required | Observed | Result |
|---|---:|---:|---|
| Claudiator content | 18/18 | 6/18 | Fail |
| Claudiator presentation | 18/18 | 7/18 | Fail |
| Overall exceeds both controls | Yes | 4/18 vs 2/18 and 0/18 | Pass |
| Reducible-word reduction vs Default | ≥30% | 22.8% | Fail |
| Reducible-word reduction vs Concise | ≥30% | 0.0% | Fail |
| Critical safety losses | 0 | Concrete target verification omitted in 3/3 runs | Fail |
| Requested depth | 260–520 words, all requirements | 1,089–1,196 words; frozen checks also missed | Fail |
| Minimal code artifact | 3/3 | 3/3 | Pass |
| Correct no-op | 3/3 | File unchanged 3/3, required concise response 0/3 | Fail |
| Cost | ≤`$1.25` | `$1.1637783` | Pass |

## What the run proved

- Claudiator consistently produced fewer words than Default, but not enough to clear the frozen threshold.
- It did not improve median reducible length over built-in Concise.
- The forced style reduced some prose but remained weak on natural prompts: status updates were 73–138 words and detailed explanations exceeded 1,000 words.
- The local renderer was intentionally conservative. Displayed output usually equaled raw output; it did not rescue unconstrained response shapes.
- Artifact behavior was strong: all Claudiator code runs created one six-line, dependency-free, comment-free file, and every no-op run left the repository unchanged.
- Safety compression was not reliable. Short destructive answers omitted the concrete target-resolution check required by the frozen contract.

## Evaluator limitations

The formal result above is unchanged. Post-run inspection found two grader limitations:

- The clamp regex rejects the valid commutative form `Math.max(min, Math.min(value, max))`, causing four false-negative content cells across Default and Concise. Claudiator's three artifact cells were unaffected.
- The terse-answer and no-op regexes encode exact presentation inside checks labeled `content`; correct verbose answers therefore fail both dimensions. They still correctly fail the frozen overall brevity contract.

Neither limitation changes Claudiator's failure: it independently missed safety, depth, presentation, and both reduction thresholds. The holdout is retired and will not be rescored or reused for a superiority claim.

## Evidence

- [Raw aggregate](../../benchmark/runs/2026-09-04T18-17-23-693Z/aggregate.json)
- [HTML scorecard](../../benchmark/runs/2026-09-04T18-17-23-693Z/report.html)

## Next development target

Treat this result as a design diagnosis, not a prompt-tuning exercise:

1. Make natural-request contracts infer the task's information shape without requiring users to say “concise.”
2. Enforce a compact answer budget while exempting explicit depth requests from the normal budget.
3. Define safety templates that preserve concrete verification and irreversible-action warnings.
4. Make local rendering operate on semantic units with deterministic protected-anchor checks, or prove that an opt-in semantic renderer earns its latency and cost.
5. Validate each change on development cases only, then commission another independently authored holdout.
