# Benchmark protocol

## Claim

With the same Claude Code build, primary model, task, tools, and starting repository, Claudiator reduces time-to-correct-comprehension and unnecessary artifacts without reducing correctness, safety, or requested depth.

## Arms

| Arm | Treatment |
|---|---|
| `default` | Claude Code without a plugin |
| `concise` | Built-in Concise output style |
| `yagni` | One-line concise/YAGNI instruction |
| `ponytail` | Ponytail plugin, coding subset only |
| `claudiator` | Full local Claudiator treatment |
| `claudiator-semantic` | Claudiator with opt-in semantic display compression |

Each cell runs in a fresh workspace. Authentication comes from the host Claude profile, while `--setting-sources project,local`, `--strict-mcp-config`, and `--disable-slash-commands` exclude user settings, MCP servers, skills, and installed plugins. Only the treatment passed with `--plugin-dir` loads; verify this in startup logs after Claude Code upgrades. Arm order is seeded and randomized. The harness records Claude's JSON result, Claudiator's raw and displayed messages, repository patch, token usage, cost, duration, and turns. Raw CLI output is retained for audit. Non-Claudiator arms use their CLI result for both raw and displayed output because they have no Claudiator display hook.

Benchmark capture contains task content and is enabled only inside the generated, gitignored run directory. It is separate from production telemetry.

## Scoring order

1. Correctness.
2. Safety and protected-information retention.
3. Blinded time-to-correct-comprehension.
4. Human-marked removable content eliminated.
5. Visible words and artifact bloat.
6. Tokens, cost, latency, and repair turns.

Never collapse these into one score. Report per-task medians, category macro-averages, and paired bootstrap 95% confidence intervals. The harness skips Ponytail outside coding, comment, and coding no-op cases; its all-cell summary is descriptive and must not be compared with broader arms.

## Workflow

```text
instrument self-test
        |
        v
pilot -> annotate removable/required spans -> freeze PREREGISTRATION.md
        |
        v
locked holdout -> blinded review -> publish every result or do not release
```

Run the native smoke suite:

```sh
claude plugin eval . --runs 1 --ablation with-without --no-scaffold --no-publish --model haiku --max-cost-usd 1
```

Run the comparative harness:

```sh
node benchmark/run.mjs --selftest
node benchmark/run.mjs --arms default,concise,yagni,ponytail,claudiator --model haiku --runs 3
```
