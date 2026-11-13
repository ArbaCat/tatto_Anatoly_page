"""Build the portfolio from data/works.json (Anatoly edits it in Pages CMS, see .pages.yml).

For every work, in the order of the list (the first one is shown first):
  1. A freshly uploaded photo is tidied: turned upright, converted to an sRGB JPEG of at most
     2560 px on the long side, stripped of camera metadata (EXIF, GPS, XMP) and renamed after
     the title, assets/works/<slug>.jpg. The new path is written back to data/works.json.
     Photos that are already tidy (a JPEG with a simple name, no EXIF, not too large) stay untouched.
  2. assets/works/sizes/<name>-480.jpg (thumbnails) and <name>-960.jpg (phones) are written.
     The original is what the detail view (with zoom) loads.
  3. index.html gets the new portfolio: the first work on the stage and in the caption, both
     counters and the <ul id="work-list"> that app.js builds everything else from.

Usage (from the repository root):  python3 scripts/build_works.py
Needs Pillow, and pillow-heif for iPhone HEIC photos:  pip install pillow pillow-heif
GitHub runs it after every change (.github/workflows/works.yml).
"""
import html, io, json, pathlib, re, sys, unicodedata, urllib.parse
from PIL import Image, ImageCms, ImageOps

try:  # optional: only needed when someone uploads a HEIC photo
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'works.json'
INDEX = ROOT / 'index.html'
WORKS = ROOT / 'assets' / 'works'
SIZED = WORKS / 'sizes'
SIZES = {480: 80, 960: 82}            # width -> JPEG quality of the smaller copies
MAX_SIDE, ORIGINAL_QUALITY = 2560, 86  # tidied originals
TIDY_NAME = re.compile(r'[a-z0-9][a-z0-9_-]*\.jpg')
SRGB = ImageCms.createProfile('sRGB')


def fail(message):
    sys.exit(f'build_works: {message}')


def clean(work, key, number):
    """Optional text field as one line ('' when missing). Pages CMS may store null or omit it."""
    value = work.get(key)
    if value is None:
        return ''
    if not isinstance(value, str):
        fail(f'work {number}: "{key}" must be text')
    return ' '.join(value.split())


def crop(value, number):
    """Thumbnail focus "X% Y%". Forgiving: "50 30", "50%,30%" work too; empty means the centre."""
    if not value:
        return '50% 50%'
    found = re.fullmatch(r'(\d{1,3})\s*%?\s*[\s,;/]\s*(\d{1,3})\s*%?', value)
    if not found:
        print(f'work {number}: crop "{value}" not understood, using the centre')
        return '50% 50%'
    x, y = (min(100, int(n)) for n in found.groups())
    return f'{x}% {y}%'


def photo_path(value, number):
    """The photo must be a file directly in assets/works/ (no other folders, no "..")."""
    if not isinstance(value, str) or not value.strip():
        fail(f'work {number}: no photo')
    relative = urllib.parse.unquote(value.strip()).lstrip('/')
    path = (ROOT / relative).resolve()
    if path.parent != WORKS.resolve():
        fail(f'work {number}: photo must be in assets/works/, got "{value}"')
    if not path.is_file():
        fail(f'work {number}: photo "{value}" does not exist')
    return path


def open_photo(path, number):
    try:
        return Image.open(path)
    except (OSError, Image.DecompressionBombError) as error:
        fail(f'work {number}: cannot open {path.name} ({error}); HEIC photos need pillow-heif')


def is_srgb(icc):
    """True when the embedded profile has the sRGB primaries (whatever its name, e.g. "uRGB")."""
    try:
        profile = ImageCms.ImageCmsProfile(io.BytesIO(icc)).profile
        reference = SRGB.profile if hasattr(SRGB, 'profile') else SRGB
        pairs = [(getattr(profile, f'{c}_colorant')[0], getattr(reference, f'{c}_colorant')[0])
                 for c in ('red', 'green', 'blue')]
        return all(abs(a - b) < 0.01 for xyz, ref in pairs for a, b in zip(xyz, ref))
    except Exception:  # unreadable or unusual profile: leave the colours as they are
        return True


def web_rgb(image):
    """Upright RGB pixels in sRGB, no metadata."""
    icc = image.info.get('icc_profile')
    image = ImageOps.exif_transpose(image)
    if icc and image.mode in ('RGB', 'CMYK') and not is_srgb(icc):
        try:
            image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(icc)), SRGB, outputMode='RGB')
        except ImageCms.PyCMSError:
            pass
    image = image.convert('RGB')
    image.info = {}
    return image


def jpeg(image, quality):
    buffer = io.BytesIO()
    image.save(buffer, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buffer.getvalue()


def write(path, data):
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)
        print(f'  wrote {path.relative_to(ROOT)}  {len(data) // 1024} KB')


def slug(title):
    plain = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', plain).strip('-')[:60].strip('-') or 'praca'


def needs_tidy(path, image):
    return (image.format != 'JPEG' or not TIDY_NAME.fullmatch(path.name) or len(image.getexif())
            or 'xmp' in image.info or max(image.size) > MAX_SIDE)


def tidy(path, image, title):
    """Re-encode a new upload as assets/works/<slug>.jpg; returns the new path."""
    rgb = web_rgb(image)
    if max(rgb.size) > MAX_SIDE:
        scale = MAX_SIDE / max(rgb.size)
        rgb = rgb.resize((round(rgb.width * scale), round(rgb.height * scale)), Image.LANCZOS)
    base, n = slug(title), 1
    target = WORKS / f'{base}.jpg'
    while target.exists() and target != path:
        n += 1
        target = WORKS / f'{base}-{n}.jpg'
    data = jpeg(rgb, ORIGINAL_QUALITY)
    target.write_bytes(data)
    if target != path:
        path.unlink()
    print(f'  tidied {path.name} -> {target.name}  {rgb.width}x{rgb.height}  {len(data) // 1024} KB')
    return target


def load():
    try:
        works = json.loads(DATA.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        fail(f'cannot read {DATA.relative_to(ROOT)}: {error}')
    if isinstance(works, dict):  # tolerate {"works": [...]}
        works = works.get('works')
    if not isinstance(works, list) or not works or not all(isinstance(w, dict) for w in works):
        fail(f'{DATA.relative_to(ROOT)} must be a non-empty list of works')
    return works


def build(works):
    checked = []
    for number, work in enumerate(works, 1):  # check the whole list before changing any file
        title = clean(work, 'title', number) or fail(f'work {number}: no title')
        path = photo_path(work.get('photo'), number)
        open_photo(path, number).close()
        checked.append((number, work, title, path))
    SIZED.mkdir(exist_ok=True)
    renamed, entries = {}, []
    for number, work, title, path in checked:
        print(f'{number:02d} {title}')
        if path in renamed:  # the same upload used twice
            path = renamed[path]
        else:
            with open_photo(path, number) as image:
                if needs_tidy(path, image):
                    tidied = tidy(path, image, title)
                    renamed[path] = tidied
                    path = tidied
        work['photo'] = f'assets/works/{path.name}'
        with open_photo(path, number) as image:
            rgb = web_rgb(image)
        sizes = {}
        for width, quality in SIZES.items():
            copy = rgb.copy()
            if copy.width > width:
                copy = copy.resize((width, round(width * copy.height / copy.width)), Image.LANCZOS)
            write(SIZED / f'{path.stem}-{width}.jpg', jpeg(copy, quality))
            sizes[width] = copy.size
        description = clean(work, 'description', number)
        entries.append({
            'full': work['photo'], 'stem': path.stem, 'w': rgb.width, 'h': rgb.height, 'thumb': sizes[480],
            'title': title, 'category': clean(work, 'category', number), 'description': description,
            'alt': clean(work, 'alt', number) or title, 'crop': crop(clean(work, 'crop', number), number)})
    keep = {f'{e["stem"]}-{width}.jpg' for e in entries for width in SIZES}
    for old in SIZED.glob('*.jpg'):
        if old.name not in keep:
            old.unlink()
            print(f'  removed {old.relative_to(ROOT)} (no longer in the list)')
    return entries, bool(renamed)


def replace(text, pattern, replacement, what):
    text, count = re.subn(pattern, replacement, text, flags=re.S)
    if count != 1:
        fail(f'index.html: expected exactly one {what}, found {count}')
    return text


def render(text, entries):
    a = lambda value: html.escape(str(value), quote=True)
    first, total = entries[0], f'01 / {len(entries):02d}'
    # Same rule as setSource() in app.js: the 960 px copy for phones when the original is larger.
    source = (f'src="assets/works/sizes/{first["stem"]}-960.jpg" srcset="assets/works/sizes/{first["stem"]}-960.jpg 960w, '
              f'{a(first["full"])} {first["w"]}w"' if first['w'] > 960 else f'src="{a(first["full"])}"')
    text = replace(text, r'(<button class="featured-stage" id="open-featured" aria-label="Zobraziť detail: )[^"]*(">\s*<img class="is-active" )'
                   r'src="[^"]*"(?: srcset="[^"]*")?( sizes="[^"]*" alt=")[^"]*(">)',
                   lambda m: f'{m[1]}{a(first["title"])}{m[2]}{source}{m[3]}{a(first["alt"])}{m[4]}', 'featured stage')
    text = replace(text, r'(<div class="work-caption stack" id="work-caption">)<div class="is-active">.*?</div>(</div>)',
                   lambda m: (f'{m[1]}<div class="is-active"><p class="caption">{a(first["category"])}</p><h3>{a(first["title"])}</h3>'
                              f'<p class="work-desc">{a(first["description"])}</p></div>{m[2]}'), 'work caption')
    text = replace(text, r'(id="work-counter" aria-hidden="true"><span class="is-active">)[^<]*(</span>)',
                   lambda m: f'{m[1]}{total}{m[2]}', 'work counter')
    text = replace(text, r'(<span class="counter" id="viewer-count">)[^<]*(</span>)', lambda m: f'{m[1]}{total}{m[2]}', 'viewer counter')
    items = []
    for index, e in enumerate(entries):
        description = f' data-description="{a(e["description"])}"' if e['description'] else ''
        current = ' aria-current="true"' if index == 0 else ''
        items.append(
            f'<li style="--pos:{e["crop"]}"><a class="thumb" href="{a(e["full"])}" data-w="{e["w"]}" data-h="{e["h"]}" '
            f'data-title="{a(e["title"])}" data-category="{a(e["category"])}"{description}{current}>'
            f'<img src="assets/works/sizes/{e["stem"]}-480.jpg" width="{e["thumb"][0]}" height="{e["thumb"][1]}" '
            f'alt="{a(e["alt"])}" fetchpriority="low" decoding="async"></a></li>')
    return replace(text, r'(<ul class="thumbs" id="work-list" aria-label="[^"]*">\n)(.*?)(\n([ \t]*)</ul>)',
                   lambda m: m[1] + '\n'.join(m[4] + '  ' + item for item in items) + m[3], 'work list')


def main():
    works = load()
    entries, renamed = build(works)
    if renamed:
        DATA.write_text(json.dumps(works, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'  updated {DATA.relative_to(ROOT)} (new photo names)')
    before = INDEX.read_text(encoding='utf-8')
    after = render(before, entries)
    if after != before:
        INDEX.write_text(after, encoding='utf-8')
        print('  updated index.html')
    print(f'{len(entries)} works')


if __name__ == '__main__':
    main()
