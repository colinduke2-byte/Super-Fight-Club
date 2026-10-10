// Inlines the production build (dist/) into one self-contained HTML page: dist/super-fight-club.html
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const js = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
const code = readFileSync(`dist/assets/${js}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<title>Super Fight Club</title>
<style>
:root{--bg:#07060f;--fg:#e8e4ff;--dim:#8f8ab8;--accent:#ffd46a;color-scheme:dark}
html,body{height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--fg);overscroll-behavior:none}
body{font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
#game{position:fixed;inset:0}
canvas{image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none;outline:none;display:block}
#hint{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:5;padding:8px 14px;background:#07060fd9;border:1px solid var(--dim);color:var(--accent);text-align:center;max-width:calc(100% - 32px);pointer-events:none;transition:opacity .4s}
#hint.gone{opacity:0}
</style>
<div id="game"></div>
<div id="hint">Click the game once so it receives the keyboard. Move WASD, Attack J, Special K, Shield L, Jump I. Esc pauses.</div>
<script>addEventListener('pointerdown',function(){document.getElementById('hint').classList.add('gone')},{once:true});setTimeout(function(){document.getElementById('hint').classList.add('gone')},15000)</script>
<script type="module">${code}</script>
`;
writeFileSync('dist/super-fight-club.html', html);
console.log('wrote dist/super-fight-club.html', (html.length / 1e6).toFixed(2), 'MB');
