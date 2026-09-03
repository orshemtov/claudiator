---
type: regex
target:
  source: file
  path: api_types.go
match: not_contains
flags: i
---
//\s*(?:this|the following|define|create|represent)
