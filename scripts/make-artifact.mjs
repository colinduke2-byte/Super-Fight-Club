// Inlines the production build (dist/) into one self-contained HTML page: dist/super-fight-club.html
// Usage: node scripts/make-artifact.mjs [buildDir]   (default: dist)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const dir = process.argv[2] || 'dist';
// the page inlines exactly one script: a second chunk (a dynamic import, a split vendor chunk) would be silently missing
const chunks = readdirSync(`${dir}/assets`).filter((f) => f.endsWith('.js'));
if (chunks.length !== 1) {
  console.error(`make-artifact: expected exactly one JS chunk in ${dir}/assets, found ${chunks.length}: ${chunks.join(', ') || '(none)'}`);
  process.exit(1);
}
const code = readFileSync(`${dir}/assets/${chunks[0]}`, 'utf8').replace(/<\/script/gi, '<\\/script');
// the home-screen / fullscreen meta (theme colour, web-app-capable, icon, manifest as data URLs) comes from index.html
const pwa = (/<!-- pwa[\s\S]*?<!-- \/pwa -->/.exec(readFileSync('index.html', 'utf8')) ?? [''])[0].replace(/\n\s+/g, '\n');
if (!pwa) console.warn('make-artifact: no <!-- pwa --> block in index.html: the page ships without its manifest');
const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Super Fight Club</title>
${pwa}
<style>
:root{--bg:#07060f;--fg:#e8e4ff;--dim:#8f8ab8;--accent:#ffd46a;color-scheme:dark}
html,body{height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--fg);overscroll-behavior:none}
body{font:13px/1.4 ui-monospace,Menlo,Consolas,monospace}
#game{position:fixed;inset:0}
canvas{image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none;outline:none;display:block}
#hint{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:5;padding:7px 12px;background:#07060fd9;border:1px solid var(--dim);color:var(--accent);text-align:center;max-width:calc(100% - 32px);box-sizing:border-box;pointer-events:none;transition:opacity .4s}
#hint.top{top:calc(10px + env(safe-area-inset-top,0px));bottom:auto}
#hint.gone{opacity:0}
</style>
<div id="game"></div>
<div id="hint"></div>
<script>(function(){var h=document.getElementById('hint');var touch=matchMedia('(pointer: coarse)').matches;
h.textContent=touch?(innerHeight>innerWidth?'Tap to start. Turn sideways to fight.':'Tap to start.'):'Click the game, then: WASD move, J attack, K special, I jump. Esc pauses.';
if(touch)h.className='top';var bye=function(){h.classList.add('gone')};addEventListener('pointerdown',bye,{once:true});addEventListener('keydown',bye,{once:true});setTimeout(bye,touch?4000:8000)})()</script>
<script type="module">${code}</script>
`;
writeFileSync(`${dir}/super-fight-club.html`, html);
console.log(`wrote ${dir}/super-fight-club.html`, (html.length / 1e6).toFixed(2), 'MB');
