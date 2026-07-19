import { DM_Sans, Geist_Mono, Fraunces } from "next/font/google";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/firebase/auth-context";
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
  title: "Blog Design Extractor",
  description: "Extract design references and patterns from any blog URL using Playwright and Readability.",
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
        <AuthProvider>
          <Suspense>{children}</Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
