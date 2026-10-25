import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The menu scenes import Phaser (no DOM under vitest), so these checks read their sources: the menu tree, the icon art and
// the short paths into a fight must not lose anything.
const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/** Every entry the old five-tab main menu had (label and where it led), each still reachable from the new one. */
const OLD_ENTRIES: [string, RegExp][] = [
  ['VERSUS', /prepareVersus\(\); s\.goTo\('CharacterSelect'\)/],
  ['QUICK MATCH', /s\.quick\(e\)/],
  ['TARGET TURNS', /startTurns\('targets'\)/],
  ['LAUNCH TURNS', /startTurns\('launch'\)/],
  ['TUTORIAL', /startTutorial\(s, 'ModeSelect'/],
  ['HOW TO PLAY', /goTo\('HowToPlay'\)/],
  ['ARCADE', /startRun\(\{ kind: 'arcade' \}\)/],
  ['CO-OP ARCADE', /startRun\(\{ kind: 'arcade', coop: true \}\)/],
  ['BOSS BATTLE', /startRun\(\{ kind: 'boss', coop: true \}\)/],
  ['ENDLESS', /startRun\(\{ kind: 'endless' \}\)/],
  ['GAUNTLET', /startRun\(\{ kind: 'gauntlet' \}\)/],
  ['CHALLENGES', /goTo\('Challenges'\)/],
  ['DAILY CHALLENGE', /goTo\(startDaily\(\)\)/],
  ['TARGET SMASH', /setTargetCourse\('own'\)/],
  ['TARGET COURSES', /setTargetCourse\(nextShared\(\)\)/],
  ['LAUNCH CONTEST', /s\.start\('launch'\)/],
  ['TRAINING', /s\.start\('training'\)/],
  ['PROFILES', /goTo\('Profiles'\)/],
  ['RECORDS', /goTo\('Records'\)/],
  ['REPLAYS', /goTo\('ReplayVault'\)/],
  ['SOUND TEST', /goTo\('SoundTest'/],
  ['CREDITS', /goTo\('Credits'\)/],
  ['SETTINGS', /goTo\('Settings'/],
  ['CONTROLS', /goTo\('Controls'/],
];

describe('main menu (MORE)', () => {
  const menu = src('scenes/ModeSelectScene.ts');
  const groups = menu.slice(menu.indexOf('const GROUPS'), menu.indexOf('/** TARGET COURSES:'));

  it('has three categories: BATTLE, SOLO, EXTRAS', () => {
    expect([...groups.matchAll(/^ {4}label: '([A-Z]+)',$/gm)].map((m) => m[1])).toEqual(['BATTLE', 'SOLO', 'EXTRAS']);
  });

  it('keeps every entry the old menu had, each with an icon', () => {
    for (const [label, target] of OLD_ENTRIES) {
      const line = groups.split('\n').findIndex((l) => l.includes(`label: '${label}'`));
      expect(line, label).toBeGreaterThanOrEqual(0);
      const entry = groups.split('\n').slice(line, line + 8).join('\n');
      expect(entry, label).toMatch(target);
      expect(entry, label).toMatch(/icon: '\w+'/);
    }
  });

  it('adds TEAM BATTLE and goes back to Home', () => {
    expect(groups).toContain("label: 'TEAM BATTLE'");
    expect(menu).toContain("this.go('Home')");
    expect(menu).toMatch(/gearChip = true/);
  });
});

describe('Home', () => {
  it('is registered and is where the title leads', () => {
    expect(src('main.ts')).toMatch(/scene: \[BootScene, TitleScene, HomeScene,/);
    expect(src('scenes/TitleScene.ts')).toContain("this.go('Home')");
  });

  it('PLAY starts the last setup, falling back to versus character select; BATTLE and MORE lead on', () => {
    const home = src('scenes/HomeScene.ts');
    expect(home).toMatch(/startLastSetup\(this,/);
    expect(home).toMatch(/prepareVersus\(\);\s*this\.go\('CharacterSelect'\)/);
    expect(home).toContain("this.go('ModeSelect')");
    expect(home).toContain('markTutorialOffered()');
  });

  it('the tutorial offer is a banner on Home, not a dialog on the menu', () => {
    expect(src('scenes/ModeSelectScene.ts')).not.toContain('shouldOfferTutorial');
    expect(src('scenes/HomeScene.ts')).toContain('shouldOfferTutorial()');
  });
});

describe('menu kit icons', () => {
  const kit = src('ui/menuKit.ts');
  const art = kit.slice(kit.indexOf('const ICON_ART'), kit.indexOf('} as const;', kit.indexOf('const ICON_ART')));
  const icons = new Map([...art.matchAll(/^ {2}(\w+): \[([^\]]+)\],$/gm)].map((m) => [m[1], [...m[2].matchAll(/'([^']*)'/g)].map((r) => r[1])]));

  it('are 8x8 one-colour pixel art', () => {
    expect(icons.size).toBeGreaterThan(20);
    for (const [name, rows] of icons) {
      expect(rows.length, name).toBe(8);
      for (const r of rows) expect(r, name).toMatch(/^[.#]{8}$/);
    }
  });

  it('cover every icon the menus ask for', () => {
    const used = new Set<string>();
    for (const f of ['scenes/ModeSelectScene.ts', 'scenes/HomeScene.ts']) for (const m of src(f).matchAll(/icon: '(\w+)'/g)) used.add(m[1]);
    for (const n of used) expect(icons.has(n), n).toBe(true);
  });
});

describe('the short way into a fight', () => {
  it('the VS splash is short and any press skips it', () => {
    const splash = src('scenes/VersusSplashScene.ts');
    const hold = Number(/SPLASH_HOLD = ([\d.]+)/.exec(splash)?.[1]);
    expect(hold).toBeGreaterThan(0);
    expect(hold).toBeLessThanOrEqual(1.5);
    expect(splash).toMatch(/protected onEvent\(_e: MenuEvent\): void \{\s*this\.finish\(\);/);
  });

  it('results put REMATCH first, then CHANGE FIGHTER and CHANGE STAGE', () => {
    const res = src('scenes/ResultsScene.ts');
    const i = res.indexOf("label: 'REMATCH'");
    expect(i).toBeGreaterThan(0);
    const after = res.slice(i, i + 1200);
    expect(after.indexOf("label: 'CHANGE FIGHTER'")).toBeGreaterThan(0);
    expect(after.indexOf("label: 'CHANGE STAGE'")).toBeGreaterThan(after.indexOf("label: 'CHANGE FIGHTER'"));
  });

  it('pause: RESUME, RESTART, MOVE LIST, SETTINGS, QUIT (training keeps its menu)', () => {
    const pause = src('scenes/match/pauseMenu.ts');
    const block = pause.slice(pause.indexOf('const items: MenuItem[] = ['), pause.indexOf('this.menu = new MenuList'));
    const order = ['RESUME', 'RESTART', 'TRAINING MENU', 'MOVE LIST', 'SETTINGS', 'QUIT'].map((l) => block.indexOf(`label: '${l}'`));
    for (const o of order) expect(o).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
