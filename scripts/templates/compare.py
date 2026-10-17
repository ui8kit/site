# Compares the renders of the template runtimes (JSON maps from render.php / render.py / the templ renderer) after normalising the
# markup (tags, attributes with collapsed whitespace and sorted, text with collapsed whitespace; comments dropped).
# Usage: python3 compare.py name=file.json name=file.json ...  -> per runtime: rendered, errors; per pair: equal / compared.
import json, re, sys
from html.parser import HTMLParser

class Canon(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.out = []
    def handle_starttag(self, tag, attrs):
        a = sorted((k, re.sub(r"\s+", " ", (v or "")).strip()) for k, v in attrs)
        self.out.append(("<", tag, tuple(a)))
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag): self.out.append((">", tag))
    def handle_data(self, data):
        t = re.sub(r"\s+", " ", data).strip()
        if t: self.out.append(("t", t))

def canon(html):
    p = Canon(); p.feed(html); p.close(); return p.out

def strip_ext(k):
    return re.sub(r"\.(html\.twig|latte|html\.j2|templ)$", "", k)

runs = {}
for a in sys.argv[1:]:
    name, f = a.split("=", 1)
    runs[name] = {strip_ext(k): v for k, v in json.load(open(f)).items()}
fail = 0
for n, r in runs.items():
    errs = [k for k, v in r.items() if v.startswith("ERROR")]
    print(f"{n}: {len(r)} rendered, {len(errs)} errors")
    for k in errs[:5]: print(f"  {k}: {r[k][:160]}")
    fail += len(errs)
names = list(runs)
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        a, b = runs[names[i]], runs[names[j]]
        keys = sorted(k for k in set(a) & set(b) if not a[k].startswith("ERROR") and not b[k].startswith("ERROR"))
        diff = [k for k in keys if canon(a[k]) != canon(b[k])]
        print(f"{names[i]} vs {names[j]}: {len(keys) - len(diff)}/{len(keys)} equal" + (f"; differ: {', '.join(diff[:8])}" if diff else ""))
sys.exit(1 if fail else 0)
