import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { KakaoSdkLoader } from "@/components/kakao-sdk-loader";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "독서실 관리 시스템",
  description: "관리형 독서실 원생 종합 관리 시스템",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-right" />
        <KakaoSdkLoader />
        <Analytics />
      </body>
    </html>
  );
}
