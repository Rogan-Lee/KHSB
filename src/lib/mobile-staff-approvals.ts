// 모바일 직원 승인함 — 쪽잠 · 네트워크 · 포인트 교환 · 모의고사 신청.
// 결정 로직은 src/lib/request-decisions.ts (웹 서버 액션과 공용). 여기서는 목록 조회·입력 검증·
// 이미 처리된 신청 방지·학생 푸시 문구만 담당한다. revalidatePath 는 라우트에서.

import { z } from "zod";

import type { Prisma } from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import { sendMobilePush } from "@/lib/mobile-push";
import { NETWORK_KIND_LABELS } from "@/lib/network-requests";
import { calcPointBalance } from "@/lib/points";
import { prisma } from "@/lib/prisma";
import {
  decideNapRequest,
  decideNetworkRequest,
  decideRewardRedemption,
  updateExamApplicationStatus,
  type Decider,
} from "@/lib/request-decisions";
import { todayKST } from "@/lib/utils";

export const APPROVAL_KINDS = ["nap", "network", "redemption", "exam-application"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

const HISTORY_DAYS = 14;
const HISTORY_LIMIT = 50;

const studentSelect = {
  select: { id: true, name: true, grade: true, seat: true },
} satisfies Prisma.StudentDefaultArgs;

type StudentRef = { id: string; name: string; grade: string; seat: string | null };

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ─── 목록 ──────────────────────────────────────────────────────────────

async function pendingCounts() {
  const today = todayKST();
  const [nap, network, redemption, examApplication, fulfill] = await Promise.all([
    prisma.napRequest.count({ where: { status: "PENDING", date: { gte: today } } }),
    prisma.networkRequest.count({ where: { status: "PENDING" } }),
    prisma.rewardRedemption.count({ where: { status: "PENDING" } }),
    prisma.examApplication.count({
      where: {
        status: "PENDING",
        student: { status: "ACTIVE" },
        session: { examDate: { gte: today } },
      },
    }),
    prisma.rewardRedemption.count({ where: { status: "APPROVED" } }),
  ]);
  return {
    nap,
    network,
    redemption,
    examApplication,
    /** 승인됐지만 아직 지급 전인 포인트 교환 */
    fulfill,
    total: nap + network + redemption + examApplication,
  };
}

/** 학생별 포인트 잔액 (대기중 교환은 차감 전 — 승인 가능 여부 판단용) */
async function balancesFor(studentIds: string[]) {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return new Map<string, number>();
  const [merits, redemptions] = await Promise.all([
    prisma.meritDemerit.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, type: true, points: true },
    }),
    prisma.rewardRedemption.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, status: true, points: true },
    }),
  ]);
  return new Map(
    ids.map((id) => [
      id,
      calcPointBalance({
        merits: merits.filter((m) => m.studentId === id),
        redemptions: redemptions.filter((r) => r.studentId === id),
      }).balance,
    ]),
  );
}

export async function getMobileStaffApprovals(options: { history: boolean }) {
  const today = todayKST();
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const history = options.history;

  const [summary, naps, networks, redemptions, exams] = await Promise.all([
    pendingCounts(),
    prisma.napRequest.findMany({
      where: history
        ? { status: { in: ["APPROVED", "REJECTED"] }, decidedAt: { gte: since } }
        : { status: "PENDING", date: { gte: today } },
      orderBy: history ? { decidedAt: "desc" } : [{ date: "asc" }, { startTime: "asc" }],
      take: history ? HISTORY_LIMIT : 200,
      include: { student: studentSelect },
    }),
    prisma.networkRequest.findMany({
      where: history
        ? { status: { in: ["APPROVED", "REJECTED"] }, decidedAt: { gte: since } }
        : { status: "PENDING" },
      orderBy: history ? { decidedAt: "desc" } : { startAt: "asc" },
      take: history ? HISTORY_LIMIT : 200,
      include: { student: studentSelect },
    }),
    prisma.rewardRedemption.findMany({
      where: history
        ? { status: { in: ["APPROVED", "REJECTED", "FULFILLED"] }, decidedAt: { gte: since } }
        : { status: { in: ["PENDING", "APPROVED"] } },
      orderBy: history ? { decidedAt: "desc" } : { createdAt: "asc" },
      take: history ? HISTORY_LIMIT : 200,
      include: { student: studentSelect },
    }),
    prisma.examApplication.findMany({
      where: history
        ? { status: { in: ["CONFIRMED", "CANCELLED"] }, updatedAt: { gte: since } }
        : {
            status: "PENDING",
            student: { status: "ACTIVE" },
            session: { examDate: { gte: today } },
          },
      orderBy: history ? { updatedAt: "desc" } : [{ session: { examDate: "asc" } }, { appliedAt: "asc" }],
      take: history ? HISTORY_LIMIT : 200,
      include: {
        student: studentSelect,
        session: { select: { id: true, title: true, examDate: true, room: true, subjects: true } },
      },
    }),
  ]);

  const balances = history
    ? new Map<string, number>()
    : await balancesFor(redemptions.filter((r) => r.status === "PENDING").map((r) => r.studentId));

  const confirmerIds = [...new Set(exams.map((e) => e.confirmedById).filter((v): v is string => !!v))];
  const confirmers = confirmerIds.length
    ? await prisma.user.findMany({ where: { id: { in: confirmerIds } }, select: { id: true, name: true } })
    : [];
  const confirmerName = new Map(confirmers.map((u) => [u.id, u.name]));

  const now = Date.now();
  const student = (s: StudentRef) => ({ id: s.id, name: s.name, grade: s.grade, seat: s.seat });

  const items = [
    ...naps.map((n) => ({
      kind: "nap" as const,
      id: n.id,
      status: n.status,
      student: student(n.student),
      requestedAt: n.createdAt.toISOString(),
      decidedAt: iso(n.decidedAt),
      decidedByName: n.decidedByName,
      date: dateKey(n.date),
      startTime: n.startTime,
      durationMin: n.durationMin,
      note: n.note,
    })),
    ...networks.map((r) => ({
      kind: "network" as const,
      id: r.id,
      status: r.status,
      student: student(r.student),
      requestedAt: r.createdAt.toISOString(),
      decidedAt: iso(r.decidedAt),
      decidedByName: r.decidedByName,
      networkKind: r.kind,
      networkKindLabel: NETWORK_KIND_LABELS[r.kind],
      target: r.target,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      reason: r.reason,
      appliedAt: iso(r.appliedAt),
      /** 사용 종료 시각이 이미 지난 대기 신청 */
      expired: r.status === "PENDING" && r.endAt.getTime() < now,
    })),
    ...redemptions.map((r) => ({
      kind: "redemption" as const,
      id: r.id,
      status: r.status,
      student: student(r.student),
      requestedAt: r.createdAt.toISOString(),
      decidedAt: iso(r.decidedAt),
      decidedByName: r.decidedByName,
      itemName: r.itemName,
      points: r.points,
      note: r.note,
      /** 대기중 신청만 — 이 신청 차감 전 잔액 */
      balance: r.status === "PENDING" ? (balances.get(r.studentId) ?? null) : null,
    })),
    ...exams.map((a) => ({
      kind: "exam-application" as const,
      id: a.id,
      status: a.status,
      student: student(a.student),
      requestedAt: a.appliedAt.toISOString(),
      decidedAt: a.status === "PENDING" ? null : (a.confirmedAt ?? a.updatedAt).toISOString(),
      decidedByName: a.confirmedById ? (confirmerName.get(a.confirmedById) ?? null) : null,
      sessionId: a.session.id,
      sessionTitle: a.session.title,
      examDate: dateKey(a.session.examDate),
      room: a.session.room,
      subjects: a.session.subjects,
      memo: a.memo,
    })),
  ];

  return { mode: history ? ("history" as const) : ("pending" as const), summary, items };
}

// ─── 처리 ──────────────────────────────────────────────────────────────

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "FULFILL"], { message: "처리 방법을 확인하세요" }),
  note: z
    .string()
    .trim()
    .max(200, "사유는 200자 이하로 입력해 주세요")
    .optional()
    .nullable(),
});

export type ApprovalPush = {
  studentId: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

const withReason = (text: string, note: string | null | undefined) =>
  note ? `${text} 사유: ${note}` : text;

function assertKind(kind: string): ApprovalKind {
  if ((APPROVAL_KINDS as readonly string[]).includes(kind)) return kind as ApprovalKind;
  throw new MobileApiError("알 수 없는 신청 유형이에요", 404);
}

const ALREADY_DECIDED = "이미 처리된 신청이에요. 목록을 새로고침해 주세요";

/**
 * 신청 처리. 반환: 응답 본문(result) + 학생 푸시(push — 라우트가 after() 로 발송) + 갱신할 웹 경로.
 * 쪽잠·포인트 교환은 사유를 저장하고, 네트워크·모의고사는 저장 칸이 없어 푸시 문구에만 담는다.
 */
export async function decideMobileStaffApproval(
  decider: Decider,
  rawKind: string,
  id: string,
  input: unknown,
) {
  const kind = assertKind(rawKind);
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
  }
  const { decision } = parsed.data;
  const note = parsed.data.note?.trim() || null;
  if (decision === "FULFILL" && kind !== "redemption") {
    throw new MobileApiError("지급 처리는 포인트 교환만 할 수 있어요", 400);
  }
  const approve = decision === "APPROVE";
  const data = { kind, id, type: "approval" };

  if (kind === "nap") {
    const current = await prisma.napRequest.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new MobileApiError("신청을 찾을 수 없습니다", 404);
    if (current.status !== "PENDING") throw new MobileApiError(ALREADY_DECIDED, 409);
    const nap = await decideNapRequest(id, approve ? "approve" : "reject", decider, note);
    return {
      result: { ok: true, kind, id, status: nap.status },
      paths: ["/approvals"],
      push: {
        studentId: nap.studentId,
        title: approve ? "쪽잠 신청 승인" : "쪽잠 신청 거절",
        body: approve
          ? `${nap.startTime}부터 ${nap.durationMin}분 쪽잠이 승인됐어요.`
          : withReason(`${nap.startTime} 쪽잠 신청이 거절됐어요.`, note),
        data,
      } satisfies ApprovalPush,
    };
  }

  if (kind === "network") {
    const current = await prisma.networkRequest.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new MobileApiError("신청을 찾을 수 없습니다", 404);
    if (current.status !== "PENDING") throw new MobileApiError(ALREADY_DECIDED, 409);
    const req = await decideNetworkRequest(id, approve ? "approve" : "reject", decider);
    const label = `${NETWORK_KIND_LABELS[req.kind]}${req.target ? ` · ${req.target}` : ""}`;
    return {
      result: { ok: true, kind, id, status: req.status },
      paths: ["/approvals"],
      push: {
        studentId: req.studentId,
        title: approve ? "네트워크 사용 승인" : "네트워크 사용 거절",
        body: approve
          ? `${label} 신청이 승인됐어요.`
          : withReason(`${label} 신청이 거절됐어요.`, note),
        data,
      } satisfies ApprovalPush,
    };
  }

  if (kind === "redemption") {
    const action = decision === "FULFILL" ? "fulfill" : approve ? "approve" : "reject";
    // 상태 검증(대기중/승인됨)·잔액 재검증은 공용 로직에서
    const r = await decideRewardRedemption(id, action, decider, action === "reject" ? note : null);
    return {
      result: { ok: true, kind, id, status: r.status },
      paths: ["/merit-demerit"],
      push: {
        studentId: r.studentId,
        title:
          action === "fulfill"
            ? "기프티콘 지급 완료"
            : approve
              ? "포인트 교환 승인"
              : "포인트 교환 거절",
        body:
          action === "fulfill"
            ? `‘${r.itemName}’ 지급이 완료됐어요.`
            : approve
              ? `‘${r.itemName}’ 교환이 승인됐어요. 곧 지급해 드릴게요.`
              : withReason(`‘${r.itemName}’ 교환이 거절됐어요.`, note),
        data,
      } satisfies ApprovalPush,
    };
  }

  // exam-application
  const current = await prisma.examApplication.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw new MobileApiError("신청을 찾을 수 없습니다", 404);
  if (current.status !== "PENDING") throw new MobileApiError(ALREADY_DECIDED, 409);
  const app = await updateExamApplicationStatus(id, approve ? "CONFIRMED" : "CANCELLED", decider.id);
  return {
    result: { ok: true, kind, id, status: app.status },
    paths: ["/exams", `/exams/${app.sessionId}`],
    push: {
      studentId: app.studentId,
      title: approve ? "모의고사 신청 확정" : "모의고사 신청 반려",
      body: approve
        ? `‘${app.session.title}’ 신청이 확정됐어요.`
        : withReason(`‘${app.session.title}’ 신청이 반려됐어요.`, note),
      data,
    } satisfies ApprovalPush,
  };
}

/** 처리 결과를 학생 앱에 푸시 — 실패해도 처리 결과에는 영향 없음 */
export async function sendApprovalPush(push: ApprovalPush) {
  try {
    const authUser = await prisma.authUser.findUnique({
      where: { studentId: push.studentId },
      select: { id: true },
    });
    if (!authUser) return;
    await sendMobilePush({
      authUserIds: [authUser.id],
      body: push.body,
      category: "SYSTEM",
      data: push.data,
      title: push.title,
    });
  } catch (error) {
    console.error("[approval push]", error);
  }
}
