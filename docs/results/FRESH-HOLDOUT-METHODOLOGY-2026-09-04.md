# Fresh independent holdout methodology — 2026-09-04

Status: **frozen before execution**.

| Property | Value |
|---|---|
| Author | Context-isolated agent with no repository or prior-result access |
| Reviewer | Separate context-isolated agent with access only to the candidate suite and rationale |
| Cases | 6 natural requests |
| Arms | Default, built-in Concise, Claudiator |
| Repeats | 3 |
| Maximum cells | 54 |
| Model | Haiku |
| Claude Code | 2.1.260 |
| Cost ceiling | `$1.25` |
| Fingerprint | `803a84279e51ef9834aeb711c6f7627a069a59a4c385779404f6c75982b6f7a8` |

The author covered a terse fact, a professional status update, safe shell cleanup, requested technical depth, a minimal executable CommonJS artifact, and a correct no-op. None of the prompts asks for concision.

Before freeze, the reviewer corrected:

- Shell predicate ordering and safe equivalent commands.
- Explicit SQLite locking coverage.
- False positives and negatives in the initials artifact checks.
- No-op wording that could reject truthful non-mutation reports.
- Executable CommonJS behavior checks for normal, empty, whitespace-only, multi-part, and invalid inputs.

The reviewer found no remaining issue that invalidated the gate. Regexes remain screening anchors rather than complete semantic proofs, so technical claims and boundary failures require manual audit after execution without changing the formal score.
