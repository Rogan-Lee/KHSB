import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { countUnseenSuggestionUpdates } from "@/actions/student-suggestions";
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

/** 학생 측 미확인 채팅 메시지 합계 (모든 담당자 채팅방 합산). */
async function countUnreadChatMessagesForStudent(
  studentId: string
): Promise<number> {
  const chats = await prisma.portalChat.findMany({
    where: { studentId },
    select: { id: true, studentReadAt: true },
  });
  if (chats.length === 0) return 0;
  const counts = await Promise.all(
    chats.map((c) =>
      prisma.portalChatMessage.count({
        where: {
          chatId: c.id,
          senderType: "STAFF",
          createdAt: c.studentReadAt ? { gt: c.studentReadAt } : undefined,
        },
      })
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

/** 학생 측 미확인 질문 답변 합계 (모든 질문 합산). */
async function countUnreadQuestionAnswersForStudent(
  studentId: string
): Promise<number> {
  const questions = await prisma.studentQuestion.findMany({
    where: { studentId },
    select: { id: true, studentReadAt: true },
  });
  if (questions.length === 0) return 0;
  const counts = await Promise.all(
    questions.map((q) =>
      prisma.questionMessage.count({
        where: {
          questionId: q.id,
          senderType: "STAFF",
          createdAt: q.studentReadAt ? { gt: q.studentReadAt } : undefined,
        },
      })
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

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

  const isOnlineManaged = session.student.isOnlineManaged;
  // 온라인/오프라인 구분 없이 동일 메뉴를 제공하므로 배지 카운트도 항상 계산.
  const [taskBadge, feedbackBadge, chatBadge, vocabTotal, vocabBadge, questionBadge, suggestionBadge] =
    await Promise.all([
      prisma.performanceTask.count({
        where: {
          studentId: session.student.id,
          status: { in: ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"] },
        },
      }),
      prisma.taskFeedback.count({
        where: {
          readByStudentAt: null,
          submission: { task: { studentId: session.student.id } },
        },
      }),
      countUnreadChatMessagesForStudent(session.student.id),
      prisma.vocabAttempt.count({ where: { studentId: session.student.id } }),
      prisma.vocabAttempt.count({
        where: { studentId: session.student.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      }),
      countUnreadQuestionAnswersForStudent(session.student.id),
      countUnseenSuggestionUpdates(session.student.id),
    ]);

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
          isOnlineManaged={isOnlineManaged}
        />
        <main className="mx-auto max-w-[480px] px-4 pb-4 pt-3">{children}</main>
        <StudentBottomNav
          token={token}
          taskBadge={taskBadge}
          feedbackBadge={feedbackBadge}
          chatBadge={chatBadge}
          vocabBadge={vocabBadge}
          hasVocab={vocabTotal > 0}
          questionBadge={questionBadge}
          suggestionBadge={suggestionBadge}
        />
      </div>
    </>
  );
}
