import type Phaser from 'phaser';

/** Fighter skins (texture `fighter:<skin>`) used by any game object in any scene that has not been destroyed. */
export function skinsInUse(game: Pick<Phaser.Game, 'scene'>): Set<string> {
  const out = new Set<string>();
  const visit = (o: unknown, depth: number): void => {
    if (!o || depth > 8) return;
    const go = o as { texture?: { key?: string }; list?: unknown[]; anims?: { currentAnim?: { frames?: { textureKey?: string }[] } | null } };
    const key = go.texture?.key;
    if (key && key.startsWith('fighter:')) out.add(key.slice('fighter:'.length));
    const ak = go.anims?.currentAnim?.frames?.[0]?.textureKey;
    if (ak && ak.startsWith('fighter:')) out.add(ak.slice('fighter:'.length));
    // layers and containers
    if (Array.isArray(go.list)) for (const c of go.list) visit(c, depth + 1);
  };
  for (const s of game.scene.scenes) {
    const list = s.sys.displayList?.list;
    if (list) for (const o of list) visit(o, 0);
  }
  return out;
}
