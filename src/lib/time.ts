/** Request-time clock for server components (one read per request keeps a render consistent). */
export const DAY_MS = 86_400_000;

export function requestClock() {
  const now = Date.now();
  return {
    now,
    iso: new Date(now).toISOString(),
    daysAgo: (n: number) => new Date(now - n * DAY_MS).toISOString(),
    dayKeys: (n: number) => Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10)),
  };
}
