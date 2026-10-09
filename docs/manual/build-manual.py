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
/* The colors are the app's own palettes (apps/web/src/_palettes.scss), written by palette_css(). */
:root {
  --mark: #e5484d;
  --display: 'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif;
  --body: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif;
}
* { box-sizing: border-box }
/* The panel uses display: grid, which would otherwise beat the hidden attribute. */
[hidden] { display: none !important }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 var(--body); padding-inline: 16px }
img { max-width: 100% }
/* Diagonal lines like cma208.github.io (.relief-lines): clean behind the middle of the page, visible toward the edges. */
:root { --relief: color-mix(in srgb, var(--line-strong) 50%, transparent) }
body::before {
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: repeating-linear-gradient(-45deg, var(--relief) 0 1.5px, transparent 1.5px 10px); opacity: .48;
  -webkit-mask-image: radial-gradient(ellipse 78% 66% at 50% 46%, transparent 0 30%, #000 80%);
  mask-image: radial-gradient(ellipse 78% 66% at 50% 46%, transparent 0 30%, #000 80%);
}
header.cover .back { display: inline-block; margin-top: 1rem; font-weight: 700; color: var(--accent) }
.shell { position: relative; z-index: 1; display: grid; grid-template-columns: 17rem minmax(0, 1fr); gap: 3rem; max-width: 76rem; margin: 0 auto; padding-block: 2rem 5rem }
nav.toc { position: sticky; top: env(safe-area-inset-top, 0px); align-self: start; max-height: 100vh; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding-block: 1rem; font-size: .9rem }
nav.toc .brand { font: 700 1.1rem var(--display); color: var(--accent); margin: 0 0 1rem }
nav.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .15rem }
nav.toc > ol > li > a { font-weight: 700; display: block; padding: .3rem .5rem; border-radius: 6px; color: var(--text); text-decoration: none }
nav.toc > ol > li > a:hover { background: var(--accent-soft) }
nav.toc ol ol { margin: .1rem 0 .6rem .6rem; border-left: 1px solid var(--line) }
nav.toc ol ol a { display: block; padding: .15rem .6rem; margin-left: -1px; border-left: 2px solid transparent; border-radius: 0 6px 6px 0; color: var(--muted); text-decoration: none; line-height: 1.35; transition: color .2s, background-color .2s, border-color .2s }
nav.toc ol ol a:hover { color: var(--accent) }
nav.toc ol ol a.active { color: var(--accent); background: var(--accent-soft); border-left-color: var(--accent); font-weight: 700 }
nav.toc > ol > li > a { transition: color .2s, background-color .2s }
nav.toc > ol > li > a.current { color: var(--accent) }
details.mobile-toc a.current { color: var(--accent); font-weight: 700 }
section.chapter, article.sec { scroll-margin-top: 1rem }
main { min-width: 0; max-width: 52rem }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap }
.appearance { position: fixed; right: calc(1rem + env(safe-area-inset-right, 0px)); bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); z-index: 10; display: grid; justify-items: end; gap: .6rem }
.appearance-toggle { height: 2.75rem; padding: 0 1.1rem 0 .9rem; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: 700 .95rem var(--body); display: inline-flex; align-items: center; gap: .5rem; cursor: pointer; box-shadow: 0 2px 10px rgb(0 0 0 / .14) }
.appearance-toggle svg { color: var(--accent) }
.appearance-toggle[aria-expanded="true"] { border-color: var(--accent); background: var(--accent-soft) }
.appearance-toggle:hover { background: var(--accent-soft) }
.appearance-toggle:focus-visible, .appearance input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px }
.appearance-panel { width: min(19rem, calc(100vw - 2rem)); background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 1rem; box-shadow: 0 8px 28px rgb(0 0 0 / .18); display: grid; gap: 1rem }
.appearance-panel fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: .45rem }
.appearance-panel legend { font: 700 .78rem var(--body); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: .45rem; padding: 0 }
.appearance-panel label { display: block; cursor: pointer }
.appearance-panel input { position: absolute; opacity: 0; pointer-events: none }
.appearance-panel label > span { display: flex; align-items: center; gap: .6rem; padding: .4rem .55rem; border-radius: 8px; border: 1px solid transparent }
.appearance-panel label:hover > span { background: var(--accent-soft) }
.appearance-panel input:checked + span { border-color: var(--accent); background: var(--accent-soft); font-weight: 700 }
.swatch { width: 1.3rem; height: 1.3rem; border-radius: 50%; flex: none; border: 1px solid var(--line); background: linear-gradient(135deg, var(--sw-light) 50%, var(--sw-dark) 50%) }
.modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .35rem }
.modes label > span { justify-content: center; border-color: var(--line) }
.appearance-panel .hint { margin: 0; font-size: .83rem; color: var(--muted) }
header.cover { padding-block: 1rem 2rem; border-bottom: 1px solid var(--line); margin-bottom: 2rem }
header.cover p.eyebrow { margin: 0; text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; color: var(--accent); font-weight: 700 }
h1, h2, h3 { font-family: var(--display); text-wrap: balance; line-height: 1.15 }
h1 { font-size: clamp(2rem, 5vw, 2.8rem); margin: .3rem 0 .8rem }
header.cover .lede { font-size: 1.1rem; color: var(--muted); max-width: 40rem; margin: 0 }
.legend-key { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; margin-top: 1.2rem; font-size: .9rem; color: var(--muted) }
.legend-key > span { display: inline-flex; align-items: center; gap: .45rem }
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


APP_PALETTES = os.path.join(HERE, '..', '..', 'apps', 'web', 'src', '_palettes.scss')
TOKENS = ('bg', 'surface', 'text', 'muted', 'line', 'line-strong', 'accent', 'accent-soft', 'on-accent')
SEMANTIC = {'tip': 'good', 'tip-soft': 'good-soft', 'warn': 'warn', 'warn-soft': 'warn-soft'}


def scss_map(text):
    return dict(re.findall(r'([a-z-]+):\s*(#[0-9a-fA-F]{3,8})', text))


def read_palettes():
    """The palettes exactly as the app defines them, so the manual never drifts from it."""
    scss = open(APP_PALETTES).read()
    semantic = {mode: scss_map(re.search(rf'\$semantic-{mode}:\s*\((.*?)\);', scss, re.S).group(1))
                for mode in ('light', 'dark')}
    palettes = []
    for pid, label, hint, light, dark in re.findall(
            r"(\w+): \(\s*label: '([^']+)',\s*hint: '([^']+)',\s*light: \(([^)]*)\),\s*dark: \(([^)]*)\),", scss):
        palettes.append({'id': pid, 'label': label, 'hint': hint, 'light': scss_map(light), 'dark': scss_map(dark)})
    default = re.search(r'\$default:\s*(\w+);', scss).group(1)
    return palettes, semantic, default


def tokens(colors, semantic=None):
    out = ' '.join(f'--{t}: {colors[t]};' for t in TOKENS)
    if semantic:
        out += ' ' + ' '.join(f'--{name}: {semantic[key]};' for name, key in SEMANTIC.items())
    return out


def palette_css(palettes, semantic, default):
    """Light by default, dark when the system asks and nobody chose light, or when someone chose dark.

    data-mode is the app's own attribute; data-theme is the Artifact viewer's.
    """
    base = next(p for p in palettes if p['id'] == default)
    not_light = ':not([data-mode="light"]):not([data-theme="light"])'
    rules = [f':root {{ {tokens(base["light"], semantic["light"])} }}']
    rules += [f':root[data-palette="{p["id"]}"] {{ {tokens(p["light"])} }}' for p in palettes]
    dark = [f':root{not_light} {{ {tokens(base["dark"], semantic["dark"])} color-scheme: dark }}']
    dark += [f':root[data-palette="{p["id"]}"]{not_light} {{ {tokens(p["dark"])} }}' for p in palettes]
    rules.append('@media (prefers-color-scheme: dark) { ' + ' '.join(dark) + ' }')
    rules.append(f':root[data-mode="dark"], :root[data-theme="dark"]:not([data-mode="light"]) {{ {tokens(base["dark"], semantic["dark"])} color-scheme: dark }}')
    rules += [f':root[data-palette="{p["id"]}"][data-mode="dark"], :root[data-palette="{p["id"]}"][data-theme="dark"]:not([data-mode="light"]) {{ {tokens(p["dark"])} }}' for p in palettes]
    return '\n'.join(rules)


# Before the first paint: the colors this person chose in the app, so the page never flashes another.
EARLY_SCRIPT = """(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('pickypop.appearance') || '{}') || {};
    const root = document.documentElement;
    if (PALETTES.includes(saved.palette)) root.dataset.palette = saved.palette;
    const mode = saved.mode ?? saved.theme ?? 'light';
    if (mode === 'light' || mode === 'dark') root.dataset.mode = mode;
  } catch {
    document.documentElement.dataset.mode = 'light';
  }
})();"""

PAGE_SCRIPT = """(() => {
  // Colors and mode: the same choice the app keeps (core/appearance.ts), so
  // picking it here also changes the app in this browser, and the other way round.
  const KEY = 'pickypop.appearance';
  const root = document.documentElement;
  const toggle = document.querySelector('.appearance-toggle');
  const panel = document.getElementById('appearance-panel');
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const apply = (palette, mode) => {
    root.dataset.palette = palette;
    if (mode === 'auto') delete root.dataset.mode; else root.dataset.mode = mode;
    panel.querySelectorAll('input').forEach((input) => {
      input.checked = input.value === (input.name === 'palette' ? palette : mode);
    });
  };
  const current = () => ({ palette: root.dataset.palette || DEFAULT_PALETTE, mode: root.dataset.mode || 'auto' });
  apply(current().palette, current().mode);
  const open = (show) => {
    panel.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    if (show) panel.querySelector('input:checked')?.focus();
  };
  toggle.addEventListener('click', () => open(panel.hidden));
  panel.addEventListener('change', (event) => {
    const { palette, mode } = current();
    const next = event.target.name === 'palette' ? { palette: event.target.value, mode } : { palette, mode: event.target.value };
    apply(next.palette, next.mode);
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...next })); } catch {}
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { open(false); toggle.focus(); }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !event.target.closest('.appearance')) open(false);
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    const saved = read();
    const mode = saved.mode ?? 'light';
    apply(PALETTES.includes(saved.palette) ? saved.palette : DEFAULT_PALETTE, ['auto', 'light', 'dark'].includes(mode) ? mode : 'light');
  });

  // The index follows the reading. Someone who scrolls the index to look
  // around is left alone; the next scroll of the content brings it back, smoothly.
  const nav = document.querySelector('nav.toc');
  if (!nav) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const targets = [...nav.querySelectorAll('a[href^="#"]')].map((link) => {
    const id = decodeURIComponent(link.hash.slice(1));
    const chapterLink = link.closest('ol ol') ? link.closest('ol ol').parentElement.querySelector(':scope > a') : link;
    return { id, link, chapterLink, element: document.getElementById(id) };
  }).filter((target) => target.element);
  const mobile = new Map([...document.querySelectorAll('details.mobile-toc a')].map((link) => [link.hash.slice(1), link]));
  let active = null;
  let browsing = false;
  let queued = false;
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    nav.addEventListener(type, () => { browsing = true; }, { passive: true });
  }
  const reading = () => {
    // What sits under a line a third of the way down is what is being read.
    const line = innerHeight * 0.33;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) return targets[targets.length - 1];
    let found = targets[0];
    for (const target of targets) {
      if (target.element.getBoundingClientRect().top <= line) found = target; else break;
    }
    return found;
  };
  const mark = (target) => {
    if (active) { active.link.classList.remove('active'); active.chapterLink.classList.remove('current'); active.link.removeAttribute('aria-current'); }
    active = target;
    target.link.classList.add('active');
    target.chapterLink.classList.add('current');
    target.link.setAttribute('aria-current', 'location');
    mobile.forEach((link, id) => link.classList.toggle('current', id === target.chapterLink.hash.slice(1)));
  };
  // The address carries the section being read, so a copied link opens on that
  // step. It changes only after the reader scrolls: written while the page is
  // still loading, the browser would jump to it and skip the cover.
  let address = location.hash;
  const remember = () => {
    const onCover = targets[0].element.getBoundingClientRect().top > innerHeight * 0.33;
    const next = onCover ? '' : '#' + active.id;
    if (next === address) return;
    address = next;
    try { history.replaceState(null, '', next || location.pathname + location.search); } catch {}
  };
  const follow = (smooth) => {
    // Move the index only when the item is out of its comfortable middle.
    const top = active.link.offsetTop;
    const height = nav.clientHeight;
    const margin = height * 0.2;
    if (top >= nav.scrollTop + margin && top + active.link.offsetHeight <= nav.scrollTop + height - margin) return;
    nav.scrollTo({ top: top - height / 2 + active.link.offsetHeight / 2, behavior: smooth && !reduced.matches ? 'smooth' : 'auto' });
  };
  const update = () => {
    queued = false;
    const target = reading();
    const moved = target !== active;
    if (moved) mark(target);
    if (browsing) { browsing = false; follow(true); } else if (moved) follow(true);
    remember();
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  mark(reading());
  follow(false);
})();"""


def esc(text):
    """Escapes, then turns «quoted UI names» into emphasis so buttons stand out."""
    out = html.escape(text or '')
    return re.sub(r'«([^»]{1,80})»', r'«<strong>\1</strong>»', out)


def slug(text):
    s = re.sub(r'[^a-z0-9]+', '-', text.lower().translate(str.maketrans('áéíóúñü', 'aeiounu'))).strip('-')
    return s[:48] or 'seccion'


def main():
    chapters = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(CHAPTERS, '*.json')))]
    palettes, semantic, default = read_palettes()
    ids = json.dumps([p['id'] for p in palettes])
    constants = f'const PALETTES = {ids}; const DEFAULT_PALETTE = {json.dumps(default)};'
    swatches = ''.join(
        f'<label><input type="radio" name="palette" value="{p["id"]}" id="palette-{p["id"]}">'
        f'<span><span class="swatch" style="--sw-light: {p["light"]["accent"]}; --sw-dark: {p["dark"]["bg"]}"></span>'
        f'{html.escape(p["label"])}</span></label>'
        for p in palettes)
    modes = ''.join(
        f'<label><input type="radio" name="mode" value="{mid}" id="mode-{mid}"><span>{label}</span></label>'
        for mid, label in (('auto', 'Automático'), ('light', 'Claro'), ('dark', 'Oscuro')))
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
<style>{STYLE}
{palette_css(palettes, semantic, default)}</style>
<script>{constants}
{EARLY_SCRIPT}</script>
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
<div class="appearance">
<div class="appearance-panel" id="appearance-panel" role="dialog" aria-label="Colores y modo" hidden>
<fieldset><legend>Colores</legend>{swatches}</fieldset>
<fieldset><legend>Claro u oscuro</legend><div class="modes">{modes}</div></fieldset>
<p class="hint">Es la misma elección que en Pickypop: cambiarla aquí también la cambia en la app, en este navegador.</p>
</div>
<button type="button" class="appearance-toggle" aria-expanded="false" aria-controls="appearance-panel" title="Colores y modo">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>
<span>Colores</span>
</button>
</div>
<script>{PAGE_SCRIPT}</script>
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
