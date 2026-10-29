# Reading model × harness evaluations

A configuration includes the model, harness, versions, task set, inference route,
budgets, tools and execution conditions. A score alone cannot establish a universal
winner. Keep results from different sources and protocols separate.

The explorer imports reported observations; it does not independently rerun the
experiments. Missing versions, inference providers and measurement dates remain
unknown. Collection date is not measurement date.

- Mean score can include partial credit; full-credit rate is a different metric.
- Cost per task and cost per solve retain different scopes.
- Durations may be means, medians, or measured only on solved attempts.
- Missing or reported zero API cost does not establish zero total cost.
- A missing pairing does not establish incompatibility.

JSON preserves observation metrics, source links and protocol context. CSV is
spreadsheet-oriented and currently exports the selected metric. Potential formula
text is prefixed with an apostrophe; use JSON for original text values.

No third-party benchmark results are distributed in the current public release.
All numeric results in the test fixtures are synthetic.
