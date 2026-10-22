import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import '../ui/i18n';
import { applyTheme, readTheme } from '../ui/theme';
import { UpdatePrompt } from '../ui/UpdatePrompt';
import { PositionProvider } from '../features/field/Position';
import { StatusPage } from '../features/system/StatusPage';
import { Brand } from '../components/Brand';
import { LogoLoader } from '../ui/Loading';

// Every screen is loaded when it is first opened, so the landing page and sign-in stay small and the map code only loads with a map.
const AcceptInvitePage = lazy(() => import('../features/auth/AcceptInvitePage').then(m => ({ default: m.AcceptInvitePage })));
const RequestAccessPage = lazy(() => import('../features/auth/RequestAccessPage').then(m => ({ default: m.RequestAccessPage })));
const ForgotPage = lazy(() => import('../features/auth/ForgotPage').then(m => ({ default: m.ForgotPage })));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ResetPage = lazy(() => import('../features/auth/ResetPage').then(m => ({ default: m.ResetPage })));
const SignInPage = lazy(() => import('../features/auth/SignInPage').then(m => ({ default: m.SignInPage })));
const LandingPage = lazy(() => import('../features/landing/LandingPage').then(m => ({ default: m.LandingPage })));
const AccountPage = lazy(() => import('../features/citizen/AccountPage').then(m => ({ default: m.AccountPage })));
const CitizenLayout = lazy(() => import('../features/citizen/CitizenLayout').then(m => ({ default: m.CitizenLayout })));
const CommunityPage = lazy(() => import('../features/citizen/CommunityPage').then(m => ({ default: m.CommunityPage })));
const MyReportsPage = lazy(() => import('../features/citizen/MyReportsPage').then(m => ({ default: m.MyReportsPage })));
const CitizenHome = lazy(() => import('../features/citizen/CitizenHome').then(m => ({ default: m.CitizenHome })));
const NearMePage = lazy(() => import('../features/citizen/NearMePage').then(m => ({ default: m.NearMePage })));
const ReportDetailPage = lazy(() => import('../features/citizen/ReportDetailPage').then(m => ({ default: m.ReportDetailPage })));
const ReportPage = lazy(() => import('../features/citizen/ReportPage').then(m => ({ default: m.ReportPage })));
const AlertRulesPage = lazy(() => import('../features/ops/AlertRulesPage').then(m => ({ default: m.AlertRulesPage })));
const LogReportPage = lazy(() => import('../features/ops/LogReportPage').then(m => ({ default: m.LogReportPage })));
const PlanListPage = lazy(() => import('../features/operations').then(m => ({ default: m.PlanListPage })));
const PlanPage = lazy(() => import('../features/operations').then(m => ({ default: m.PlanPage })));
const AdminPage = lazy(() => import('../features/ops/AdminPage').then(m => ({ default: m.AdminPage })));
const OpsMapPage = lazy(() => import('../features/ops/MapPage').then(m => ({ default: m.OpsMapPage })));
const HandoverPage = lazy(() => import('../features/ops/HandoverPage').then(m => ({ default: m.HandoverPage })));
const OpsFieldPage = lazy(() => import('../features/ops/FieldPage').then(m => ({ default: m.OpsFieldPage })));
const OpsIncidentPage = lazy(() => import('../features/ops/IncidentPage').then(m => ({ default: m.OpsIncidentPage })));
const NoticesPage = lazy(() => import('../features/ops/NoticesPage').then(m => ({ default: m.NoticesPage })));
const WhatIfPage = lazy(() => import('../features/scenarios/WhatIfPage').then(m => ({ default: m.WhatIfPage })));
const OpsLayout = lazy(() => import('../features/ops/OpsLayout').then(m => ({ default: m.OpsLayout })));
const QueuePage = lazy(() => import('../features/ops/QueuePage').then(m => ({ default: m.QueuePage })));
const CapturePage = lazy(() => import('../features/field/CapturePage').then(m => ({ default: m.CapturePage })));
const FieldLayout = lazy(() => import('../features/field/FieldLayout').then(m => ({ default: m.FieldLayout })));
const FieldMapPage = lazy(() => import('../features/field/MapPage').then(m => ({ default: m.FieldMapPage })));
const MePage = lazy(() => import('../features/field/MePage').then(m => ({ default: m.MePage })));
const TaskDetailPage = lazy(() => import('../features/field/TaskDetailPage').then(m => ({ default: m.TaskDetailPage })));
const TasksPage = lazy(() => import('../features/field/TasksPage').then(m => ({ default: m.TasksPage })));

function Waiting() {
  const { t } = useTranslation();
  return <div data-rq-app className="min-h-screen bg-canvas text-ink"><header className="flex min-h-14 items-center border-b border-line bg-surface px-4"><Brand /></header><main><LogoLoader label={t('common.loading', 'Loading…')} /></main></div>;
}

/** Patrol planning is built but off until the department agrees how it should work (see docs/design/decisions.md). */
const PATROL_PLANNING = import.meta.env.VITE_FEATURE_PATROL_PLANNING === 'true';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

/** The one router. Screens that have been rebuilt live here; everything else still renders through the current screens until it is replaced. */
export function Root() {
  useEffect(() => { applyTheme(readTheme(), false); }, []);
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Suspense fallback={<Waiting />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<SignInPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/request-access" element={<RequestAccessPage />} />
        <Route path="/citizen" element={<CitizenLayout />}>
          <Route index element={<CitizenHome />} />
          <Route path="near-me" element={<NearMePage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="reports" element={<MyReportsPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="/ops" element={<OpsLayout />}>
          <Route index element={<Navigate to="queue" replace />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="incidents/new" element={<LogReportPage />} />
          <Route path="incidents/:id" element={<OpsIncidentPage />} />
          <Route path="map" element={<OpsMapPage />} />
          <Route path="field" element={<OpsFieldPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="handover" element={<HandoverPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="alert-rules" element={<AlertRulesPage />} />
          {PATROL_PLANNING && <><Route path="plans" element={<PlanListPage />} /><Route path="plans/new" element={<PlanPage />} /></>}
        </Route>
        <Route path="/app" element={<OpsLayout />}>
          <Route path="whatif" element={<WhatIfPage />} />
        </Route>
        <Route path="/field" element={<PositionProvider><FieldLayout /></PositionProvider>}>
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="map" element={<FieldMapPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="me" element={<MePage />} />
        </Route>
        <Route path="/community" element={<Navigate to="/citizen/community" replace />} />
        <Route path="/community/archive" element={<Navigate to="/citizen/community" replace />} />
        <Route path="/ranger/*" element={<Navigate to="/field/tasks" replace />} />
        <Route path="/control-room/*" element={<Navigate to="/ops/queue" replace />} />
        <Route path="/control-room" element={<Navigate to="/ops/queue" replace />} />
        <Route path="/staff/login" element={<Navigate to="/login" replace />} />
        <Route path="/citizen/login" element={<Navigate to="/login" replace />} />
        <Route path="/citizen/register" element={<Navigate to="/register" replace />} />
        <Route path="/offline" element={<StatusPage kind="offline" />} />
        <Route path="/session-expired" element={<StatusPage kind="session_expired" />} />
        <Route path="*" element={<StatusPage kind="not_found" />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    <UpdatePrompt />
    </QueryClientProvider>
  );
}
