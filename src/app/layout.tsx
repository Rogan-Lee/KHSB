import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { KakaoSdkLoader } from "@/components/kakao-sdk-loader";
import { ClerkProvider } from "@clerk/nextjs";
import { koKR } from "@clerk/localizations";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "독서실 관리 시스템",
  description: "관리형 독서실 원생 종합 관리 시스템",
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
