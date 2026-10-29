"""Check every imported numeric observation against the retained source artifacts.

This checks transcription and units, not the validity of the underlying experiments.
"""
import argparse
import csv
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw')
args = parser.parse_args()
RAW = args.raw_dir.resolve()
data = json.loads((ROOT / 'dist/data.json').read_text())
rows = data['evaluations']
protocols = {p['id']: p for p in data['protocols']}
checks = 0


def equal(actual, expected):
    global checks
    checks += 1
    if expected is None or expected == '':
        assert actual is None, (actual, expected)
    elif isinstance(expected, (int, float)):
        assert actual is not None and math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-12), (actual, expected)
    else:
        assert actual == expected, (actual, expected)


source_rh = list(csv.DictReader((RAW / 'redhat.csv').open()))
rh = [r for r in rows if r['source'] == 'redhat']
equal(len(rh), len(source_rh))
for actual, source in zip(rh, source_rh):
    equal(actual['original_model'], source['model.name'])
    equal(actual['harness'], source['harness.name'])
    equal(protocols[actual['protocol']]['title'], source['benchmark.name'])
    for key, column in [('n', 'metrics.n_tasks'), ('cost', 'metrics.mean_cost_usd_per_task'), ('duration', 'metrics.mean_agent_time_seconds_per_task'), ('tokens', 'metrics.mean_tokens_per_task'), ('errors', 'metrics.n_errors')]:
        equal(actual[key], float(source[column]) if source[column] else None)
    equal(actual['metrics']['score'], float(source['metrics.score']))
    equal(actual['harness_version'], source.get('harness.version') or None)

source_ob = json.loads((RAW / 'openbench.json').read_text())
expected_ob = []
for bundle in source_ob['harness']['bundles']:
    if bundle['kind'] != 'release':
        continue
    for arm in bundle['arms']:
        actual = next(r for r in rows if r['source'] == 'openbench' and r['protocol'] == 'ob-' + bundle['id'] and r['original_model'] == arm['model'] and r['harness'].lower().replace(' ', '') in [arm['harness'], 'claudecode' if arm['harness'] == 'claude' else arm['harness']])
        expected_ob.append(actual['id'])
        equal(actual['metrics']['score'], arm['solved'] / arm['n'])
        equal(actual['metrics']['score'], arm['solve_rate'])
        for key, source_key in [('n', 'n'), ('solved', 'solved'), ('cost', 'cost_per_solve_usd'), ('duration', 'median_wall_s'), ('tokens', 'fresh_tokens_per_solve'), ('ci', 'wilson95')]:
            equal(actual[key], arm.get(source_key))
        equal(actual['published_at'], bundle['date'])
        equal(actual['caveats'], bundle['caveats'])
equal(len(expected_ob), len([r for r in rows if r['source'] == 'openbench']))

source_hb = json.loads((RAW / 'harnessbench.json').read_text())
page = (RAW / 'harnessbench.html').read_text()
marker = re.search(r'const DATA\s*=\s*', page)
assert marker, 'Harness-Bench source page has no DATA object'
page_data, _ = json.JSONDecoder().raw_decode(page[marker.end():])
equal(source_hb, page_data)
expected_hb = 0
for suite in ['general', 'multimodal']:
    for source in source_hb[suite]['configs']:
        actual = next(r for r in rows if r['protocol'] == 'hb-' + suite and r['original_model'] == source['model'] and r['harness'] == source['harness'])
        expected_hb += 1
        for key, source_key in [('score', 'score'), ('full_credit', 'r1'), ('r08', 'r08')]:
            equal(actual['metrics'][key] * 100, source[source_key])
        equal(actual['n'], source_hb[suite]['tasks'])
        equal(actual['tokens'] / 1000, source['tokens_k'])
        equal(actual['cost'], None if source['local_model'] else source['cost_usd'])
        equal(actual['duration'], None)
equal(expected_hb, len([r for r in rows if r['source'] == 'harnessbench']))

assert len(rows) == len(source_rh) + len(expected_ob) + expected_hb
assert len({r['id'] for r in rows}) == len(rows)
assert all(r['inference_provider'] is None and r['measured_at'] is None for r in rows)
assert all(r['independently_reproduced'] is False for r in rows)
assert all(math.isfinite(v) and 0 <= v <= 1 for r in rows for v in r['metrics'].values() if v is not None)

evidence = {'observations_checked': len(rows), 'field_checks': checks, 'sources': {name: {'sha256': hashlib.sha256((RAW / name).read_bytes()).hexdigest(), 'bytes': (RAW / name).stat().st_size} for name in ['redhat.csv', 'openbench.json', 'harnessbench.html', 'harnessbench.json']}, 'scope': 'Import accuracy and units only; no benchmark experiments reproduced.'}
(ROOT / 'data-verification.json').write_text(json.dumps(evidence, indent=2) + '\n')
print(json.dumps(evidence))
