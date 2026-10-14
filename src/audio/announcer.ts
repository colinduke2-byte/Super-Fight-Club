import { settings } from '../settings';
import { music } from './music';
import { unit } from './sfx';

/**
 * Announcer calls ("3, 2, 1, GO!", "GAME!", the winner's name) through the browser's built-in speech synthesis, so
 * there are no voice assets. Deep and a little fast; each call cuts the previous one off so it never lags behind
 * the action. Silent where speech synthesis is missing, when the setting is off or the volume is zero.
 */
class Announcer {
  private voice: SpeechSynthesisVoice | null = null;
  private picked = false;
  private seq = 0;

  private synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  /** An English voice, preferring the deeper ones most systems ship. */
  private pickVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
    const all = s.getVoices();
    if (!all.length) return null; // voices load asynchronously; try again on the next call
    this.picked = true;
    const en = all.filter((v) => /^en[-_]/i.test(v.lang));
    const deep = /male|daniel|david|alex|fred|george|guy|ryan|mark|james/i;
    return en.find((v) => deep.test(v.name) && !/female/i.test(v.name)) ?? en[0] ?? all[0];
  }

  say(text: string, opts: { pitch?: number; rate?: number } = {}): void {
    const s = this.synth();
    if (!s || !settings.announcer) return;
    const vol = unit(settings.masterVolume) * unit(settings.sfxVolume);
    if (vol <= 0) return;
    if (!this.picked) this.voice = this.pickVoice(s);
    try {
      s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.pitch = opts.pitch ?? 0.6;
      u.rate = opts.rate ?? 1.08;
      u.volume = Math.min(1, vol * 1.25);
      // dip the music under the call; onend is unreliable in some browsers, so a timer restores it too
      const id = ++this.seq;
      const done = (): void => {
        if (id === this.seq) music.setSpeechDuck(false);
      };
      u.onstart = () => music.setSpeechDuck(true);
      u.onend = done;
      u.onerror = done;
      window.setTimeout(done, 600 + text.length * 90);
      s.speak(u);
    } catch {
      /* speech unavailable: stay quiet */
    }
  }

  stop(): void {
    this.seq++;
    music.setSpeechDuck(false);
    try {
      this.synth()?.cancel();
    } catch {
      /* ignore */
    }
  }
}

export const announcer = new Announcer();
