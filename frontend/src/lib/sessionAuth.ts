/** Return only a token established by the explicit sign-in flow. */
export async function getAuthToken(): Promise<string | null> {
  return localStorage.getItem('resq_token');
}

/** A forbidden response means the identity lacks permission, not that it expired. */
export function clearExpiredToken(status: number): void {
  if (status === 401) localStorage.removeItem('resq_token');
}

/** Read the double-submit CSRF cookie for authenticated browser mutations. */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('resq_csrf='));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice('resq_csrf='.length));
  } catch {
    return null;
  }
}

/** Attach the login-issued CSRF cookie value to browser state-changing requests. */
export function addCsrfHeader(headers: Headers, method: string): Headers {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return headers;
  const csrf = getCsrfToken();
  if (csrf) headers.set('x-resq-csrf', csrf);
  return headers;
}
