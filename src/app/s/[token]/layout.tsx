import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { StudentAppHeader } from "./_components/student-app-header";
import { StudentBottomNav } from "./_components/student-bottom-nav";

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
  title: "내 포털 · 스터디룸 매니저",
  description: "본인 전용 학생 포털입니다.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "내 포털",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function StudentPortalLayout({
  children,
  params,
}: LayoutProps<"/s/[token]">) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const [taskBadge, survey] = await Promise.all([
    prisma.performanceTask.count({
      where: {
        studentId: session.student.id,
        status: { in: ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"] },
      },
    }),
    prisma.onboardingSurvey.findUnique({
      where: { studentId: session.student.id },
      select: { submittedAt: true, sections: true },
    }),
  ]);

  const surveyBadge: "incomplete" | "submitted" | null = survey?.submittedAt
    ? "submitted"
    : "incomplete";

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (session.link.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  );

  return (
    <>
      <link
        rel="manifest"
        href={`/s/${token}/manifest.webmanifest`}
        crossOrigin="use-credentials"
      />
      <link rel="apple-touch-icon" href="/icons/portal-icon.svg" />
      <div
        className="min-h-[100svh] bg-canvas"
        style={{
          paddingBottom:
            "calc(env(safe-area-inset-bottom) + 64px)" /* bottom nav clearance */,
        }}
      >
        <StudentAppHeader
          token={token}
          studentName={session.student.name}
          daysLeft={daysLeft}
        />
        <main className="mx-auto max-w-[480px] px-4 pb-4 pt-3">{children}</main>
        <StudentBottomNav
          token={token}
          taskBadge={taskBadge}
          surveyBadge={surveyBadge}
        />
      </div>
    </>
  );
}
