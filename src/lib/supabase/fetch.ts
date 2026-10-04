/**
 * fetch with a time limit for Supabase clients: a stalled connection becomes an error (the page shows
 * «Попробовать ещё раз») instead of a request that hangs for a minute or more.
 */
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const limit = AbortSignal.timeout(ms);
    return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, limit]) : limit });
  };
}
