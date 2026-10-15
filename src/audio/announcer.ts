import { settings } from '../settings';
import { music } from './music';
import { unit } from './sfx';

/**
 * Announcer calls ("3, 2, 1, GO!", "GAME!", the winner's name) through the browser's built-in speech synthesis, so
 * there are no voice assets. Deep and a little fast; each call cuts the previous one off so it never lags behind
 * the action. Silent where speech synthesis is missing, when the setting is off or the volume is zero.
 */
/**
 * How much a call matters: a call never cuts off one of higher priority that is still being spoken (a "Parry!" does not
 * talk over "GAME!"), and equal or higher priority replaces what is playing.
 */
export const PRIORITY = { flavour: 0, call: 1, big: 2, result: 3 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export interface SayOpts {
  pitch?: number;
  rate?: number;
  /** Default PRIORITY.call. */
  priority?: Priority;
}

/** "The Wall" -> "Wall": a fighter's display name trimmed the way the results screen calls it. */
export function callName(name: string): string {
  return name.trim().replace(/^the\s+/i, '');
}

/** Multi-KO calls: one KO in a moment is "K.O.!", two "Double K.O.!", then triple and beyond. */
export function koLine(count: number): string {
  const n = Math.max(1, Math.floor(count) || 1);
  return n === 1 ? 'K.O.!' : n === 2 ? 'Double K.O.!' : n === 3 ? 'Triple K.O.!' : 'Unstoppable!';
}

/** Single-KO variants rotated so a long match does not repeat itself every time. */
export const KO_VARIANTS = ['K.O.!', 'Knockout!', 'Smashed!', 'Gone!', 'Sent flying!'] as const;
/** Ultimate callouts, rotated. */
export const ULTIMATE_LINES = ['Ultimate!', 'Unleashed!', 'Here it comes!', 'Full power!'] as const;

class Announcer {
  private voice: SpeechSynthesisVoice | null = null;
  private picked = false;
  private seq = 0;
  /** Priority of the call being spoken and when it should be finished (ms, performance clock). */
  private busyPrio = -1;
  private busyUntil = 0;
  private koTurn = 0;
  private ultTurn = 0;
  /** Last time each throttled call was made (ms), so spammy events (parries) do not chatter. */
  private readonly lastCall = new Map<string, number>();

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

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /** Speak a line. Returns whether it was spoken (false when muted, unavailable, or a bigger call is still going). */
  say(text: string, opts: SayOpts = {}): boolean {
    const s = this.synth();
    if (!s || !settings.announcer) return false;
    const vol = unit(settings.masterVolume) * unit(settings.sfxVolume);
    if (vol <= 0) return false;
    const prio = opts.priority ?? PRIORITY.call;
    const now = this.now();
    if (now < this.busyUntil && prio < this.busyPrio) return false;
    this.busyPrio = prio;
    this.busyUntil = now + 500 + text.length * 70;
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
      return true;
    } catch {
      /* speech unavailable: stay quiet */
      return false;
    }
  }

  /** A call that may only be made once every `gapMs` (spammy events). */
  private throttled(key: string, gapMs: number, text: string, opts: SayOpts): boolean {
    const now = this.now();
    if (now - (this.lastCall.get(key) ?? -1e9) < gapMs) return false;
    const ok = this.say(text, opts);
    if (ok) this.lastCall.set(key, now);
    return ok;
  }

  // ---- the call sheet -----------------------------------------------------------------------------------

  /** "Ready?" before the countdown. */
  ready(): boolean {
    return this.say('Ready?', { pitch: 0.65, rate: 1.0, priority: PRIORITY.big });
  }

  /** A fighter's name, called as a player locks them in on character select. */
  fighterName(name: string): boolean {
    return this.say(`${callName(name)}!`, { pitch: 0.6, rate: 1.05, priority: PRIORITY.call });
  }

  /** The results screen: "<NAME> wins!" */
  winner(name: string): boolean {
    return this.say(`${callName(name)} wins!`, { pitch: 0.55, rate: 0.98, priority: PRIORITY.result });
  }

  /**
   * A KO. `count` is how many fighters went down together (within a second or so): 2+ calls a multi-KO; a single KO
   * rotates through a few variants.
   */
  ko(count = 1): boolean {
    const line = count > 1 ? koLine(count) : KO_VARIANTS[this.koTurn++ % KO_VARIANTS.length];
    return this.say(line, { pitch: 0.6, rate: 1.12, priority: count > 1 ? PRIORITY.big : PRIORITY.call });
  }

  /** A fighter is down to their last stock. */
  lastStock(): boolean {
    return this.throttled('lastStock', 1500, 'Last stock!', { pitch: 0.6, rate: 1.05, priority: PRIORITY.call });
  }

  /** An ultimate begins; with a name, "<NAME>'s ultimate!" alternates with the stock callouts. */
  ultimate(name?: string): boolean {
    const turn = this.ultTurn++;
    const line = name && turn % 2 === 0 ? `${callName(name)}'s ultimate!` : ULTIMATE_LINES[turn % ULTIMATE_LINES.length];
    return this.say(line, { pitch: 0.6, rate: 1.1, priority: PRIORITY.big });
  }

  /** The winner took no damage (or lost no stock): "Perfect!" */
  perfect(): boolean {
    return this.say('Perfect!', { pitch: 0.6, rate: 0.95, priority: PRIORITY.result });
  }

  /** Before the Overseer fight. */
  bossWarning(): boolean {
    return this.say('Warning. The Overseer approaches.', { pitch: 0.45, rate: 0.9, priority: PRIORITY.big });
  }

  /** The boss enters its second phase. */
  phaseTwo(): boolean {
    return this.say('Phase two!', { pitch: 0.5, rate: 1.0, priority: PRIORITY.big });
  }

  /** A perfect parry (throttled: at most one call every 4 s, and never over a bigger call). */
  parry(): boolean {
    return this.throttled('parry', 4000, 'Parry!', { pitch: 0.65, rate: 1.2, priority: PRIORITY.flavour });
  }

  stop(): void {
    this.seq++;
    this.busyPrio = -1;
    this.busyUntil = 0;
    music.setSpeechDuck(false);
    try {
      this.synth()?.cancel();
    } catch {
      /* ignore */
    }
  }
}

export const announcer = new Announcer();
