import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { getPortalBadgeCounts } from "@/lib/portal-badges";
import { PortalShell } from "./_components/portal-shell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F4F2" },
    { media: "(prefers-color-scheme: dark)", color: "#F4F4F2" },
  ],
};

export const metadata: Metadata = {
  title: "내 포털 · 강한선배 | KHSB",
  description: "본인 전용 학생 포털입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "강한선배",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function StudentPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  // 온라인/오프라인 구분 없이 동일 메뉴를 제공하므로 배지 카운트도 항상 계산.
  const b = await getPortalBadgeCounts(session.student.id);

  return (
    <>
      <link
        rel="manifest"
        href={`/s/${token}/manifest.webmanifest`}
        crossOrigin="use-credentials"
      />
      <link rel="apple-touch-icon" href="/icons/portal-icon.svg" />
      <PortalShell
        token={token}
        badges={{
          tasks: b.tasks,
          qna: b.qna,
          chat: b.chat,
          menu: b.feedback + b.vocab + b.suggestions,
        }}
      >
        {children}
      </PortalShell>
    </>
  );
}
