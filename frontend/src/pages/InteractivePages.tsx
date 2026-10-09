import { AlertRulesPage, AlertsPage, AssistantPage, IncidentsPage, PlanPage, SettingsPage, SpreadPage } from '../features/operations';

export { NotificationsPage } from '../features/operations';

export function InteractivePages({ kind }: { kind: 'plan' | 'alerts' | 'alert-rules' | 'incidents' | 'spread' | 'assistant' | 'settings' }) {
  if (kind === 'plan') return <PlanPage />;
  if (kind === 'alerts') return <AlertsPage />;
  if (kind === 'alert-rules') return <AlertRulesPage />;
  if (kind === 'incidents') return <IncidentsPage />;
  if (kind === 'spread') return <SpreadPage />;
  if (kind === 'assistant') return <AssistantPage />;
  return <SettingsPage />;
}
