// 모바일 직원 소통 탭 — 학생 질문 받은함(필터) + 담당·상태 처리.
// 스레드 조회·답변 등록은 P3 의 src/lib/mobile-workflows.ts 를 그대로 쓴다.

import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import {
  claimStudentQuestionFor,
  releaseStudentQuestionClaim,
  updateStudentQuestionStatus,
} from "@/lib/question-handling";

export type StaffQuestionFilter = "waiting" | "mine" | "all";

const OVERDUE_MS = 24 * 60 * 60 * 1000;

function parseFilter(raw: string | null): StaffQuestionFilter {
  return raw === "mine" || raw === "all" ? raw : "waiting";
}

function attachmentCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * 직원 질문 받은함.
 *  · waiting: 답변 대기 — 상태 OPEN 이거나, 답변 후 학생이 다시 물어본(마지막 메시지가 학생) 질문
 *  · mine:    내가 담당한 질문 (해결됨 포함)
 *  · all:     보관 제외 전체 (해결됨 포함)
 * 퇴원생 질문은 제외 (사이드바·탭 배지와 같은 기준).
 */
export async function getMobileStaffQuestionInbox(
  userId: string,
  rawFilter: string | null,
  now = new Date(),
) {
  const filter = parseFilter(rawFilter);
  const rows = await prisma.studentQuestion.findMany({
    where: { status: { not: "ARCHIVED" }, student: { status: "ACTIVE" } },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      title: true,
      subject: true,
      status: true,
      createdAt: true,
      lastMessageAt: true,
      staffReadAt: true,
      claimedById: true,
      claimedBy: { select: { id: true, name: true } },
      student: { select: { id: true, name: true, grade: true, school: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { senderType: true, content: true, attachments: true },
      },
    },
  });

  const derived = rows.map((q) => {
    const last = q.messages[0] ?? null;
    const lastAt = q.lastMessageAt ?? q.createdAt;
    const lastSenderType = last?.senderType ?? null;
    // 해결된 질문에 학생이 다시 물은 경우도 대기로 본다(구버전 학생 앱은 RESOLVED 에도 추가 질문 가능)
    const waiting =
      q.status === "OPEN" || (q.status !== "ARCHIVED" && lastSenderType === "STUDENT");
    const hasUnread =
      !q.staffReadAt || (lastSenderType === "STUDENT" && lastAt > q.staffReadAt);
    return { q, last, lastAt, lastSenderType, waiting, hasUnread };
  });

  const counts = {
    waiting: derived.filter((d) => d.waiting).length,
    mine: derived.filter((d) => d.q.claimedById === userId).length,
    all: derived.length,
  };

  const visible = derived.filter((d) =>
    filter === "waiting" ? d.waiting : filter === "mine" ? d.q.claimedById === userId : true,
  );

  // 미확인 메시지 수 — 미확인 표시가 있는 질문만 센다 (쿼리 수 최소화)
  const unreadCounts = await Promise.all(
    visible.map((d) =>
      d.hasUnread
        ? prisma.questionMessage.count({
            where: {
              questionId: d.q.id,
              senderType: "STUDENT",
              createdAt: d.q.staffReadAt ? { gt: d.q.staffReadAt } : undefined,
            },
          })
        : Promise.resolve(0),
    ),
  );

  const overdueBefore = now.getTime() - OVERDUE_MS;
  const items = visible.map((d, i) => ({
    id: d.q.id,
    title: d.q.title,
    subject: d.q.subject,
    status: d.q.status,
    studentId: d.q.student.id,
    studentName: d.q.student.name,
    grade: d.q.student.grade,
    school: d.q.student.school,
    lastMessage: d.last?.content ?? "",
    lastSenderType: d.lastSenderType,
    attachmentCount: attachmentCount(d.last?.attachments),
    lastMessageAt: d.lastAt.toISOString(),
    createdAt: d.q.createdAt.toISOString(),
    claimedBy: d.q.claimedBy,
    claimedByMe: d.q.claimedById === userId,
    unread: unreadCounts[i],
    waiting: d.waiting,
    overdue: d.waiting && d.lastAt.getTime() < overdueBefore,
  }));

  const overdue = derived.filter(
    (d) => d.waiting && d.lastAt.getTime() < overdueBefore,
  ).length;

  return {
    filter,
    items,
    summary: {
      ...counts,
      overdue,
      /** 하위 호환 (구 StaffQuestionsResponse) */
      open: counts.waiting,
    },
  };
}

async function assertQuestion(questionId: string) {
  const question = await prisma.studentQuestion.findUnique({
    where: { id: questionId },
    select: { id: true },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없습니다", 404);
}

export async function claimMobileStaffQuestion(userId: string, questionId: string) {
  const result = await claimStudentQuestionFor(questionId, userId);
  return { ok: true, ...result };
}

export async function releaseMobileStaffQuestion(questionId: string) {
  await assertQuestion(questionId);
  await releaseStudentQuestionClaim(questionId);
  return { ok: true, claimedBy: null };
}

const statusSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "ARCHIVED"], {
    message: "변경할 상태를 확인하세요",
  }),
});

export async function setMobileStaffQuestionStatus(questionId: string, input: unknown) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
  }
  await assertQuestion(questionId);
  await updateStudentQuestionStatus(questionId, parsed.data.status);
  return { ok: true, status: parsed.data.status };
}
