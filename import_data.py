"""Build the local preview from the three retained public source snapshots."""
import argparse
import csv
from datetime import date
import hashlib
import json
import pathlib
import re
from urllib.parse import urljoin, urlsplit

ROOT = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--raw-dir', type=pathlib.Path, default=ROOT / 'data/raw')
parser.add_argument('--collected-at', type=date.fromisoformat, required=True)
args = parser.parse_args()
RAW = args.raw_dir.resolve()
COLLECTED = args.collected_at.isoformat()
records, protocols = [], []
sources = [
    dict(id='redhat', name='Red Hat', monogram='RH', color='#d34b43', url='https://huggingface.co/spaces/red-hat-emerging-technologies/coding-agent-leaderboard', description='Published software engineering and SRE results across several benchmarks.', format='CSV + JSON', limitation='Uneven coverage; some versions and conditions are missing.'),
    dict(id='openbench', name='OpenBench', monogram='OB', color='#4678d9', url='https://openbench.run/openbench/', description='Harness comparisons with a fixed model and shared task × trial cells.', format='JSON + JSONL', limitation='Small samples and disclosed caveats. Bundles stay separate.'),
    dict(id='harnessbench', name='Harness-Bench', monogram='HB', color='#8d62b1', url='https://www.harness-bench.ai/leaderboard.html', description='A configuration matrix across general and multimodal task suites.', format='Data embedded in the page', limitation='Mean score and full credit measure different objectives.'),
]
source_urls = {source['id']: source['url'] for source in sources}


def validate_identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,127}', value):
        raise ValueError('Invalid source identifier')
    return value


def validated_source_url(source, value):
    base = source_urls.get(source)
    if not base or not isinstance(value, str) or not value or any(ord(c) <= 32 or ord(c) == 127 or c == '\\' for c in value):
        raise ValueError('Invalid source URL')
    resolved = urljoin(base, value)
    parsed = urlsplit(resolved)
    if (parsed.scheme != 'https' or parsed.hostname != urlsplit(base).hostname
            or parsed.port not in (None, 443) or parsed.username is not None or parsed.password is not None):
        raise ValueError('Source URL must use the official HTTPS origin without credentials')
    return resolved


def number(value):
    if value is None or value == '':
        return None
    return float(value)


def publisher(model):
    name = model.lower()
    for terms, brand in [(['gpt', 'o3', 'o4'], 'OpenAI'), (['claude', 'opus', 'sonnet', 'haiku'], 'Anthropic'), (['glm'], 'Z.ai'), (['deepseek'], 'DeepSeek'), (['qwen'], 'Alibaba'), (['gemma', 'gemini'], 'Google'), (['kimi'], 'Moonshot AI'), (['grok'], 'xAI'), (['nemotron'], 'NVIDIA'), (['mistral'], 'Mistral AI')]:
        if any(term in name for term in terms):
            return brand
    return 'Other'


def model_name(name):
    aliases = {'gpt-5.6-sol': 'GPT-5.6 Sol', 'deepseek-v4-flash': 'DeepSeek V4 Flash', 'deepseek-v4-pro': 'DeepSeek V4 Pro', 'grok-4.5': 'Grok 4.5', 'glm-5.2': 'GLM 5.2', 'glm-5.3': 'GLM 5.3', 'glm-5.3-flash': 'GLM 5.3 Flash', 'kimi-k3': 'Kimi K3'}
    return aliases.get(name.lower(), name)


def add(record):
    record['url'] = validated_source_url(record['source'], record['url'])
    record.update(collected_at=COLLECTED, inference_provider=None, measured_at=None, origin='Result reported by its source', independently_reproduced=False)
    record['publisher'] = publisher(record['model'])
    record['pair'] = record['model'] + ' × ' + record['harness']
    record['id'] = hashlib.sha256((record['source'] + '|' + record['protocol'] + '|' + record['pair'] + '|' + str(len(records))).encode()).hexdigest()[:16]
    records.append(record)


rh = list(csv.DictReader((RAW / 'redhat.csv').open()))
for benchmark in dict.fromkeys(row['benchmark.name'] for row in rh):
    pid = 'rh-' + hashlib.sha256(benchmark.encode()).hexdigest()[:10]
    category = 'SRE / terminal' if any(x in benchmark for x in ['ITBench', 'Shellbench', 'Terminal']) else 'Software engineering'
    protocols.append(dict(id=pid, source='redhat', title=benchmark, short=benchmark, category=category, description='Grouped by benchmark name; the Red Hat export does not fully specify the protocol.', metrics={'score': 'Reported score'}, default_metric='score', sample_note='Source-reported task count; check task sets and conditions before comparing.', caution='Versions, task sets and conditions may differ: this table does not establish a controlled comparison.'))
    for row in [x for x in rh if x['benchmark.name'] == benchmark]:
        add(dict(source='redhat', protocol=pid, model=model_name(row['model.name']), original_model=row['model.name'], harness=row['harness.name'], harness_version=row.get('harness.version') or None, category=category, metrics={'score': number(row['metrics.score'])}, n=number(row['metrics.n_tasks']), sample_unit='reported tasks', solved=None, ci=None, cost=number(row['metrics.mean_cost_usd_per_task']), cost_basis='USD per task, as reported', duration=number(row['metrics.mean_agent_time_seconds_per_task']), duration_basis='Mean agent duration per task', tokens=number(row['metrics.mean_tokens_per_task']), tokens_basis='Mean tokens per task, reported accounting', published_at=None, url=sources[0]['url'] + '/blob/main/results.csv', caveats=['The full protocol is not included in this export.', 'Missing or zero reported cost is not interpreted as a free service.'], errors=number(row['metrics.n_errors'])))

ob = json.loads((RAW / 'openbench.json').read_text())
for bundle in ob['harness']['bundles']:
    if bundle['kind'] != 'release':
        continue
    pid = 'ob-' + validate_identifier(bundle['id'])
    protocols.append(dict(id=pid, source='openbench', title='OpenBench · ' + model_name(bundle['models'][0]), short=model_name(bundle['models'][0]), category='Software engineering / terminal', description='The same model and shared task × trial cells across this bundle’s harnesses.', metrics={'score': 'Solve rate'}, default_metric='score', sample_note='The denominator counts task × trial cells, not independent projects.', caution='Limited sample; caveats and exclusions are retained in each record.', digest=bundle['task_set_digest']))
    for arm in bundle['arms']:
        harness = {'claude': 'Claude Code', 'opencode': 'OpenCode', 'codex': 'Codex', 'pi': 'Pi', 'cursor': 'Cursor', 'devin': 'Devin', 'grokbuild': 'Grok Build', 'aider': 'Aider'}.get(arm['harness'], arm['harness'])
        add(dict(source='openbench', protocol=pid, model=model_name(arm['model']), original_model=arm['model'], harness=harness, harness_version=None, category='Software engineering / terminal', metrics={'score': arm['solve_rate']}, n=arm['n'], sample_unit='task × trial cells', solved=arm['solved'], ci=arm.get('wilson95'), cost=arm.get('cost_per_solve_usd'), cost_basis='USD per solve, when available', duration=arm.get('median_wall_s'), duration_basis='Median wall time of solved trials', tokens=arm.get('fresh_tokens_per_solve'), tokens_basis='Fresh tokens per solve; excludes cache reads', published_at=bundle['date'], url=bundle['path'], caveats=bundle['caveats'], errors=None))

hb = json.loads((RAW / 'harnessbench.json').read_text())
for suite in ['general', 'multimodal']:
    block = hb[suite]
    pid = 'hb-' + suite
    title = 'Harness-Bench · ' + ('General suite' if suite == 'general' else 'Multimodal suite')
    category = 'Agentic workflows' if suite == 'general' else 'Multimodal / web'
    protocols.append(dict(id=pid, source='harnessbench', title=title, short='General suite' if suite == 'general' else 'Multimodal suite', category=category, description=f"{block['tasks']} shared tasks; common conditions and scoring within this suite.", metrics={'score': 'Mean score', 'full_credit': 'Full-credit rate', 'r08': 'Score ≥ 0.80'}, default_metric='score', sample_note='One trial per task and configuration; not a measure of repeated-run stability.', caution='The mean score includes partial credit. The general suite spans several work categories, beyond software engineering.'))
    for row in block['configs']:
        add(dict(source='harnessbench', protocol=pid, model=model_name(row['model']), original_model=row['model'], harness=row['harness'], harness_version=None, category=category, metrics={'score': row['score']/100, 'full_credit': row['r1']/100, 'r08': row['r08']/100}, n=block['tasks'], sample_unit='tasks', solved=None, ci=None, cost=None if row.get('local_model') else row['cost_usd'], cost_basis='Estimated API cost per task; excludes infrastructure', duration=None, duration_basis='Duration not reported in this export', tokens=row['tokens_k']*1000, tokens_basis='Mean API tokens per task, including cache', published_at=None, url=sources[2]['url'], caveats=['Rounded scores published in the study’s table.', 'Local models: API cost is absent; this does not imply zero total cost.' if row.get('local_model') else 'Cost estimated at provider prices; not an attested invoice.'], errors=None))

assert len({r['id'] for r in records}) == len(records)
assert all(r['protocol'] in {p['id'] for p in protocols} for r in records)
assert all(0 <= value <= 1 for r in records for value in r['metrics'].values() if value is not None)
assert all(r['cost'] is None for r in records if r['source']=='harnessbench' and ('Gemma' in r['model'] or 'Qwen' in r['model']))
payload = dict(schema_version=1, collected_at=COLLECTED, preview=True, sources=sources, protocols=protocols, evaluations=records)
(ROOT / 'dist' / 'data.js').write_text('window.BENCHMARK_DATA = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c') + ';\n')
(ROOT / 'dist' / 'data.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'evaluations':len(records), 'protocols':len(protocols), 'models':len({r['model'] for r in records}), 'harnesses':len({r['harness'] for r in records})}))
