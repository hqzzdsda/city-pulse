# -*- coding: utf-8 -*-
"""
build_bundle.py — Merge src/ modules into a single dist/index.html
"""
import os, re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(SCRIPT_DIR, 'src')
DIST_DIR = os.path.join(SCRIPT_DIR, 'docs')

JS_FILES = ['constants.js', 'config.js', 'data.js', 'scoring.js', 'radar.js', 'render.js', 'app.js']

def read(name):
    with open(os.path.join(SRC_DIR, name), 'r', encoding='utf-8') as f:
        return f.read()

def build():
    html = read('app.html')
    css = read('style.css')

    # Collect JS
    js_parts = []
    for fname in JS_FILES:
        content = read(fname)
        js_parts.append(f'// ===== {fname} =====\n{content}')
    js_bundle = '\n\n'.join(js_parts)

    # Inline CSS
    html = re.sub(r'<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>', html)

    # Inline data file
    data_js = read(os.path.join('..', 'city-pulse-data.js'))

    # Replace script tags with inline bundle
    html = re.sub(r'<script src="[^"]*"></script>\s*', '', html)
    html = html.replace('</body>', f'<script>\n{data_js}\n</script>\n<script>\n{js_bundle}\n</script>\n</body>')

    # Update title
    html = html.replace('城市脉搏 City Pulse', '城市脉搏 City Pulse (bundled)')

    os.makedirs(DIST_DIR, exist_ok=True)

    # Write bundled app
    app_path = os.path.join(DIST_DIR, 'app.html')
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(html)
    size_kb = os.path.getsize(app_path) / 1024
    print(f'[DONE] {app_path} ({size_kb:.1f}KB)')

    # Copy landing page as index.html (GitHub Pages entry)
    landing = read('index.html')
    index_path = os.path.join(DIST_DIR, 'index.html')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(landing)
    print(f'[DONE] {index_path} (landing)')

if __name__ == '__main__':
    build()
