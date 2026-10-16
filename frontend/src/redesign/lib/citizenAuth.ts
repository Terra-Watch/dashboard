/** Keep return targets internal to TerraWatch public/Citizen routes; never accept an open redirect. */
export function safeCitizenReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/citizen';
  try {
    const decoded = decodeURIComponent(raw);
    const isSafePath = decoded === '/community' || decoded.startsWith('/community/') || decoded === '/citizen' || decoded.startsWith('/citizen/');
    if (isSafePath && !decoded.startsWith('/citizen/login') && !decoded.startsWith('/citizen/register')) return decoded;
  } catch {
    // Invalid encoded targets fall back to the safe home route.
  }
  return '/citizen';
}
