import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { OperationsAuthGuard } from "../../components/dashboard/OperationsAuthGuard";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <OperationsAuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </OperationsAuthGuard>
  );
}
