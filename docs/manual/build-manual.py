"""Builds the public user manual from its chapters.

The chapters (docs/manual/_capitulos/*.json) are the source: steps, marks and
notes, written while each flow was walked in the app. The page goes to
apps/web/public/manual/, which the build copies as is, so it is served at
/pickypop/manual/ without going through the app's router or its login.

    python3 docs/manual/build-manual.py              # the public page
    python3 docs/manual/build-manual.py --fragment F # the body alone, for an Artifact
"""
import glob
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHAPTERS = os.path.join(HERE, '_capitulos')
PUBLIC = os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'manual', 'index.html')
WHO = {'dueño': 'Para el dueño', 'operador': 'Para el operador', 'todos': 'Para todos'}

STYLE = """
/* Layout: a sticky chapter index on the left, one reading column on the right; one column on a phone. */
:root {
  --bg: #fbfaf9; --surface: #ffffff; --text: #1c1b1a; --muted: #6f6b66;
  --line: #e4e1dd; --accent: #b4532a; --accent-soft: #f7ebe5; --on-accent: #ffffff;
  --mark: #e5484d; --tip: #1f6b43; --tip-soft: #e5f2ea; --warn: #8a5a00; --warn-soft: #fbf0db;
  --display: 'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif;
  --body: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #17161a; --surface: #201f24; --text: #ece9e6; --muted: #a09b95; --line: #34323a;
  --accent: #e0855c; --accent-soft: #3a2a23; --on-accent: #241410; --mark: #f2726f;
  --tip: #87d6a8; --tip-soft: #1d3327; --warn: #f0c46a; --warn-soft: #3a2f17; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #17161a; --surface: #201f24; --text: #ece9e6; --muted: #a09b95; --line: #34323a;
  --accent: #e0855c; --accent-soft: #3a2a23; --on-accent: #241410; --mark: #f2726f;
  --tip: #87d6a8; --tip-soft: #1d3327; --warn: #f0c46a; --warn-soft: #3a2f17; color-scheme: dark }
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 var(--body); padding-inline: 16px }
img { max-width: 100% }
header.cover .back { display: inline-block; margin-top: 1rem; font-weight: 700; color: var(--accent) }
.shell { display: grid; grid-template-columns: 17rem minmax(0, 1fr); gap: 3rem; max-width: 76rem; margin: 0 auto; padding-block: 2rem 5rem }
nav.toc { position: sticky; top: env(safe-area-inset-top, 0px); align-self: start; max-height: 100vh; overflow-y: auto; padding-block: 1rem; font-size: .9rem }
nav.toc .brand { font: 700 1.1rem var(--display); color: var(--accent); margin: 0 0 1rem }
nav.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .15rem }
nav.toc > ol > li > a { font-weight: 700; display: block; padding: .3rem .5rem; border-radius: 6px; color: var(--text); text-decoration: none }
nav.toc > ol > li > a:hover { background: var(--accent-soft) }
nav.toc ol ol { margin: .1rem 0 .6rem .6rem; border-left: 1px solid var(--line) }
nav.toc ol ol a { display: block; padding: .15rem .6rem; color: var(--muted); text-decoration: none; line-height: 1.35 }
nav.toc ol ol a:hover { color: var(--accent) }
main { min-width: 0; max-width: 52rem }
header.cover { padding-block: 1rem 2rem; border-bottom: 1px solid var(--line); margin-bottom: 2rem }
header.cover p.eyebrow { margin: 0; text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; color: var(--accent); font-weight: 700 }
h1, h2, h3 { font-family: var(--display); text-wrap: balance; line-height: 1.15 }
h1 { font-size: clamp(2rem, 5vw, 2.8rem); margin: .3rem 0 .8rem }
header.cover .lede { font-size: 1.1rem; color: var(--muted); max-width: 40rem; margin: 0 }
.legend-key { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; margin-top: 1.2rem; font-size: .9rem; color: var(--muted) }
.legend-key span { display: inline-flex; align-items: center; gap: .45rem }
section.chapter { padding-block: 1.5rem 1rem; border-top: 1px solid var(--line); margin-top: 1.5rem }
section.chapter:first-of-type { border-top: 0; margin-top: 0 }
.chapter-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .4rem 1rem }
.chapter-head .num { font: 700 1rem var(--display); color: var(--accent) }
h2 { font-size: 1.9rem; margin: 0 }
.who { font-size: .78rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: .15rem .55rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent) }
.chapter > p.intro { color: var(--muted); font-size: 1.05rem; margin: .7rem 0 1.5rem; max-width: 42rem }
article.sec { margin-block: 2.2rem }
h3 { font-size: 1.3rem; margin: 0 0 .4rem }
article.sec > p.intro { margin: 0 0 1rem; max-width: 42rem }
ol.steps { list-style: none; counter-reset: step; margin: 0; padding: 0; display: grid; gap: 1.1rem }
ol.steps > li { counter-increment: step; display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .8rem }
ol.steps > li::before { content: counter(step); font: 700 .95rem/2rem var(--display); text-align: center; width: 2rem; height: 2rem; border-radius: 50%; border: 1.5px solid var(--accent); color: var(--accent) }
ol.steps p { margin: .2rem 0 0; max-width: 42rem }
figure { margin: .8rem 0 0; display: grid; gap: .6rem }
figure a { display: block; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--surface) }
figure img { display: block; width: 100%; height: auto }
figure a:focus-visible, nav a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px }
ul.marks { list-style: none; margin: 0; padding: 0; display: grid; gap: .3rem; font-size: .93rem }
ul.marks li { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); gap: .5rem; align-items: start }
.dot { width: 1.45rem; height: 1.45rem; border-radius: 50%; background: var(--mark); color: #fff; font: 700 .8rem/1.45rem var(--body); text-align: center; flex: none }
.note { border-radius: 10px; padding: .75rem 1rem; margin-top: 1rem; max-width: 44rem }
.note p { margin: 0 }
.note p + p { margin-top: .5rem }
.note b { display: block; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; margin-bottom: .25rem }
.note.tip { background: var(--tip-soft); color: var(--text) }
.note.tip b { color: var(--tip) }
.note.warn { background: var(--warn-soft); color: var(--text) }
.note.warn b { color: var(--warn) }
details.mobile-toc { display: none }
@media (max-width: 900px) {
  .shell { grid-template-columns: minmax(0, 1fr); gap: 0; padding-block: 1rem 4rem }
  nav.toc { display: none }
  details.mobile-toc { display: block; border: 1px solid var(--line); border-radius: 10px; padding: .6rem .9rem; margin-bottom: 1.5rem; background: var(--surface) }
  details.mobile-toc summary { font-weight: 700; cursor: pointer }
  details.mobile-toc ol { margin: .5rem 0 0; padding-left: 1.2rem }
  details.mobile-toc a { color: var(--text) }
  ol.steps > li { grid-template-columns: 1.7rem minmax(0, 1fr); gap: .6rem }
  ol.steps > li::before { width: 1.7rem; height: 1.7rem; line-height: 1.7rem; font-size: .85rem }
}
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth } }
"""


def esc(text):
    """Escapes, then turns «quoted UI names» into emphasis so buttons stand out."""
    out = html.escape(text or '')
    return re.sub(r'«([^»]{1,80})»', r'«<strong>\1</strong>»', out)


def slug(text):
    s = re.sub(r'[^a-z0-9]+', '-', text.lower().translate(str.maketrans('áéíóúñü', 'aeiounu'))).strip('-')
    return s[:48] or 'seccion'


def main():
    chapters = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(CHAPTERS, '*.json')))]
    toc, mobile, body = [], [], []
    for c in chapters:
        cid = f"cap{c['n']}"
        subs = []
        secs_html = []
        for i, s in enumerate(c['sections'], 1):
            sid = f"{cid}-{i}-{slug(s['title'])}"
            subs.append(f'<li><a href="#{sid}">{esc(s["title"])}</a></li>')
            steps = []
            for st in s['steps']:
                fig = ''
                if st.get('image'):
                    marks = ''.join(
                        f'<li><span class="dot">{m["n"]}</span><span>{esc(m.get("label", ""))}</span></li>'
                        for m in st.get('marks', [])
                    )
                    alt = html.escape(re.sub(r'[«»]', '', st['text'])[:140])
                    fig = (f'<figure><a href="{st["image"]}" target="_blank" rel="noopener">'
                           f'<img src="{st["image"]}" alt="{alt}" loading="lazy" width="1280" height="800"></a>'
                           + (f'<ul class="marks">{marks}</ul>' if marks else '') + '</figure>')
                steps.append(f'<li><div><p>{esc(st["text"])}</p>{fig}</div></li>')
            notes = ''
            if s.get('tips'):
                notes += '<div class="note tip"><b>Consejo</b>' + ''.join(f'<p>{esc(t)}</p>' for t in s['tips']) + '</div>'
            if s.get('warnings'):
                notes += '<div class="note warn"><b>Ojo</b>' + ''.join(f'<p>{esc(t)}</p>' for t in s['warnings']) + '</div>'
            intro = f'<p class="intro">{esc(s["intro"])}</p>' if s.get('intro') else ''
            secs_html.append(f'<article class="sec" id="{sid}"><h3>{esc(s["title"])}</h3>{intro}'
                             f'<ol class="steps">{"".join(steps)}</ol>{notes}</article>')
        toc.append(f'<li><a href="#{cid}">{c["n"]}. {esc(c["title"])}</a><ol>{"".join(subs)}</ol></li>')
        mobile.append(f'<li><a href="#{cid}">{esc(c["title"])}</a></li>')
        who = WHO.get(c.get('who', 'todos'), 'Para todos')
        body.append(f'<section class="chapter" id="{cid}"><div class="chapter-head"><span class="num">Capítulo {c["n"]}</span>'
                    f'<h2>{esc(c["title"])}</h2><span class="who">{who}</span></div>'
                    f'<p class="intro">{esc(c.get("intro", ""))}</p>{"".join(secs_html)}</section>')

    page = f"""<title>Manual de Pickypop</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&display=swap">
<style>{STYLE}</style>
<div class="shell">
<nav class="toc" aria-label="Capítulos"><p class="brand">Manual de Pickypop</p><ol>{''.join(toc)}</ol></nav>
<main>
<header class="cover">
<p class="eyebrow">Taller de impresión 3D · Surquillo</p>
<h1>Manual de Pickypop</h1>
<p class="lede">Cómo hacer cada tarea del taller en la aplicación, paso por paso y con la pantalla delante: configurar, comprar, cargar el catálogo, imprimir, armar, vender, cobrar y leer los resultados.</p>
<div class="legend-key"><span><span class="dot">1</span> En las capturas, los números rojos marcan dónde tocar, en orden.</span><span>Los nombres entre «comillas» son botones y campos tal como aparecen.</span></div>
<a class="back" href="../">Abrir Pickypop →</a>
</header>
<details class="mobile-toc"><summary>Capítulos</summary><ol>{''.join(mobile)}</ol></details>
{''.join(body)}
</main>
</div>
"""
    if '--fragment' in sys.argv:
        out = sys.argv[sys.argv.index('--fragment') + 1]
        open(out, 'w').write(page)
    else:
        out = os.path.normpath(PUBLIC)
        head, body = page.split('<div class="shell">', 1)
        open(out, 'w').write(DOCUMENT.format(head=head.strip(), body='<div class="shell">' + body))
    print(out, len(page), 'bytes,', sum(len(c['sections']) for c in chapters), 'sections')


# A standalone page: the Artifact viewer adds this skeleton itself, Pages does not.
DOCUMENT = '''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Cómo hacer cada tarea del taller en Pickypop, paso por paso y con capturas.">
{head}
</head>
<body>
{body}
</body>
</html>
'''


main()
