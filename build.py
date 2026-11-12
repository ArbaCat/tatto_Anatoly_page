"""Inline style.css, app.js and assets/*.jpg into one standalone HTML file.

Usage: python3 build.py <site folder> <output.html>
"""
import base64, pathlib, re, sys

if len(sys.argv) != 3:
    sys.exit(__doc__.strip())
src = pathlib.Path(sys.argv[1])          # site folder (index.html, style.css, app.js, assets/)
out = pathlib.Path(sys.argv[2])          # standalone html path

# Explicit UTF-8: the texts are Slovak (č, ť, ž…) and the platform default is not UTF-8 everywhere.
read = lambda name: (src / name).read_text(encoding='utf-8')
html, css, js = read('index.html'), read('style.css'), read('app.js')

STYLE = re.compile(r'[ \t]*<link rel="stylesheet" href="style\.css">\r?\n?')
SCRIPT = re.compile(r'[ \t]*<script src="app\.js" defer></script>\r?\n?')
for pattern, what in ((STYLE, 'style.css <link>'), (SCRIPT, 'app.js <script>')):
    if len(pattern.findall(html)) != 1:
        sys.exit(f'index.html: expected exactly one {what} tag')

def inline_assets(text):
    def rep(m):
        data = base64.b64encode((src / 'assets' / m.group(1)).read_bytes()).decode()
        return f'data:image/jpeg;base64,{data}'
    return re.sub(r'assets/([\w-]+\.jpg)', rep, text)

html = STYLE.sub(lambda m: '<style>' + css + '</style>\n', html)
html = SCRIPT.sub('', html)
if html.count('</body>') != 1:
    sys.exit('index.html: expected exactly one </body>')
html = html.replace('</body>', '<script>' + js + '</script>\n</body>')
html = inline_assets(html)
if 'assets/' in html:
    sys.exit('unresolved asset path (only assets/*.jpg can be inlined)')
out.write_text(html, encoding='utf-8')
print(out, len(html))
