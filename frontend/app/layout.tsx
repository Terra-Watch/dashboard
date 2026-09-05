import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "../components/providers/ClientProviders";

export const metadata: Metadata = {
  title: "JALARI",
  description: "Maritime Safety & Operations",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
