import { homePath, roleOfPath, type ProductRole } from '../../ui/nav.ts';


export const MIN_PASSWORD = 10;
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd123', '1234567890', '12345678901', 'qwertyuiop', 'qwerty12345', 'iloveyou123', 'welcome123', 'letmein1234', 'admin12345', 'terrawatch', 'terrawatch1', 'abcdefghij', '0123456789', 'changeme123']);

export type PasswordCheck = { lengthOk: boolean; notCommon: boolean; notEmail: boolean; ok: boolean };

/** Mirrors the server rule (backend/app/services/password_policy.py) so people see the same answer before they submit. */
export function checkPassword(password: string, email = ''): PasswordCheck {
  const lowered = password.toLowerCase();
  const local = email.split('@')[0].toLowerCase();
  const lengthOk = password.length >= MIN_PASSWORD;
  const notCommon = !(COMMON.has(lowered) || (lowered.length > 0 && new Set(lowered).size <= 3));
  const notEmail = !(local.length >= 4 && lowered.includes(local));
  return { lengthOk, notCommon, notEmail, ok: lengthOk && notCommon && notEmail };
}

/** Where to go after signing in: the page asked for if it belongs to this person's area, otherwise their home. Never an outside address. */
export function safeNext(next: string | null | undefined, role: ProductRole | null): string {
  if (role && next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && roleOfPath(next) === role) return next;
  return homePath(role);
}
