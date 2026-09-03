# Security

## Data handling

- Local mode sends no additional network requests.
- Metrics contain event names, character counts, and duration only—not prompts, responses, source code, paths, or credentials.
- Semantic rendering is off by default. When enabled, assistant text is sent to the Anthropic Messages API under the user's API account.
- Semantic output is displayed only after protected strings are verified. Any failure displays the original message.
- Claude Code retains the original transcript; Claudiator changes presentation only.
- The benchmark harness explicitly captures sanitized eval responses and diffs under `benchmark/runs/`. This opt-in path is gitignored and never enabled by normal plugin operation.

## Reporting

Do not open a public issue for a vulnerability. Contact the repository owner privately with impact, reproduction steps, and the affected version.
