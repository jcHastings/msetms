import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ShellSwitch } from "@/components/shell-switch";
import { deliverAlertEmails, listOfficeNotifications, syncAlertNotifications } from "@/lib/alert-rules";
import { runWorkflowTick } from "@/lib/workflow";
import { getSignedInDispatcher, isTwoFactorRequired } from "@/lib/dispatcher-session";
import { isOpenAiConfigured, loadRuntimeEnv } from "@/lib/env";
import { readMikeHistory } from "@/lib/mike";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MS Express TMS",
  description: "Transportation management for a small trucking fleet",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await loadRuntimeEnv();
  const dispatcher = await getSignedInDispatcher();
  const requireTwoFactor = isTwoFactorRequired();
  const mikeConfigured = isOpenAiConfigured();
  const mikeMessages = dispatcher ? await readMikeHistory() : [];
  let officeNotifications: Awaited<ReturnType<typeof listOfficeNotifications>> = [];
  if (dispatcher) {
    try {
      const sync = syncAlertNotifications();
      if (sync.emails.length) void deliverAlertEmails(sync.emails);
      runWorkflowTick();
      officeNotifications = listOfficeNotifications(dispatcher.id);
    } catch {
      officeNotifications = [];
    }
  }
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ShellSwitch
          dispatcher={dispatcher}
          requireTwoFactor={requireTwoFactor}
          mikeConfigured={mikeConfigured}
          mikeMessages={mikeMessages}
          officeNotifications={officeNotifications}
        >
          {children}
        </ShellSwitch>
      </body>
    </html>
  );
}
