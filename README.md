# Pairwise

An open-source project for exploring model × harness benchmark configurations,
with separate protocols, explicit provenance and reusable structured observations.

**[Project page](https://ChristopherAparicio.github.io/pairwise-benchmarks/)**

## Current public release

This release publishes the project presentation, explorer source code, import
and verification scripts, and tests. **Third-party benchmark snapshots are not
included or served.** Their redistribution and attribution terms are still being
reviewed. The project page is a presentation, not a live results leaderboard.

The small dataset in `tests/fixtures/` is synthetic test data. Its values are
invented and must never be presented as benchmark evidence.

## Repository layout

| Path | Purpose |
| --- | --- |
| `site/` | Public presentation served by GitHub Pages |
| `dist/` | Static explorer source; real data assets remain ignored |
| `import_data.py` | Normalize locally supplied source snapshots |
| `verify_data.py` | Check transcription and units against supplied snapshots |
| `build_preview.py` | Build a standalone local HTML preview |
| `tests/fixtures/` | Synthetic fixtures used by automated checks |
| `docs/` | Methodology and source/publication boundaries |

Python 3.11+ and Node.js 22+ are sufficient. There are no package dependencies.

```sh
node --check dist/app.js
node test_filters.mjs
node test_security.mjs
python3 test_security.py -v
```

The default tests use only synthetic fixtures. To run the explorer locally,
provide source files under the ignored `data/raw/` directory (see
[source inputs](docs/sources.md)), then set their actual collection date:

```sh
python3 import_data.py --raw-dir data/raw --collected-at YYYY-MM-DD
python3 verify_data.py --raw-dir data/raw
python3 build_preview.py
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

These commands read local files. They do not fetch live results or rerun benchmarks.
The generated snapshot and standalone preview remain ignored by Git.

To preview the public presentation, serve `site/` instead of `dist/`.

## Security and publication

Install [Gitleaks](https://github.com/gitleaks/gitleaks) and enable the local hooks:

```sh
git config core.hooksPath .githooks
gitleaks git --redact --no-banner --log-opts="--all"
```

The commit hook checks staged changes; the push hook checks Git history. CI checks
history, source and tests before deploying **only `site/`**. Actions are pinned to
commit SHAs and the Gitleaks download has a pinned SHA-256. Pull requests do not
receive Pages deployment permissions. Do not add secrets, private notes, raw
snapshots or generated benchmark data to commits.

The explorer restricts source links to official HTTPS origins, escapes HTML
identifiers and standalone script delimiters, and neutralizes spreadsheet-formula
prefixes in CSV. JSON preserves canonical values. These checks are not a promise
that all possible security issues have been eliminated.

## License and data

The project's original code is under [MIT](LICENSE). This license does not grant
rights over third-party source data. See [methodology](docs/methodology.md) and
[source boundaries](docs/sources.md).
