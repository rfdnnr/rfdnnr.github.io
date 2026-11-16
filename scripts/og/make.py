# Builds the link-preview images (public/og/*.png) from the case files. Run: python3 scripts/og/make.py
import pathlib, re, subprocess, urllib.parse
root = pathlib.Path(__file__).resolve().parents[2]
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
tpl = root / 'scripts/og/og.html'
def shot(name, k, s):
    url = tpl.as_uri() + '?' + urllib.parse.urlencode({'k': k, 's': s})
    out = root / 'public/og' / f'{name}.png'  # converted to .jpg below
    subprocess.run([chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                    '--window-size=1200,630', '--virtual-time-budget=3000', f'--screenshot={out}', url],
                   check=True, capture_output=True)
for f in sorted((root / 'src/content/cases').glob('*.md')):
    fm = dict(re.findall(r'^(\w+): (.*)$', f.read_text().split('---')[1], re.M))
    k = 'Rafael Donner' if fm['order'] == '0' else f"{fm['label']} · Rafael Donner"
    shot(fm['slug'], k, fm['stmt'])
    if fm['order'] == '0': shot('home', k, fm['stmt'])
print('ok')
from PIL import Image
for p in (root / 'public/og').glob('*.png'):
    Image.open(p).convert('RGB').save(p.with_suffix('.jpg'), quality=84, optimize=True, progressive=True); p.unlink()
