import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { parseMobileBody, type ParentChildRef } from "@/lib/mobile-parent-services";
import {
  createOnlineParentFeedback,
  validateParentFeedbackContent,
} from "@/lib/online/parent-feedback";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// 학부모 앱 — 원장님께 문의. 운영진이 쓰는 학생별 소통 기록(Communication, PARENT_REQUEST)에
// 그대로 쌓여 입퇴실·학생 상세 화면에서 확인(isChecked)된다. 목록은 이 학부모가 쓴 것만 보여 준다
// (운영진이 전화 등으로 대신 적은 요청·전달사항은 내부 기록이라 노출하지 않는다).

export const INQUIRY_KINDS = {
  CONSULT: "상담 요청",
  ATTENDANCE: "출결",
  STUDY: "학습",
  ETC: "기타",
} as const;
export type InquiryKind = keyof typeof INQUIRY_KINDS;

const KIND_BY_LABEL = new Map<string, InquiryKind>(
  Object.entries(INQUIRY_KINDS).map(([k, label]) => [label, k as InquiryKind]),
);
const PREFIX = /^\[([^\]]{1,10})\]\s*/;

const DAILY_LIMIT = 10;

const createSchema = z.object({
  kind: z.enum(["CONSULT", "ATTENDANCE", "STUDY", "ETC"], {
    message: "문의 종류를 골라 주세요",
  }),
  content: z
    .string()
    .trim()
    .min(5, "문의 내용을 5자 이상 적어 주세요")
    .max(1000, "문의는 1000자까지 쓸 수 있어요"),
});

const feedbackSchema = z.object({
  content: z.string().trim().min(1, "내용을 입력해 주세요").max(2000, "2000자 이내로 작성해 주세요"),
});

function splitKind(content: string): { kind: InquiryKind; content: string } {
  const m = content.match(PREFIX);
  const kind = m ? KIND_BY_LABEL.get(m[1]) : undefined;
  return kind ? { kind, content: content.slice(m![0].length) } : { kind: "ETC", content };
}

async function parentDisplayName(authUserId: string, child: ParentChildRef) {
  const user = await prisma.authUser.findUnique({
    where: { id: authUserId },
    select: { name: true },
  });
  const name = user?.name?.trim();
  return `${name && !name.includes("@") ? name : child.name} 학부모`;
}

export async function listParentInquiries(authUserId: string, child: ParentChildRef) {
  const rows = await prisma.communication.findMany({
    where: { studentId: child.id, type: "PARENT_REQUEST", createdById: authUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, content: true, createdAt: true, isChecked: true, checkedAt: true },
  });
  return {
    studentName: child.name,
    items: rows.map((r) => {
      const { kind, content } = splitKind(r.content);
      return {
        id: r.id,
        kind,
        kindLabel: INQUIRY_KINDS[kind],
        content,
        createdAt: r.createdAt.toISOString(),
        checked: r.isChecked,
        checkedAt: r.checkedAt?.toISOString() ?? null,
      };
    }),
  };
}

export async function createParentInquiry(
  authUserId: string,
  child: ParentChildRef,
  input: unknown,
) {
  const body = parseMobileBody(createSchema, input);

  const recent = await prisma.communication.count({
    where: {
      studentId: child.id,
      type: "PARENT_REQUEST",
      createdById: authUserId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recent >= DAILY_LIMIT) {
    throw new MobileApiError("오늘은 문의를 더 남길 수 없어요. 급한 일은 독서실로 전화해 주세요", 429);
  }

  const kindLabel = INQUIRY_KINDS[body.kind];
  const created = await prisma.communication.create({
    data: {
      studentId: child.id,
      type: "PARENT_REQUEST",
      content: `[${kindLabel}] ${body.content}`,
      createdById: authUserId,
      createdByName: await parentDisplayName(authUserId, child),
    },
    select: { id: true },
  });

  notifySlack(
    `📨 [학부모 문의 · ${kindLabel}] ${child.name} 학부모 (앱): ${body.content.slice(0, 300)}`,
  );
  revalidatePath(`/students/${child.id}`);
  revalidatePath("/attendance");
  return { id: created.id };
}

/** 온라인 학습 리포트에 학부모 피드백 — 웹 공개 페이지 피드백과 같은 저장·알림 */
export async function submitParentOnlineReportFeedback(
  authUserId: string,
  children: ParentChildRef[],
  reportId: string,
  input: unknown,
) {
  const body = parseMobileBody(feedbackSchema, input);
  validateParentFeedbackContent(body.content);

  const report = await prisma.onlineParentReport.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, studentId: true },
  });
  const child = report ? children.find((c) => c.id === report.studentId) : undefined;
  if (!report || !child || report.status !== "SENT") {
    throw new MobileApiError("리포트를 찾을 수 없습니다", 404);
  }

  const name = (await parentDisplayName(authUserId, child)).replace(/ 학부모$/, "");
  return createOnlineParentFeedback(
    { id: report.id, studentName: child.name },
    { name: `${name} (앱)`, content: body.content },
  );
}
