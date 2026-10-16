/**
 * Wraps `obj[method]` so an exception is caught and handed to `onError` instead of propagating (see errorOverlay.ts: one
 * exception in a scene's update used to stop Phaser's game loop for good). The same error from the same source is passed
 * on at most once per `throttleMs` (a broken update throws every frame). Pure: no Phaser or DOM, so it is unit tested.
 */
export function catchErrors<T extends object, K extends keyof T>(
  obj: T,
  method: K,
  onError: (err: unknown, self: unknown) => void,
  opts: { throttleMs?: number; keyOf?: (self: unknown) => string; now?: () => number } = {},
): void {
  const orig = obj[method] as unknown as (...a: unknown[]) => unknown;
  if (typeof orig !== 'function') throw new Error(`catchErrors: ${String(method)} is not a method`);
  const throttle = opts.throttleMs ?? 1000;
  const now = opts.now ?? (() => Date.now());
  const last = new Map<string, number>();
  (obj as Record<K, unknown>)[method] = function (this: unknown, ...args: unknown[]): unknown {
    try {
      return orig.apply(this, args);
    } catch (err) {
      const key = `${opts.keyOf?.(this) ?? ''}|${err instanceof Error ? `${err.name}:${err.message}` : String(err)}`;
      const t = now();
      if (t - (last.get(key) ?? -Infinity) >= throttle) {
        last.set(key, t);
        if (last.size > 200) last.clear();
        onError(err, this);
      }
      return undefined;
    }
  };
}
