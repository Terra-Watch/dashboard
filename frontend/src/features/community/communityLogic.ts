export const POST_TYPES = [
  { value: 'question', label: 'Question' },
  { value: 'information', label: 'Local information (unverified)' },
  { value: 'thanks', label: 'Thanks' },
] as const;
export type PostType = (typeof POST_TYPES)[number]['value'];

export const MAX_POST = 2000;
export const REPORT_REASONS = ['Spam', 'Unsafe advice', 'Harassment', 'Misinformation', 'Other'] as const;
export const MODERATOR_ROLES = ['admin', 'control_room_operator', 'incident_commander'];

export function validatePost(text: string): string {
  const length = text.trim().length;
  if (!length) return 'Write something to post.';
  if (length > MAX_POST) return `Posts can be up to ${MAX_POST} characters.`;
  return '';
}

/** Authors can edit for a short window after publishing (the server enforces the same rule). */
export function canEdit(post: { author?: { id?: number }; created_at: string; removed?: unknown }, userId: number | undefined, now: number, windowMinutes = 15): boolean {
  if (!userId || post.removed || post.author?.id !== userId) return false;
  const created = Date.parse(post.created_at);
  return Number.isFinite(created) && now - created <= windowMinutes * 60_000;
}

/** Refresh every 15 s; back off to at most 2 minutes after consecutive failures; pause while the tab is hidden. */
export function nextPollDelay(failures: number, hidden: boolean): number | null {
  if (hidden) return null;
  return Math.min(15_000 * 2 ** Math.max(0, failures), 120_000);
}

export function removalText(removed: { by?: string | null; reason?: string | null } | undefined): string {
  if (!removed) return '';
  if (removed.by === 'author') return 'Removed by its author.';
  return removed.reason ? `Removed by a moderator: ${removed.reason}` : 'Removed by a moderator.';
}

const EMERGENCY = [/\bfire at\b/i, /\bon fire\b/i, /\bburning\b/i, /\bflames?\b/i, /\btrapped\b/i, /\bevacuate\b/i, /\bhelp\b/i, /\bemergency\b/i, /आग/, /मदद/, /बचाओ/, /ନିଆଁ/];

/** True when a draft sounds like an emergency, so the screen can point to Report. It never blocks posting. */
export function looksLikeEmergency(text: string): boolean {
  return EMERGENCY.some(pattern => pattern.test(text));
}

export const CHAT_MAX = 500;
export const TOPICS = [
  { value: 'question', label: 'Question' },
  { value: 'information', label: 'Local information (not verified)' },
  { value: 'thanks', label: 'Thanks' },
] as const;
export const LANGUAGES_FOR_POSTS = [{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }, { value: 'or', label: 'ଓଡ଼ିଆ' }, { value: 'other', label: 'Other' }] as const;
