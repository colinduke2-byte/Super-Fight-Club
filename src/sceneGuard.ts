import Phaser from 'phaser';

/**
 * `this.scene.start(other)` from a scene queues "stop me" and "start other" for the next frame. Two of those from scenes
 * that are leaving anyway (a menu's fade-out finishing in the same frame as a direct start, a late async callback of a scene
 * that was already left) used to leave two full scenes running side by side (e.g. Title and Match, ModeSelect and Results):
 * both read input, play music and draw. This keeps the first start a scene asks for and ignores later ones until that scene
 * starts again, and ignores starts from a scene that is no longer running (a stale callback).
 */
export function guardSceneStarts(): void {
  const proto = Phaser.Scenes.ScenePlugin.prototype as unknown as {
    start: (this: Phaser.Scenes.ScenePlugin, key?: string, data?: object) => Phaser.Scenes.ScenePlugin;
    __guarded?: boolean;
  };
  if (proto.__guarded) return;
  proto.__guarded = true;
  const start = proto.start;
  const leaving = new WeakMap<Phaser.Scenes.Systems, string>();
  proto.start = function (key, data) {
    const sys = this.systems;
    const own = this.key;
    const target = key ?? own;
    if (sys && target !== own) {
      const st = sys.settings.status;
      const live = st === Phaser.Scenes.RUNNING || st === Phaser.Scenes.PAUSED || st === Phaser.Scenes.SLEEPING || st === Phaser.Scenes.CREATING || st === Phaser.Scenes.START || st === Phaser.Scenes.LOADING;
      const queued = leaving.get(sys);
      if (!live || queued !== undefined) {
        console.warn(`[scenes] ignored ${own} -> ${target}: ${!live ? `${own} is not running` : `already leaving for ${queued}`}`);
        return this;
      }
      leaving.set(sys, target);
      // a new run of this scene may leave again
      sys.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaving.delete(sys));
    }
    return start.call(this, key, data);
  };
}

/**
 * Phaser's `resume` also "resumes" a scene that was stopped (it only checks `settings.active`): the stopped scene, whose
 * objects are all destroyed, starts updating again and throws every frame. That happened when an overlay (Controls opened
 * from Settings over a paused match) went back to a Settings that had closed itself in the same frame. Only a paused scene
 * is resumed now.
 */
export function guardSceneResume(): void {
  const proto = Phaser.Scenes.Systems.prototype as unknown as { resume: (this: Phaser.Scenes.Systems, data?: object) => Phaser.Scenes.Systems; __resumeGuarded?: boolean };
  if (proto.__resumeGuarded) return;
  proto.__resumeGuarded = true;
  const resume = proto.resume;
  proto.resume = function (data) {
    if (this.settings.status !== Phaser.Scenes.PAUSED) {
      if (!this.settings.active) console.warn(`[scenes] ignored resume of ${this.settings.key}: it is not paused (status ${this.settings.status})`);
      return this;
    }
    return resume.call(this, data);
  };
}
