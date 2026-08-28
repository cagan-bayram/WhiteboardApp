// Helpers for talking to Supabase in a way that always terminates.
//
// A promise that never settles is indistinguishable from one that is merely slow,
// so anything the first render blocks on needs a deadline. This is not theoretical:
// supabase-js retries an unreachable token refresh internally, on its own backoff,
// and never rejects — which left the app sitting on "Loading..." indefinitely with
// nothing in the UI to act on.

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

// Default deadline. Long enough that a slow-but-working connection isn't cut off,
// short enough that a broken one is reported while the user is still watching.
const DEFAULT_TIMEOUT_MS = 10_000;

// Accepts a PromiseLike rather than a Promise: Supabase query builders are
// thenables that only issue the request when awaited, so they aren't real promises.
export function withTimeout<T>(work: PromiseLike<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    Promise.resolve(work).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Turns whatever we caught into something worth showing a user. Supabase returns
// errors as plain objects rather than Error instances, so this reads `message`
// structurally instead of checking instanceof.
export function describeBackendError(err: unknown): string {
  if (err instanceof TimeoutError) {
    return "The server isn't responding. It may be starting up, or the project may be paused.";
  }
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';

  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "Can't reach the server. Check your connection, or whether the backend is running.";
  }
  return message || 'Something went wrong talking to the server.';
}
