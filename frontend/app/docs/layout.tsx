import type { Metadata } from "next";
import { DocsLayout } from "@/components/docs/DocsLayout";

export const metadata: Metadata = {
  title: "JALARI System Documentation",
  description: "Technical architecture, networking protocols, hardware specifications, and engineering documentation for the Jalari maritime safety system.",
};

export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  return <DocsLayout>{children}</DocsLayout>;
}
