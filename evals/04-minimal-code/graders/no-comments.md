---
type: regex
target:
  source: file
  path: counter.js
match: not_contains
---
(?m)^\s*(?://|/\*)
