import { DM_Sans, Geist_Mono, Fraunces } from "next/font/google";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/firebase/auth-context";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ACUTE — Autonomous SEO Content Engine",
  description: "AI content engine that researches before it writes. Crawl your SaaS URL, discover high-intent keywords, and generate validated articles in one click.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased font-light`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <PostHogProvider>
          <AuthProvider>
            <Suspense>{children}</Suspense>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
