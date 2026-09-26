// 학부모 리포트(멘토링 /r/[token]) 핵심 로직 — 웹 서버 액션(src/actions/parent-reports.ts)과
// 모바일 API(src/lib/mobile-staff-parent-reports.ts)가 같이 쓴다. 인증·권한 검사는 호출 측 책임.

import { createOpaqueToken } from "@/lib/auth-tokens";
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
 */
export async function listStudentsForReportDispatch() {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      mentorings: {
        where: { status: "COMPLETED" },
        orderBy: [{ actualDate: "desc" }, { scheduledAt: "desc" }],
        take: 1,
        select: {
          id: true,
          actualDate: true,
          scheduledAt: true,
          notes: true,
          content: true,
          mentorId: true,
          mentor: { select: { name: true } },
          parentReports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              token: true,
              customNote: true,
              createdAt: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });

  return students.map((s) => {
    const m = s.mentorings[0];
    const pr = m?.parentReports[0];
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
            hasNotes: !!(m.notes || m.content),
          }
        : null,
      parentReport: pr
        ? {
            id: pr.id,
            token: pr.token,
            customNote: pr.customNote,
            createdAt: pr.createdAt,
            expiresAt: pr.expiresAt,
            revokedAt: pr.revokedAt,
          }
        : null,
    };
  });
}
