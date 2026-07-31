import { prisma } from "@/lib/prisma";

/**
 * 모바일 — 학생이 받은 수행평가 피드백 목록.
 * 웹 포털(`/s/[token]/feedback`)과 동일하게 본인 task 의 TaskFeedback 만 조회하고,
 * 조회 시 미확인 피드백을 읽음 처리한다(읽음 처리 전 unread 상태를 isNew 로 보존).
 */
export async function getMobileStudentFeedbacks(studentId: string) {
  const feedbacks = await prisma.taskFeedback.findMany({
    where: { submission: { task: { studentId } } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      content: true,
      status: true,
      files: true,
      createdAt: true,
      readByStudentAt: true,
      author: { select: { name: true } },
      submission: {
        select: {
          version: true,
          task: { select: { id: true, title: true, subject: true } },
        },
      },
    },
  });

  const unreadIds = feedbacks
    .filter((f) => f.readByStudentAt === null)
    .map((f) => f.id);

  const items = feedbacks.map((f) => ({
    id: f.id,
    content: f.content,
    status: f.status,
    isNew: f.readByStudentAt === null,
    authorName: f.author.name,
    taskId: f.submission.task.id,
    taskTitle: f.submission.task.title,
    subject: f.submission.task.subject,
    version: f.submission.version,
    fileCount: Array.isArray(f.files) ? f.files.length : 0,
    createdAt: f.createdAt.toISOString(),
  }));

  if (unreadIds.length > 0) {
    await prisma.taskFeedback.updateMany({
      where: { id: { in: unreadIds } },
      data: { readByStudentAt: new Date() },
    });
  }

  return {
    items,
    summary: { total: items.length, unread: unreadIds.length },
  };
}
