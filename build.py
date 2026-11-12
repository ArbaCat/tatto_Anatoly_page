"""Inline style.css, app.js and assets/*.jpg into one standalone HTML file."""
import base64, pathlib, re, sys
src = pathlib.Path(sys.argv[1])          # anatoly-prototype/ folder
out = pathlib.Path(sys.argv[2])          # standalone html path
html = (src/'index.html').read_text()
css = (src/'style.css').read_text()
js = (src/'app.js').read_text()
def inline_assets(text):
    def rep(m):
        data = base64.b64encode((src/'assets'/m.group(1)).read_bytes()).decode()
        return f'data:image/jpeg;base64,{data}'
    return re.sub(r'assets/([\w-]+\.jpg)', rep, text)
assert '<link rel="stylesheet" href="style.css">' in html and '<script src="app.js" defer></script>' in html
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('  <script src="app.js" defer></script>\n', '')
html = html.replace('</body>', '<script>' + js + '</script>\n</body>')
html = inline_assets(html)
assert 'assets/' not in html, 'unresolved asset path'
out.write_text(html)
print(out, len(html))
