"""Create the single-file local preview from the static site, without dependencies."""
from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parent
html = (root / 'dist/index.html').read_text()
for asset in ['styles.css', 'data.js', 'app.js']:
    digest = hashlib.sha256((root / 'dist' / asset).read_bytes()).hexdigest()[:12]
    html = re.sub(r'((?:src|href)=")' + re.escape(asset) + r'(?:\?[^"<>]*)?"', lambda m: m[1] + asset + '?v=' + digest + '"', html)
(root / 'dist/index.html').write_text(html)
html = re.sub(r'<link rel="stylesheet" href="styles\.css(?:\?[^"<>]*)?">', lambda _: '<style>\n' + (root / 'dist/styles.css').read_text() + '\n</style>', html)
html = re.sub(r'<script src="(?:data|app)\.js(?:\?[^"<>]*)?" defer></script>', '', html)
javascript = (root / 'dist/data.js').read_text() + '\n' + (root / 'dist/app.js').read_text()
javascript = re.sub(r'</script', lambda m: '<\\/' + m[0][2:], javascript, flags=re.IGNORECASE)
html = html.replace('</body>', '<script>\n' + javascript + '\n</script>\n</body>')
assert '<script src=' not in html
assert '<link rel="stylesheet"' not in html
assert '<html lang="en">' in html
(root / 'Pairwise.html').write_text(html)
print('Built Pairwise.html with all scripts, styles and data embedded.')
