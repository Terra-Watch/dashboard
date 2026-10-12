export type TrustLevel = 'forecast' | 'detection' | 'verified' | 'scenario';

export type RiskBand = 'Low' | 'Moderate' | 'High' | 'Very high';

export type Role = 'range_officer' | 'control_room' | 'field_crew' | 'incident_commander' | 'reviewer';

export const ROLE_LABEL: Record<Role, string> = {
  range_officer: 'Range officer',
  control_room: 'Control-room operator',
  field_crew: 'Field crew / beat guard',
  incident_commander: 'Incident commander',
  reviewer: 'Reviewer / judge',
};

export interface Detection {
  id: string;
  incident_id: string;
  source: 'VIIRS' | 'field_report';
  state: string;
  label: string;
  detected_at: string;
  confidence: 'low' | 'nominal' | 'high';
  status: 'new' | 'verify' | 'dismiss' | 'escalate';
  lat: number;
  lon: number;
}

export interface TriageAction {
  detection_id: string;
  action: 'verify' | 'dismiss' | 'escalate';
  timestamp: string;
  device_id: string;
}

export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedFieldReport {
  idempotency_key: string;
  task_id: string;
  note: string;
  photo_name: string | null;
  captured_at: string;
  state: SyncState;
  attempts: number;
}
