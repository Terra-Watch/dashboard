import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '../../app/http';

export type Incident = {
  id: number; source: string; size: string; notes: string | null; status: string; close_reason: string | null; state: string | null;
  latitude: number | null; longitude: number | null; observed_at: string | null; created_at: string; updated_at: string;
  image_assessment_status?: string | null;
  image_media_integrity_status?: string | null;
};
export type OpsSettings = { 
  corroboration: { radius_km: number; window_minutes: number } | null; 
  exposure_radii_km: number[] | null; 
  feed_stale_minutes: number | null; 
  scenario_enabled: boolean;
  risk_forecast_enabled: boolean;
  risk_forecast_date: string | null;
};

export const INCIDENTS_KEY = ['ops-incidents'] as const;
export const useIncidents = () => useQuery({ queryKey: INCIDENTS_KEY, queryFn: () => api<Incident[]>('/api/incidents'), refetchInterval: 30_000 });
export const useOpsSettings = () => useQuery({ queryKey: ['ops-settings'], queryFn: () => api<OpsSettings>('/api/ops/settings'), staleTime: 300_000 });

// The region choice is shared by every Control Room screen and remembered on this device.
const KEY = 'tw_ops_region';
const listeners = new Set<() => void>();
const read = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
let current = read();
export const setOpsRegion = (value: string) => { current = value; try { localStorage.setItem(KEY, value); } catch { /* kept for this visit only */ } listeners.forEach(listener => listener()); };
export const useOpsRegion = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
