---
type: regex
target:
  source: file
  path: api_types.go
match: contains
---
// \+kubebuilder:validation:Minimum=1\s+type Count int
