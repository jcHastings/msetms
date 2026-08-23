import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ShellSwitch } from "@/components/shell-switch";
import { getSignedInDispatcher, isTwoFactorRequired } from "@/lib/dispatcher-session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MSE TMS",
  description: "Transportation management for a small trucking fleet",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const dispatcher = await getSignedInDispatcher();
  const requireTwoFactor = isTwoFactorRequired();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ShellSwitch dispatcher={dispatcher} requireTwoFactor={requireTwoFactor}>
          {children}
        </ShellSwitch>
      </body>
    </html>
  );
}
