// 학부모 수강료 안내 — 앱 푸시 발송 + 발송 기록(TuitionNotice).
//
// 푸시는 앱을 설치하고 자녀를 연결한 학부모에게만 간다. 그래서 "도달한 기기 수"를 남겨
// 어드민이 미도달 학부모를 가려내고 카카오 안내문 복사로 보완할 수 있게 한다.
// 자동 발송(cron)은 dedupKey 를 먼저 넣어 같은 안내가 두 번 나가지 않게 한다.

import type { TuitionNoticeKind } from "@/generated/prisma/enums";
import { notifyParentsOfStudent, PARENT_PUSH_ROUTES } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";
import { addDays, dateKey, isOverdue, parseDateKey } from "@/lib/tuition/calc";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { monthDay, NOTICE_KIND_LABEL, won } from "@/lib/tuition/format";
import type { TuitionActor } from "@/lib/tuition/types";
import { todayKST } from "@/lib/utils";

export type NoticeMessageInput = {
  kind: TuitionNoticeKind;
  studentName: string;
  title: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  overdue: boolean;
  /** 실제 이용 종료일 YYYY-MM-DD (없으면 null) */
  coverageEnd: string | null;
  refundAmount?: number;
};

/** 이용 종료일 다음 날 — 다음 수강료가 시작되는 날 */
function dayAfter(key: string): string | null {
  const d = parseDateKey(key);
  return d ? dateKey(addDays(d, 1)) : null;
}

/** 학부모 안내 문구 — 푸시와 "카카오 안내문 복사"가 같은 문구를 쓴다 */
export function buildNoticeMessage(input: NoticeMessageInput): { title: string; body: string } {
  const { studentName, title, amount, dueDate, coverageEnd } = input;
  const head = `${studentName} 학생 ${title} ${won(amount)}`;
  switch (input.kind) {
    case "REQUEST":
      return { title: "수강료 안내", body: `${head} — ${monthDay(dueDate)}까지 납부해 주세요.` };
    case "REMIND":
      return input.overdue
        ? {
            title: "수강료 미납 안내",
            body: `${head}의 납부 기한(${monthDay(dueDate)})이 지났어요. 확인 부탁드려요.`,
          }
        : { title: "수강료 납부 안내", body: `${head} — 납부 기한은 ${monthDay(dueDate)}이에요.` };
    case "RENEWAL": {
      const next = coverageEnd ? dayAfter(coverageEnd) : null;
      return {
        title: "수강 기간 안내",
        body:
          coverageEnd && next
            ? `${studentName} 학생의 이용 기간이 ${monthDay(coverageEnd)}에 끝나요. 다음 수강료는 ${monthDay(next)} 이용분부터이며, 청구서가 나오면 알려 드릴게요.`
            : `${studentName} 학생의 이용 기간이 곧 끝나요. 다음 수강료 청구서가 나오면 알려 드릴게요.`,
      };
    }
    case "PAID": {
      const next = coverageEnd ? dayAfter(coverageEnd) : null;
      return {
        title: "수강료 납부 완료",
        body: `${head} 납부가 확인됐어요.${next ? ` 다음 결제는 ${monthDay(next)} 이용분부터예요.` : ""}`,
      };
    }
    case "REFUND":
      return {
        title: "수강료 환불 안내",
        body: `${studentName} 학생 ${title} ${won(input.refundAmount ?? 0)} 환불이 처리됐어요. 카드 환불은 카드사에 따라 며칠 걸릴 수 있어요.`,
      };
  }
}

/**
 * 카카오톡 등으로 직접 보낼 안내문 — 푸시 문구에 청구서 링크를 붙인다.
 * 링크를 누르면 앱 없이도 청구 내용을 보고 결제할 수 있다 (앱이 있으면 그 화면에서 앱으로 넘어간다).
 */
export function buildNoticeShareText(input: NoticeMessageInput, url: string | null): string {
  const message = buildNoticeMessage(input);
  const lines = [`[${message.title}]`, message.body];
  if (url) lines.push("", `청구서 확인·결제: ${url}`);
  return lines.join("\n");
}

/** 안내 1건 발송 + 발송 기록. dedupKey 가 이미 있으면 보내지 않고 skipped=true. throw 하지 않는다 */
export async function sendTuitionNotice(input: {
  invoiceId: string;
  kind: TuitionNoticeKind;
  dedupKey?: string;
  actor?: TuitionActor;
  refundAmount?: number;
}): Promise<{ sent: number; skipped: boolean }> {
  try {
    const invoice = await prisma.tuitionInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        studentId: true,
        title: true,
        amount: true,
        dueDate: true,
        status: true,
        coverageEnd: true,
        student: { select: { name: true } },
      },
    });
    if (!invoice) return { sent: 0, skipped: true };

    // 기록을 먼저 넣는다 — 겹쳐 실행된 cron 이 같은 안내를 두 번 보내지 않도록 (유니크 키가 선점 역할)
    let noticeId: string;
    if (input.dedupKey) {
      const inserted = await prisma.tuitionNotice.createMany({
        data: [{ invoiceId: invoice.id, kind: input.kind, dedupKey: input.dedupKey }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { sent: 0, skipped: true };
      const row = await prisma.tuitionNotice.findUnique({
        where: { dedupKey: input.dedupKey },
        select: { id: true },
      });
      if (!row) return { sent: 0, skipped: true };
      noticeId = row.id;
    } else {
      const row = await prisma.tuitionNotice.create({
        data: {
          invoiceId: invoice.id,
          kind: input.kind,
          sentById: input.actor?.id ?? null,
          sentByName: input.actor?.name ?? null,
        },
        select: { id: true },
      });
      noticeId = row.id;
    }

    const message = buildNoticeMessage({
      kind: input.kind,
      studentName: invoice.student.name,
      title: invoice.title,
      amount: invoice.amount,
      dueDate: dateKey(invoice.dueDate),
      overdue: isOverdue(invoice, todayKST()),
      coverageEnd: invoice.coverageEnd ? dateKey(invoice.coverageEnd) : null,
      refundAmount: input.refundAmount,
    });
    const { sent } = await notifyParentsOfStudent(
      invoice.studentId,
      {
        title: message.title,
        body: message.body,
        data: { url: PARENT_PUSH_ROUTES.tuition, kind: "tuition", invoiceId: invoice.id },
      },
      // 환불 안내는 퇴원한 뒤에도 가야 한다
      { includeInactive: input.kind === "REFUND" },
    );

    await prisma.tuitionNotice.update({ where: { id: noticeId }, data: { sentCount: sent } });
    await recordTuitionEvent(prisma, {
      type: "NOTICE_SENT",
      source: input.actor ? "STAFF" : "SYSTEM",
      invoiceId: invoice.id,
      actor: input.actor ?? null,
      detail: `${NOTICE_KIND_LABEL[input.kind]} 발송 — ${sent > 0 ? `기기 ${sent}대 도달` : "도달한 기기 없음 (앱 미설치·알림 꺼짐)"}`,
    });
    return { sent, skipped: false };
  } catch (error) {
    console.error("[tuition:notice]", error instanceof Error ? error.message : error);
    return { sent: 0, skipped: true };
  }
}

const NOTICE_CHUNK = 5;

/**
 * 여러 청구서에 안내 발송 (운영진 수동). 결제 요청 상태인 청구서에만 보낸다.
 * sent = 푸시가 도달한 기기 수 — 0 이면 앱 미설치·알림 꺼짐.
 */
export async function sendTuitionNotices(
  invoiceIds: string[],
  kind: "REQUEST" | "REMIND",
  actor: TuitionActor,
): Promise<{ invoiceId: string; studentName: string; sent: number }[]> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return [];
  const invoices = await prisma.tuitionInvoice.findMany({
    where: { id: { in: ids }, status: "REQUESTED" },
    select: { id: true, student: { select: { name: true } } },
  });

  const results: { invoiceId: string; studentName: string; sent: number }[] = [];
  for (let i = 0; i < invoices.length; i += NOTICE_CHUNK) {
    const chunk = invoices.slice(i, i + NOTICE_CHUNK);
    const settled = await Promise.all(
      chunk.map((invoice) => sendTuitionNotice({ invoiceId: invoice.id, kind, actor })),
    );
    chunk.forEach((invoice, index) => {
      results.push({ invoiceId: invoice.id, studentName: invoice.student.name, sent: settled[index].sent });
    });
  }
  return results;
}
