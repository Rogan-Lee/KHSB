import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { prisma } from "@/lib/prisma";

/**
 * 학생별 최근 화상 세션 `take`건 (scheduledAt 내림차순) — /online/students·/online/sessions 목록용.
 *
 * 학생 목록 + 중첩 `mentoringSessions: { take }` 는 DB 에서 학생별로 잘리지 않아
 * 전체 세션 이력(notes·summary 장문 포함)을 가져온 뒤 메모리에서 자른다(egress 폭증).
 * 학생별 최신 id 만 DB 에서 고른 뒤 화면에 쓰는 컬럼만 조회한다.
 */
export async function recentSessionsByStudent(studentIds: readonly string[], take: number) {
  const ids = await latestIdsPerGroup({
    table: "MentoringSession",
    groupBy: "studentId",
    groupIds: studentIds,
    orderBy: [{ column: "scheduledAt", dir: "desc" }],
    take,
  });
  const rows =
    ids.length > 0
      ? await prisma.mentoringSession.findMany({
          where: { id: { in: ids } },
          orderBy: { scheduledAt: "desc" },
          select: {
            id: true,
            studentId: true,
            title: true,
            status: true,
            scheduledAt: true,
            durationMinutes: true,
            meetUrl: true,
            calendarHtmlLink: true,
            notes: true,
            summary: true,
            host: { select: { name: true } },
            photos: { orderBy: { uploadedAt: "asc" } },
          },
        })
      : [];
  const byStudent = new Map<string, typeof rows>();
  for (const ms of rows) {
    const list = byStudent.get(ms.studentId);
    if (list) list.push(ms);
    else byStudent.set(ms.studentId, [ms]);
  }
  return byStudent;
}
