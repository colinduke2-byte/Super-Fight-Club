import { settings } from '../settings';
import { music } from './music';
import { sfx, unit } from './sfx';
import type { SoundName } from './soundMap';

/**
 * Announcer calls ("3, 2, 1, GO!", "GAME!", the winner's name) through the browser's built-in speech synthesis, so
 * there are no voice assets. One voice is chosen the same way on every system (a deep English voice where there is one,
 * never a novelty voice) and each call cuts the previous one off so it never lags behind the action.
 *
 * Where the browser has no voice at all (speech synthesis missing, or no voices installed: common on Linux Chromium) or
 * speaking fails, the key calls still land: READY, GO, GAME, TIME and the KOs are sung by the game's own formant synth
 * (see `fallbackFor`). Silent when the setting is off or the volume is zero.
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
  /** Wait for the call being spoken to finish instead of cutting it off. */
  queue?: boolean;
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

/** The formant-synth word that stands in for a line when there is no speech voice (null: the line is skipped). */
export function fallbackFor(text: string): SoundName | null {
  const t = text.toLowerCase();
  if (/^ready/.test(t)) return 'callReady';
  if (/^go\b/.test(t)) return 'callGo';
  if (/^(game|sudden death|ladder cleared)/.test(t)) return 'callGame';
  if (/^time/.test(t)) return 'callTime';
  if (/k\.?o\.?!|knockout|smashed|gone!|sent flying|unstoppable/.test(t)) return 'callKo';
  return null;
}

/** Voice names that are jokes or effects on some systems (macOS ships many): never the announcer. */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|hysterical|deranged|pipe organ|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
/** Names of the deeper, male-sounding English voices the common systems ship (best first). */
const DEEP = ['google uk english male', 'microsoft guy', 'microsoft ryan', 'microsoft christopher', 'microsoft eric', 'daniel', 'microsoft david', 'microsoft mark', 'alex', 'fred', 'arthur', 'aaron', 'oliver', 'gordon', 'tom', 'lee', 'rishi', 'english (great britain)+male', 'male'];
const FEMALE = /female|zira|susan|hazel|samantha|victoria|karen|moira|tessa|fiona|serena|kate|allison|ava|susan|catherine|aria|jenny|libby|sonia|natasha|veena|martha|nicky|google us english/i;

/** Score a speech voice for the announcer (higher is better; < 0 never). Exported for tests. */
export function voiceScore(v: { name: string; lang: string; localService?: boolean }): number {
  const name = v.name.toLowerCase();
  if (NOVELTY.test(name)) return -1;
  const lang = v.lang.toLowerCase().replace('_', '-');
  let s = lang.startsWith('en') ? 100 : 0;
  if (lang === 'en-gb' || lang === 'en-us') s += 10;
  const deep = DEEP.findIndex((d) => name.includes(d));
  if (deep >= 0) s += 60 - deep;
  if (FEMALE.test(name)) s -= 40;
  if (v.localService) s += 5; // no network round trip: the call lands on time
  if (/natural|neural|online/.test(name)) s += 8;
  return s;
}

/**
 * Speech settings per voice: an already-deep voice keeps its own pitch (pushed lower it turns to gravel), a neutral one is
 * lowered; remote voices ignore pitch, so they get the rate only.
 */
export function voiceTuning(v: { name: string } | null): { pitch: number; rate: number; volume: number } {
  const name = v?.name.toLowerCase() ?? '';
  const deep = DEEP.some((d) => name.includes(d)) && !FEMALE.test(name);
  return { pitch: deep ? 0.85 : 0.6, rate: /google|online|natural/.test(name) ? 1.0 : 1.06, volume: 1 };
}

/** Single-KO variants rotated so a long match does not repeat itself every time. */
export const KO_VARIANTS = ['K.O.!', 'Knockout!', 'Smashed!', 'Gone!', 'Sent flying!'] as const;
/** Ultimate callouts, rotated. */
export const ULTIMATE_LINES = ['Ultimate!', 'Unleashed!', 'Here it comes!', 'Full power!'] as const;

class Announcer {
  private voice: SpeechSynthesisVoice | null = null;
  private picked = false;
  private seq = 0;
  /** No usable speech voice: calls go to the formant fallback. */
  private mute = false;
  /** When the voices were first asked for (they load asynchronously; after a moment an empty list means none). */
  private askedAt = -1;
  private listening = false;
  /** A call waiting for the current one to finish (`queue` option). */
  private queued: number | null = null;
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

  /** The best voice by `voiceScore` (ties by name, so every system picks the same way every time). */
  private pickVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
    if (!this.listening) {
      this.listening = true;
      try {
        // a list that arrives (or changes) later is picked from again
        s.addEventListener?.('voiceschanged', () => {
          this.picked = false;
          this.mute = false;
        });
      } catch {
        /* ignore */
      }
    }
    let all: SpeechSynthesisVoice[] = [];
    try {
      all = s.getVoices();
    } catch {
      all = [];
    }
    if (!all.length) {
      // voices load asynchronously: ask again on the next call, and after a couple of seconds take silence as none
      if (this.askedAt < 0) this.askedAt = this.now();
      else if (this.now() - this.askedAt > 2000) this.mute = true;
      return null;
    }
    this.picked = true;
    this.mute = false;
    const ranked = all.map((v) => ({ v, s: voiceScore(v) })).filter((x) => x.s >= 0);
    ranked.sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name));
    return ranked[0]?.v ?? null;
  }

  /** Prime the voice list early (the first call of a match should not be the one that waits for it). */
  warm(): void {
    const s = this.synth();
    if (s && !this.picked) this.voice = this.pickVoice(s);
  }

  /** Which voice the calls use, for the sound test. */
  get voiceLabel(): string {
    if (!this.synth() || this.mute) return 'No speech voice: synth fallback';
    return this.voice ? `Voice: ${this.voice.name}` : 'No speech voice found yet: synth fallback';
  }

  /** The formant-synth stand-in for a line, where there is no speech voice. */
  private fallback(text: string): boolean {
    const name = fallbackFor(text);
    if (!name) return false;
    sfx.play(name, 1, 0);
    return true;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /**
   * Speak a line. Returns whether it was spoken (false when muted, unavailable, or a bigger call is still going). With
   * `queue`, a line that would cut off the call being spoken waits for it to finish instead (one waiting line at most).
   */
  say(text: string, opts: SayOpts = {}): boolean {
    if (!settings.announcer) return false;
    const vol = unit(settings.masterVolume) * unit(settings.sfxVolume);
    if (vol <= 0) return false;
    const prio = opts.priority ?? PRIORITY.call;
    const now = this.now();
    if (now < this.busyUntil && prio < this.busyPrio) return false;
    if (opts.queue && now < this.busyUntil && typeof window !== 'undefined') {
      if (this.queued !== null) window.clearTimeout(this.queued);
      this.queued = window.setTimeout(() => {
        this.queued = null;
        this.say(text, { ...opts, queue: false });
      }, this.busyUntil - now + 60);
      return true;
    }
    const s = this.synth();
    if (s && !this.picked) this.voice = this.pickVoice(s);
    if (!s || this.mute) {
      // no speech voice: the key calls in the game's own synth voice
      if (!this.fallback(text)) return false;
      this.busyPrio = prio;
      this.busyUntil = now + 700;
      return true;
    }
    this.busyPrio = prio;
    this.busyUntil = now + 500 + text.length * 70;
    try {
      s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      const tune = voiceTuning(this.voice);
      // the call sheet's pitch is written for a neutral voice: scale it to the chosen voice's own
      u.pitch = Math.max(0.1, Math.min(2, (opts.pitch ?? 0.6) * (tune.pitch / 0.6)));
      u.rate = (opts.rate ?? 1.08) * (tune.rate / 1.06);
      u.volume = Math.min(1, vol * 1.25 * tune.volume);
      // dip the music under the call; onend is unreliable in some browsers, so a timer restores it too
      const id = ++this.seq;
      const done = (): void => {
        if (id === this.seq) music.setSpeechDuck(false);
      };
      let started = false;
      u.onstart = () => {
        started = true;
        music.setSpeechDuck(true);
      };
      u.onend = done;
      u.onerror = (ev: SpeechSynthesisErrorEvent) => {
        done();
        // the engine cannot speak at all (no voices installed, no speech service): fall back for good, and still make this
        // call if it failed straight away
        if (!started && (ev?.error === 'synthesis-failed' || ev?.error === 'synthesis-unavailable' || ev?.error === 'voice-unavailable' || ev?.error === 'audio-hardware')) {
          this.mute = true;
          if (this.now() - now < 400) this.fallback(text);
        }
      };
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

  /** A fighter is down to their last stock (after the KO call, not over it). */
  lastStock(): boolean {
    return this.throttled('lastStock', 1500, 'Last stock!', { pitch: 0.6, rate: 1.05, priority: PRIORITY.call, queue: true });
  }

  /** An ultimate begins; with a name, "<NAME>'s ultimate!" alternates with the stock callouts. */
  ultimate(name?: string): boolean {
    const turn = this.ultTurn++;
    const line = name && turn % 2 === 0 ? `${callName(name)}'s ultimate!` : ULTIMATE_LINES[turn % ULTIMATE_LINES.length];
    return this.say(line, { pitch: 0.6, rate: 1.1, priority: PRIORITY.big });
  }

  /** The winner took no damage (or lost no stock): "Perfect!" (queued behind GAME!). */
  perfect(): boolean {
    return this.say('Perfect!', { pitch: 0.6, rate: 0.95, priority: PRIORITY.result, queue: true });
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
    if (this.queued !== null && typeof window !== 'undefined') window.clearTimeout(this.queued);
    this.queued = null;
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
