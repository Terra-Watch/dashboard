let refreshing: Promise<boolean> | null = null;

/** Gets a new access token from the refresh cookie and stores it. One call at a time: the server rotates the cookie on every use, so two parallel calls would look like a stolen cookie and end the session. */
export function renewToken(apiBase: string): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${apiBase}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.access_token !== 'string') return false;
      localStorage.setItem('resq_token', data.access_token);
      return true;
    } catch { return false; }
    finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}
