import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { KakaoSdkLoader } from "@/components/kakao-sdk-loader";
import { ClerkProvider } from "@clerk/nextjs";
import { koKR } from "@clerk/localizations";
import { Analytics } from "@vercel/analytics/react";

// 도메인: NEXT_PUBLIC_APP_URL (예: https://app.example.com). 링크 미리보기(OG)·sitemap 기준.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "독서실 관리 시스템",
    template: "%s · 독서실 관리 시스템",
  },
  description: "관리형 독서실 원생 종합 관리 시스템",
  applicationName: "독서실 관리 시스템",
  manifest: "/manifest.webmanifest",
  // 비공개 운영 도구 — 검색 엔진 색인 차단 (학생/학부모 데이터 보호)
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "독서실 관리 시스템",
    title: "독서실 관리 시스템",
    description: "관리형 독서실 원생 종합 관리 시스템",
    locale: "ko_KR",
  },
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
    <ClerkProvider
      localization={koKR}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html lang="ko" suppressHydrationWarning>
        <body className="antialiased">
          {children}
          <Toaster richColors position="top-right" />
          <KakaoSdkLoader />
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
