---
type: regex
target:
  source: file
  path: counter.js
match: contains
---
(?:return\s+value\s*\+\s*1|=>\s*value\s*\+\s*1)
