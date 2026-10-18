import type { ProductRole } from './nav.ts';

export type InboxItem = { id: number; kind: string; message: string; severity: string; state: string | null; entity_type: string | null; entity_id: string | null; read: boolean; created_at: string };

/** Where a notification takes this person. Null means it is information only. */
export function inboxTarget(role: ProductRole, item: Pick<InboxItem, 'entity_type' | 'entity_id'>): string | null {
  const id = item.entity_id && /^\d+$/.test(item.entity_id) ? item.entity_id : null;
  if (!id) return null;
  if (role === 'control_room') {
    if (item.entity_type === 'incident') return `/ops/incidents/${id}`;
    if (item.entity_type === 'incident_assignment') return '/ops/field';
    return null;
  }
  if (role === 'field') return item.entity_type === 'incident_assignment' ? `/field/tasks/${id}` : '/field/tasks';
  if (role === 'citizen' && item.entity_type === 'community_sanction') return '/citizen/community';
  return null;
}

/** Short plain label for the kind of notification. */
export const KIND_LABEL: Record<string, string> = {
  citizen_report_received: 'New report', report_unattended: 'Report with no officer', assignment_created: 'New task', assignment_reassigned: 'Task changed',
  assignment_accepted: 'Task accepted', assignment_declined: 'Task declined', verification_submitted: 'Field observation', assignment_completed: 'Task finished',
};
export const kindLabel = (kind: string): string => KIND_LABEL[kind] ?? 'Update';
