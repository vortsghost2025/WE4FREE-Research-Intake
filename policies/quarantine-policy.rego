package we4free.quarantine

# deny conditions — packet must not auto-advance
deny[reason] {
  input.risk == "high"
  reason := sprintf("risk is high: %s", [input.source_url])
}

deny[reason] {
  graph_confidence := input.graph_confidence
  graph_confidence.finalConfidence < 0.5
  reason := sprintf("confidence %.3f below 0.5 threshold", [graph_confidence.finalConfidence])
}

deny[reason] {
  not input.source_url
  reason := sprintf("missing source_url")
}

# flag conditions — packet needs human review but is not hard-denied
flag[reason] {
  input.requires_human_review == true
  reason := sprintf("packet requires_human_review")
}

# convenience: aggregate result
passing := not deny[_] and not flag[_]
