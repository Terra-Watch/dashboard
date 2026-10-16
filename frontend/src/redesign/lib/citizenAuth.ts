/** Keep return targets internal to the Citizen route family; never accept an open redirect. */
export function safeCitizenReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/citizen';
  try {
    const decoded = decodeURIComponent(raw);
    const isCitizenPath = decoded === '/citizen' || decoded.startsWith('/citizen/');
    if (isCitizenPath && !decoded.startsWith('/citizen/login') && !decoded.startsWith('/citizen/register')) return decoded;
  } catch {
    // Invalid encoded targets fall back to the safe home route.
  }
  return '/citizen';
}
