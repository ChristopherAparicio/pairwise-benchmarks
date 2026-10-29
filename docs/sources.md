# Source boundaries

Adapters currently understand local snapshots from:

- [Red Hat Coding Agent Leaderboard](https://huggingface.co/spaces/red-hat-emerging-technologies/coding-agent-leaderboard)
- [OpenBench](https://openbench.run/openbench/)
- [Harness-Bench](https://www.harness-bench.ai/leaderboard.html)

These are independent projects. Pairwise is not their official leaderboard and
does not claim ownership of their data. Do not infer data redistribution rights
from the license of this repository or from a source's software license alone.

The public release contains no copied benchmark snapshots. Source permissions and
attribution requirements must be resolved before adding any real result data to
Git or the public site. No automated collection is enabled.

For a local import, the ignored `data/raw/` directory expects `redhat.csv`,
`openbench.json`, `harnessbench.json`, and `harnessbench.html`. The HB JSON must be
the parsed DATA object from the corresponding retained HTML. Never execute
downloaded source JavaScript to extract data. Supply the real collection date to
the importer. Verification checks transcription and units, not scientific validity.

The separate `tests/fixtures/` files are authored synthetic test inputs. Their
model names are labels used to exercise filtering; their numbers are not results.
