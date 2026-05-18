import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#FFFFFF" },
  ],
};

export const metadata: Metadata = {
  title: "근무자 포털 · 스터디룸 매니저",
  description: "근무자 전용 출퇴근 포털입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "근무자 포털",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function StaffPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <link
        rel="manifest"
        href={`/w/${token}/manifest.webmanifest`}
        crossOrigin="use-credentials"
      />
      <link rel="apple-touch-icon" href="/icons/portal-icon.svg" />
      {children}
    </>
  );
}
