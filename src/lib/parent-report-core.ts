// 학부모 리포트(멘토링 /r/[token]) 핵심 로직 — 웹 서버 액션(src/actions/parent-reports.ts)과
// 모바일 API(src/lib/mobile-staff-parent-reports.ts)가 같이 쓴다. 인증·권한 검사는 호출 측 책임.

import { Prisma } from "@/generated/prisma/client";
import { createOpaqueToken } from "@/lib/auth-tokens";
import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { prisma } from "@/lib/prisma";
import { reportExpiresAt } from "@/lib/token-auth";

export class ParentReportCoreError extends Error {}

/** 멘토링 1건에 대한 학부모 리포트 링크 생성. customNote 가 비면 멘토링 기타 메모로 채운다. */
export async function createParentReportRecord(params: {
  mentoringId: string;
  createdById: string;
  studyPlanImages?: string[];
  customNote?: string | null;
}) {
  const mentoring = await prisma.mentoring.findUnique({
    where: { id: params.mentoringId },
    select: { studentId: true, notes: true },
  });
  if (!mentoring) throw new ParentReportCoreError("멘토링을 찾을 수 없습니다");

  return prisma.parentReport.create({
    data: {
      // 링크 토큰 = 열람 자격 → 스키마 기본값(cuid) 대신 CSPRNG 토큰
      token: createOpaqueToken(24),
      studentId: mentoring.studentId,
      mentoringId: params.mentoringId,
      studyPlanImages: params.studyPlanImages ?? [],
      customNote: params.customNote || mentoring.notes || null,
      createdById: params.createdById,
      expiresAt: reportExpiresAt(),
    },
    select: { id: true, token: true, createdAt: true, expiresAt: true },
  });
}

/**
 * 학부모 리포트 발송 화면용 학생별 데이터.
 * - ACTIVE 학생 전체
 * - 각 학생의 가장 최근 COMPLETED 멘토링
 * - 그 멘토링에 연결된 최신 ParentReport (있으면, 만료·취소 여부 포함)
 *
 * egress: 목록 + 중첩 take 는 DB 에서 안 잘려 완료 멘토링 전부(notes·content 본문)와 그 리포트 전부(customNote)를
 * 가져왔다. 그룹별 최신 id 만 DB 에서 고르고, hasNotes 는 본문 대신 조건 조회(id 만)로 계산한다.
 * customNote 는 목록에 싣지 않는다 — 웹은 선택한 원생 것만 getParentReportNote 로 불러온다.
 */
export async function listStudentsForReportDispatch() {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true, school: true },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });

  // 학생별 최신 COMPLETED 멘토링 (기존 중첩 orderBy 와 같은 정렬 — DESC 는 NULL 먼저)
  const mentoringIds = await latestIdsPerGroup({
    table: "Mentoring",
    groupBy: "studentId",
    groupIds: students.map((s) => s.id),
    orderBy: [
      { column: "actualDate", dir: "desc" },
      { column: "scheduledAt", dir: "desc" },
    ],
    where: Prisma.sql`"status" = 'COMPLETED'`,
  });

  const [mentorings, notedIds, reportIds] =
    mentoringIds.length > 0
      ? await Promise.all([
          prisma.mentoring.findMany({
            where: { id: { in: mentoringIds } },
            select: {
              id: true,
              studentId: true,
              actualDate: true,
              scheduledAt: true,
              mentorId: true,
              mentor: { select: { name: true } },
            },
          }),
          // hasNotes = !!(notes || content) — 빈 문자열도 "없음"으로 본다
          prisma.mentoring.findMany({
            where: {
              id: { in: mentoringIds },
              OR: [
                { AND: [{ notes: { not: null } }, { notes: { not: "" } }] },
                { AND: [{ content: { not: null } }, { content: { not: "" } }] },
              ],
            },
            select: { id: true },
          }),
          latestIdsPerGroup({
            table: "ParentReport",
            groupBy: "mentoringId",
            groupIds: mentoringIds,
            orderBy: [{ column: "createdAt", dir: "desc" }],
          }),
        ])
      : [[], [], [] as string[]];

  const reports =
    reportIds.length > 0
      ? await prisma.parentReport.findMany({
          where: { id: { in: reportIds } },
          select: {
            id: true,
            mentoringId: true,
            token: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        })
      : [];

  const mentoringByStudent = new Map(mentorings.map((m) => [m.studentId, m]));
  const noted = new Set(notedIds.map((m) => m.id));
  const reportByMentoring = new Map(reports.map((r) => [r.mentoringId, r]));

  return students.map((s) => {
    const m = mentoringByStudent.get(s.id);
    const pr = m ? reportByMentoring.get(m.id) : undefined;
    return {
      studentId: s.id,
      studentName: s.name,
      grade: s.grade,
      school: s.school,
      latestMentoring: m
        ? {
            id: m.id,
            date: m.actualDate ?? m.scheduledAt,
            mentorId: m.mentorId,
            mentorName: m.mentor.name,
            hasNotes: noted.has(m.id),
          }
        : null,
      parentReport: pr
        ? {
            id: pr.id,
            token: pr.token,
            createdAt: pr.createdAt,
            expiresAt: pr.expiresAt,
            revokedAt: pr.revokedAt,
          }
        : null,
    };
  });
}
