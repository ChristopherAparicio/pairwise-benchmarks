"""Test importer rejection and standalone HTML escaping without running payloads."""
import ast
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'tests/fixtures/raw'
DATA = json.loads((ROOT / 'tests/fixtures/data.json').read_text())
tree = ast.parse((ROOT / 'import_data.py').read_text())
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {'validate_identifier', 'validated_source_url'}]
namespace = {'re': re, 'urljoin': urljoin, 'urlsplit': urlsplit, 'source_urls': {s['id']: s['url'] for s in DATA['sources']}}
exec(compile(ast.Module(body=functions, type_ignores=[]), 'import_data.py', 'exec'), namespace)


class Elements(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag == 'img':
            self.images.append(dict(attrs))


class SecurityTests(unittest.TestCase):
    def test_url_validation(self):
        validate = namespace['validated_source_url']
        for row in DATA['evaluations']:
            self.assertEqual(validate(row['source'], row['url']), row['url'])
        self.assertEqual(validate('openbench', 'bundle.json'), 'https://openbench.run/openbench/bundle.json')
        for value in ['javascript:alert(1)', 'data:text/html,test', '//evil.invalid/x', 'https://evil.invalid/x', 'https://openbench.run.evil.invalid/x', 'http://openbench.run/x', 'https://user@openbench.run/x', 'https://@openbench.run/x', 'https://openbench.run:8443/x', ' https://openbench.run/x', 'https://openbench.run/\nx', 'https://openbench.run\\@evil.invalid/x', 'https://openbench.run:bad/x', None]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate('openbench', value)

    def test_identifier_validation(self):
        validate = namespace['validate_identifier']
        for protocol in DATA['protocols']:
            self.assertEqual(validate(protocol['id']), protocol['id'])
        for value in ['x" onclick="alert(1)', '<img>', 'x\n', 'x' * 129, '', None, 4]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate(value)

    def test_failed_import_preserves_previous_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            sandbox = Path(directory)
            project = sandbox / 'outputs/site'
            raw = sandbox / 'work/benchmark-sources'
            (project / 'dist').mkdir(parents=True)
            raw.mkdir(parents=True)
            shutil.copyfile(ROOT / 'import_data.py', project / 'import_data.py')
            for name in ['redhat.csv', 'openbench.json', 'harnessbench.json']:
                shutil.copyfile(RAW / name, raw / name)
            original = json.loads((raw / 'openbench.json').read_text())
            for key, value in [('id', 'x" onclick="alert(1)'), ('path', 'javascript:alert(1)'), ('path', '//evil.invalid/x')]:
                with self.subTest(key=key, value=value):
                    fixture = json.loads(json.dumps(original))
                    next(b for b in fixture['harness']['bundles'] if b['kind'] == 'release')[key] = value
                    (raw / 'openbench.json').write_text(json.dumps(fixture))
                    for name in ['data.json', 'data.js']:
                        (project / 'dist' / name).write_text('previous valid snapshot')
                    result = subprocess.run(['python3', str(project / 'import_data.py'), '--raw-dir', str(raw), '--collected-at', '2000-01-01'], capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0)
                    for name in ['data.json', 'data.js']:
                        self.assertEqual((project / 'dist' / name).read_text(), 'previous valid snapshot')

    def test_standalone_closing_tags(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / 'dist').mkdir()
            shutil.copyfile(ROOT / 'build_preview.py', project / 'build_preview.py')
            (project / 'dist/index.html').write_text('<!doctype html><html lang="en"><head><link rel="stylesheet" href="styles.css"><script src="data.js" defer></script><script src="app.js" defer></script></head><body></body></html>')
            (project / 'dist/styles.css').write_text('body{}')
            (project / 'dist/app.js').write_text('void 0;')
            for closing in ['</script>', '</ScRiPt>', '</SCRIPT >', '</sCrIpT\n>']:
                with self.subTest(closing=closing):
                    payload = closing + '<img src=x onerror=alert(1)>'
                    (project / 'dist/data.js').write_text('window.BENCHMARK_DATA=' + json.dumps({'model': payload}) + ';')
                    subprocess.run(['python3', str(project / 'build_preview.py')], capture_output=True, check=True)
                    html = (project / 'Pairwise.html').read_text()
                    parser = Elements()
                    parser.feed(html)
                    self.assertEqual(parser.images, [])
                    self.assertIn(json.dumps(closing)[1:-1].replace('</', '<\\/'), html, 'Preserve the original string case and JSON escapes')


if __name__ == '__main__':
    unittest.main()
