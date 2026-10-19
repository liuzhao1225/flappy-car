"""Build demand-loaded pixel font subsets. Requires fonttools[woff]."""
from pathlib import Path
from hashlib import sha256
import re
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
source = root / 'node_modules/@fontsource/fusion-pixel-12px-monospaced-sc/files/fusion-pixel-12px-monospaced-sc-latin-400-normal.woff2'
output = root / 'assets/fonts/pixel'
output.mkdir(exist_ok=True)
for old in output.glob('*.woff2'):
    old.unlink()
coverage = set(TTFont(source).getBestCmap())
ui = set(range(32, 127))
for path in ['social.js', 'game.js', 'index.html', 'share.html']:
    ui.update(map(ord, (root / path).read_text()))
ui &= coverage
groups = {'ui': ui}
for point in sorted(coverage - ui):
    groups.setdefault(f'{point // 512:03x}', set()).add(point)

def ranges(points):
    result, start, end = [], None, None
    for point in sorted(points):
        if end is not None and point == end + 1:
            end = point
        else:
            if start is not None:
                result.append(f'U+{start:X}' + (f'-{end:X}' if start != end else ''))
            start = end = point
    result.append(f'U+{start:X}' + (f'-{end:X}' if start != end else ''))
    return ','.join(result)

css = ['/* Subset of Fusion Pixel, renamed Flappy Pixel under SIL OFL 1.1. */']
for name, points in groups.items():
    font = TTFont(source)
    options = subset.Options()
    options.flavor = 'woff2'
    options.recalc_timestamp = False
    cutter = subset.Subsetter(options=options)
    cutter.populate(unicodes=points)
    cutter.subset(font)
    # Fusion Pixel is a reserved font name; derived files use a new family.
    for record in font['name'].names:
        if record.nameID in [1, 3, 4, 6, 16]:
            record.string = ('FlappyPixel-Regular' if record.nameID == 6 else 'Flappy Pixel').encode(record.getEncoding())
    font.recalcTimestamp = False
    path = output / f'{name}.woff2'
    font.save(path)
    version = sha256(path.read_bytes()).hexdigest()[:12]
    css.append('@font-face{font-family:"Flappy Pixel";font-style:normal;font-weight:400;font-display:swap;'
               f'src:url("pixel/{name}.woff2?v={version}") format("woff2");unicode-range:{ranges(points)};}}')
(root / 'assets/fonts/pixel.css').write_text('\n'.join(css) + '\n')
ui_version = sha256((output / 'ui.woff2').read_bytes()).hexdigest()[:12]
for name in ['index.html', 'share.html']:
    path = root / name
    path.write_text(re.sub(r'assets/fonts/pixel/ui\.woff2(?:\?v=[a-f0-9]+)?', f'assets/fonts/pixel/ui.woff2?v={ui_version}', path.read_text()))
print(f'{len(ui)} UI glyphs: {(output / "ui.woff2").stat().st_size} bytes; {len(groups)-1} demand-loaded subsets')
