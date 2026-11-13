"""Make the smaller copies of every portfolio photo in assets/works/.

For each original assets/works/<name>.jpg it writes
  <name>-480.jpg  thumbnails (the strip under the featured work)
  <name>-960.jpg  the featured work on phones and small screens
Originals are never upscaled: a photo narrower than the target is saved at its own size.
The original itself stays untouched and is what the detail view (with zoom) loads.

Usage (from the repository root):  python3 scripts/make_work_images.py
Needs Pillow (pip install pillow).
"""
import pathlib, re
from PIL import Image

WORKS = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'works'
SIZES = {480: 80, 960: 82}            # width -> JPEG quality
DERIVED = re.compile(r'-(%s)$' % '|'.join(map(str, SIZES)))

for original in sorted(WORKS.glob('*.jpg')):
    if DERIVED.search(original.stem):
        continue
    image = Image.open(original).convert('RGB')
    for width, quality in SIZES.items():
        copy = image.copy()
        if copy.width > width:
            copy = copy.resize((width, round(width * copy.height / copy.width)), Image.LANCZOS)
        out = original.with_name(f'{original.stem}-{width}.jpg')
        copy.save(out, 'JPEG', quality=quality, optimize=True, progressive=True)
        print(f'{out.name:24} {copy.width}x{copy.height}  {out.stat().st_size // 1024} KB')
