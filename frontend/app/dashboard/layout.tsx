import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { OperationsAuthGuard } from "../../components/dashboard/OperationsAuthGuard";
import { AuthProvider } from "../../lib/family/authContext";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider><OperationsAuthGuard><DashboardShell>{children}</DashboardShell></OperationsAuthGuard></AuthProvider>
  );
}
