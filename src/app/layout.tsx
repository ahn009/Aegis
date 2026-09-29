import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Velora | HVAC Operations",
  description: "Manage HVAC calls, leads, and appointments in one workspace.",
  authors: [{ name: "Velora Automations" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Velora | HVAC Operations",
    description: "Manage HVAC calls, leads, and appointments in one workspace.",
    siteName: "Velora",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
