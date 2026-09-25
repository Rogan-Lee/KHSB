import crypto from "crypto";
import { z } from "zod";

import { getStudentAnalytics } from "@/actions/analytics";
import { getAppUrl } from "@/lib/app-url";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { checkExpiry, grantGatePass, hashToken } from "@/lib/token-auth";

// ─────────────────────────────────────────────────────────────────────
// 학부모 앱 — 리포트함(통합 목록) · 리포트 본문(앱 네이티브 화면)
//
// 규칙
//  · 앱 경로는 "발행됨 + 연결된 자녀의 리포트" 만 본다. 웹 공유 링크(토큰)·링크 만료와는 무관하다.
//  · ParentReport(멘토링): revokedAt 없음 (expiresAt 무시).
//  · MonthlyReport(월간): sentAt 있음 (shareToken 무관).
//  · OnlineParentReport(온라인 관리): status=SENT 만.
//  · StudyPlanReport(공부 계획) · ConsultationReport(상담, DirectorConsultation.studentId 로 연결): revokedAt 없음.
//  · 앱은 모든 리포트를 GET …/reports/[kind]/[id] 의 본문(JSON)으로 직접 그린다 (웹 링크·WebView 없음).
//
// (구버전 앱 호환) 핸드오프: POST …/open → AuthVerification(identifier=parent-handoff:<sha256(nonce)>, 60초) 저장 →
//           WebView 가 /api/parent-handoff?n=<nonce> 를 열면 1회 소비 + 재검증 후 게이트 쿠키(≤1h) 발급 → 리포트로 302.
//           새 앱은 쓰지 않는다. better-auth 세션 쿠키는 WebView 에 절대 넣지 않는다.
// ─────────────────────────────────────────────────────────────────────

export const PARENT_REPORT_KINDS = [
  "mentoring",
  "monthly",
  "online",
  "study-plan",
  "consultation",
] as const;
export type ParentReportKind = (typeof PARENT_REPORT_KINDS)[number];

const kindSchema = z.enum(PARENT_REPORT_KINDS);

export function parseReportKind(value: string | null | undefined): ParentReportKind {
  const parsed = kindSchema.safeParse(value);
  if (!parsed.success) throw new MobileApiError("알 수 없는 리포트 종류예요", 400);
  return parsed.data;
}

/** ?kind= 파라미터 — 없거나 all 이면 전체 */
export function parseReportKindFilter(value: string | null): ParentReportKind | "all" {
  if (!value || value === "all") return "all";
  return parseReportKind(value);
}

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PER_KIND_LIMIT = 60;
const HANDOFF_TTL_MS = 60 * 1000;
const GATE_PASS_MS = 60 * 60 * 1000;
const HANDOFF_PREFIX = "parent-handoff:";

const ONLINE_TYPE_LABEL: Record<string, string> = {
  WEEKLY: "주간 학습 보고서",
  MONTHLY: "월간 학습 보고서",
  ADHOC: "학습 보고서",
};

// ─── 날짜 (KST) ──────────────────────────────────────────────────────

function kstParts(date: Date) {
  const k = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}

/** @db.Date 컬럼(UTC 자정) → "M월 D일" */
function dateOnlyLabel(date: Date) {
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

function kstDayLabel(date: Date) {
  const p = kstParts(date);
  return `${p.m}월 ${p.d}일`;
}

// ─── 목록 ────────────────────────────────────────────────────────────

export type ParentReportItem = {
  /** 목록 키 — `${kind}:${id}` */
  key: string;
  id: string;
  kind: ParentReportKind;
  title: string;
  /** 보조 설명 (멘토 이름·기간 등). 날짜는 클라이언트가 date 로 붙인다 */
  subtitle: string | null;
  /** 발송(작성) 시각 ISO — 정렬·"새 리포트" 기준 */
  date: string;
  isNew: boolean;
  /** (구버전 앱 호환) false 면 웹 링크가 만료됨. 새 앱은 항상 네이티브 본문으로 연다 */
  webAvailable: boolean;
};

/** 구버전 앱(v1 응답) 호환 — 만료 전 멘토링 리포트만, 웹 URL 포함 */
type LegacyReportItem = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  hasNote: boolean;
  url: string;
};

export type ParentReportInbox = {
  studentId: string;
  /** @deprecated 구버전 앱 호환용. 새 앱은 reports 를 쓴다 */
  items: LegacyReportItem[];
  reports: ParentReportItem[];
  counts: Record<ParentReportKind, number> & { all: number };
  newCount: number;
};

export async function listParentReports(
  studentId: string,
  kind: ParentReportKind | "all",
): Promise<ParentReportInbox> {
  const now = new Date();
  const wants = (k: ParentReportKind) => kind === "all" || kind === k;
  const isNew = (d: Date) => now.getTime() - d.getTime() <= NEW_WINDOW_MS;

  const [mentoring, monthly, online, studyPlans, consultations] = await Promise.all([
    wants("mentoring")
      ? prisma.parentReport.findMany({
          where: { studentId, revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: PER_KIND_LIMIT,
          select: {
            id: true,
            token: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            customNote: true,
            mentoring: {
              select: {
                actualDate: true,
                scheduledAt: true,
                mentor: { select: { name: true } },
              },
            },
          },
        })
      : [],
    wants("monthly")
      ? prisma.monthlyReport.findMany({
          where: { studentId, sentAt: { not: null } },
          orderBy: { sentAt: "desc" },
          take: PER_KIND_LIMIT,
          select: { id: true, year: true, month: true, sentAt: true },
        })
      : [],
    wants("online")
      ? prisma.onlineParentReport.findMany({
          where: { studentId, status: "SENT" },
          orderBy: [{ sentAt: "desc" }, { periodStart: "desc" }],
          take: PER_KIND_LIMIT,
          select: {
            id: true,
            type: true,
            periodStart: true,
            periodEnd: true,
            sentAt: true,
            updatedAt: true,
          },
        })
      : [],
    wants("study-plan")
      ? prisma.studyPlanReport.findMany({
          where: { studentId, revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: PER_KIND_LIMIT,
          select: { id: true, createdAt: true, expiresAt: true, revokedAt: true, images: true },
        })
      : [],
    wants("consultation")
      ? prisma.consultationReport.findMany({
          where: { revokedAt: null, consultation: { studentId } },
          orderBy: { createdAt: "desc" },
          take: PER_KIND_LIMIT,
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            consultation: { select: { actualDate: true, scheduledAt: true } },
          },
        })
      : [],
  ]);

  const reports: ParentReportItem[] = [];

  for (const r of mentoring) {
    const anchor = r.mentoring ? (r.mentoring.actualDate ?? r.mentoring.scheduledAt) : r.createdAt;
    const mentor = r.mentoring?.mentor?.name;
    reports.push({
      key: `mentoring:${r.id}`,
      id: r.id,
      kind: "mentoring",
      title: `${kstDayLabel(anchor)} 멘토링 리포트`,
      subtitle: mentor ? `${mentor} 멘토` : null,
      date: r.createdAt.toISOString(),
      isNew: isNew(r.createdAt),
      webAvailable: checkExpiry({ expiresAt: r.expiresAt, revokedAt: r.revokedAt }, now) === null,
    });
  }

  for (const r of monthly) {
    const sentAt = r.sentAt!;
    reports.push({
      key: `monthly:${r.id}`,
      id: r.id,
      kind: "monthly",
      title: `${r.year}년 ${r.month}월 월간 리포트`,
      subtitle: "출결 · 공부 시간 · 멘토링 한 달 정리",
      date: sentAt.toISOString(),
      isNew: isNew(sentAt),
      webAvailable: true,
    });
  }

  for (const r of online) {
    const sentAt = r.sentAt ?? r.updatedAt;
    reports.push({
      key: `online:${r.id}`,
      id: r.id,
      kind: "online",
      title: ONLINE_TYPE_LABEL[r.type] ?? "학습 보고서",
      subtitle: `${dateOnlyLabel(r.periodStart)} ~ ${dateOnlyLabel(r.periodEnd)}`,
      date: sentAt.toISOString(),
      isNew: isNew(sentAt),
      webAvailable: true,
    });
  }

  for (const r of studyPlans) {
    reports.push({
      key: `study-plan:${r.id}`,
      id: r.id,
      kind: "study-plan",
      title: "공부 계획",
      subtitle: r.images.length > 0 ? `계획표 ${r.images.length}장` : null,
      date: r.createdAt.toISOString(),
      isNew: isNew(r.createdAt),
      webAvailable: checkExpiry({ expiresAt: r.expiresAt, revokedAt: r.revokedAt }, now) === null,
    });
  }

  for (const r of consultations) {
    const held = r.consultation.actualDate ?? r.consultation.scheduledAt;
    reports.push({
      key: `consultation:${r.id}`,
      id: r.id,
      kind: "consultation",
      title: "상담 안내",
      subtitle: held ? `${kstDayLabel(held)} 상담` : null,
      date: r.createdAt.toISOString(),
      isNew: isNew(r.createdAt),
      webAvailable: checkExpiry({ expiresAt: r.expiresAt, revokedAt: r.revokedAt }, now) === null,
    });
  }

  reports.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const counts = {
    all: reports.length,
    mentoring: 0,
    monthly: 0,
    online: 0,
    "study-plan": 0,
    consultation: 0,
  } as ParentReportInbox["counts"];
  for (const r of reports) counts[r.kind] += 1;

  const appUrl = getAppUrl();
  const items: LegacyReportItem[] = mentoring
    .filter((r) => !r.expiresAt || r.expiresAt.getTime() > now.getTime())
    .slice(0, 30)
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      hasNote: !!r.customNote,
      url: `${appUrl}/r/${r.token}`,
    }));

  return {
    studentId,
    items,
    reports,
    counts,
    newCount: reports.filter((r) => r.isNew).length,
  };
}

/** 탭바 배지용 — 최근 7일 안에 새로 나온 리포트 수 (자녀 합, 목록과 같은 규칙) */
export async function countNewParentReports(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0;
  const since = new Date(Date.now() - NEW_WINDOW_MS);
  const counts = await Promise.allSettled([
    prisma.parentReport.count({
      where: { studentId: { in: studentIds }, revokedAt: null, createdAt: { gte: since } },
    }),
    prisma.monthlyReport.count({
      where: { studentId: { in: studentIds }, sentAt: { gte: since } },
    }),
    prisma.onlineParentReport.count({
      where: {
        studentId: { in: studentIds },
        status: "SENT",
        OR: [{ sentAt: { gte: since } }, { sentAt: null, updatedAt: { gte: since } }],
      },
    }),
    prisma.studyPlanReport.count({
      where: { studentId: { in: studentIds }, revokedAt: null, createdAt: { gte: since } },
    }),
    prisma.consultationReport.count({
      where: {
        revokedAt: null,
        createdAt: { gte: since },
        consultation: { studentId: { in: studentIds } },
      },
    }),
  ]);
  return counts.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);
}

/** 자녀별 가장 최근 리포트 받은 시각 — 5종 모두, 리포트함과 같은 기준 (홈 '최근 리포트' 카드용) */
export async function latestParentReportDates(studentIds: string[]): Promise<Map<string, Date>> {
  const latest = new Map<string, Date>();
  if (studentIds.length === 0) return latest;
  const bump = (studentId: string, d: Date | null | undefined) => {
    if (!d) return;
    const prev = latest.get(studentId);
    if (!prev || d > prev) latest.set(studentId, d);
  };
  const where = { studentId: { in: studentIds } };
  const [mentoring, monthly, online, studyPlans, consultations] = await Promise.allSettled([
    prisma.parentReport.groupBy({ by: ["studentId"], where: { ...where, revokedAt: null }, _max: { createdAt: true } }),
    prisma.monthlyReport.groupBy({ by: ["studentId"], where: { ...where, sentAt: { not: null } }, _max: { sentAt: true } }),
    prisma.onlineParentReport.groupBy({
      by: ["studentId"],
      where: { ...where, status: "SENT" },
      _max: { sentAt: true, updatedAt: true },
    }),
    prisma.studyPlanReport.groupBy({ by: ["studentId"], where: { ...where, revokedAt: null }, _max: { createdAt: true } }),
    prisma.consultationReport.findMany({
      where: { revokedAt: null, consultation: { studentId: { in: studentIds } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, consultation: { select: { studentId: true } } },
    }),
  ]);
  if (mentoring.status === "fulfilled") for (const r of mentoring.value) bump(r.studentId, r._max.createdAt);
  if (monthly.status === "fulfilled") for (const r of monthly.value) bump(r.studentId, r._max.sentAt);
  if (online.status === "fulfilled")
    for (const r of online.value) bump(r.studentId, r._max.sentAt ?? r._max.updatedAt);
  if (studyPlans.status === "fulfilled") for (const r of studyPlans.value) bump(r.studentId, r._max.createdAt);
  if (consultations.status === "fulfilled")
    for (const r of consultations.value) if (r.consultation.studentId) bump(r.consultation.studentId, r.createdAt);
  return latest;
}

// ─── 개별 리포트 확인 (id 또는 웹 토큰) ─────────────────────────────

type ReportTarget = {
  kind: ParentReportKind;
  id: string;
  studentId: string;
  /** 웹 공유 토큰 — 월간 리포트는 공유 링크가 없으면 null (앱 열람에는 쓰지 않는다) */
  token: string | null;
  /** 웹 리포트 경로 (앱 도메인 기준, 토큰 없으면 null) */
  path: string | null;
  /** 웹 페이지가 열리지 않음 (토큰 만료·공유 링크 없음) — 구버전 앱 핸드오프만 쓴다 */
  webExpired: boolean;
};

type ReportLookup = { id: string } | { token: string };

function expired(snapshot: { expiresAt: Date | null; revokedAt: Date | null }) {
  return checkExpiry({ expiresAt: snapshot.expiresAt, revokedAt: null }) === "expired";
}

/** 학부모에게 보여도 되는(취소·미발송 아님) 리포트만 돌려준다. 없으면 null. 웹 토큰·만료는 보지 않는다 */
async function findReport(kind: ParentReportKind, by: ReportLookup): Promise<ReportTarget | null> {
  if (kind === "mentoring") {
    const r = await prisma.parentReport.findUnique({
      where: "id" in by ? { id: by.id } : { token: by.token },
      select: { id: true, token: true, studentId: true, expiresAt: true, revokedAt: true },
    });
    if (!r || r.revokedAt) return null;
    return {
      kind,
      id: r.id,
      studentId: r.studentId,
      token: r.token,
      path: `/r/${r.token}`,
      webExpired: expired(r),
    };
  }
  if (kind === "monthly") {
    const r = await prisma.monthlyReport.findUnique({
      where: "id" in by ? { id: by.id } : { shareToken: by.token },
      select: { id: true, studentId: true, shareToken: true, sentAt: true },
    });
    if (!r || !r.sentAt) return null;
    return {
      kind,
      id: r.id,
      studentId: r.studentId,
      token: r.shareToken,
      path: r.shareToken ? `/r/monthly/${r.shareToken}` : null,
      webExpired: !r.shareToken,
    };
  }
  if (kind === "online") {
    const r = await prisma.onlineParentReport.findUnique({
      where: "id" in by ? { id: by.id } : { token: by.token },
      select: { id: true, studentId: true, token: true, status: true },
    });
    if (!r || r.status !== "SENT") return null;
    return {
      kind,
      id: r.id,
      studentId: r.studentId,
      token: r.token,
      path: `/r/online/${r.token}`,
      webExpired: false,
    };
  }
  if (kind === "study-plan") {
    const r = await prisma.studyPlanReport.findUnique({
      where: "id" in by ? { id: by.id } : { token: by.token },
      select: { id: true, token: true, studentId: true, expiresAt: true, revokedAt: true },
    });
    if (!r || r.revokedAt) return null;
    return {
      kind,
      id: r.id,
      studentId: r.studentId,
      token: r.token,
      path: `/sp/${r.token}`,
      webExpired: expired(r),
    };
  }
  const r = await prisma.consultationReport.findUnique({
    where: "id" in by ? { id: by.id } : { token: by.token },
    select: {
      id: true,
      token: true,
      expiresAt: true,
      revokedAt: true,
      consultation: { select: { studentId: true } },
    },
  });
  if (!r || r.revokedAt || !r.consultation.studentId) return null;
  return {
    kind,
    id: r.id,
    studentId: r.consultation.studentId,
    token: r.token,
    path: `/cr/${r.token}`,
    webExpired: expired(r),
  };
}

type ParentScope = { authUserId: string; children: { id: string }[] };

/** 리포트가 이 학부모의 (활성) 자녀 것인지 확인. 아니면 존재 여부를 숨기고 404 */
async function requireOwnedReport(parent: ParentScope, kind: ParentReportKind, id: string) {
  const target = id ? await findReport(kind, { id }) : null;
  if (!target || !parent.children.some((c) => c.id === target.studentId)) {
    throw new MobileApiError("리포트를 찾을 수 없어요", 404);
  }
  return target;
}

// ─── 앱 안 열람: 1회용 핸드오프 ──────────────────────────────────────

const handoffPayloadSchema = z.object({
  authUserId: z.string().min(1),
  kind: kindSchema,
  token: z.string().min(1),
  studentId: z.string().min(1),
});

function handoffIdentifier(nonce: string) {
  // DB 에는 nonce 원문 대신 해시만 둔다 (행이 새어도 재사용 불가)
  return `${HANDOFF_PREFIX}${hashToken(nonce)}`;
}

export type ParentReportOpenResult =
  | { mode: "web"; url: string }
  | { mode: "native"; url: null };

export async function openParentReport(
  parent: ParentScope,
  kind: ParentReportKind,
  id: string,
): Promise<ParentReportOpenResult> {
  const target = await requireOwnedReport(parent, kind, id);

  // 웹 링크가 만료됐거나 없는 리포트 → 앱이 본문을 직접 그린다
  if (target.webExpired || !target.token || !target.path) return { mode: "native", url: null };

  const appUrl = getAppUrl();
  // 온라인 관리 보고서는 웹 페이지에 본인 확인 게이트가 없다 → 바로 연다
  if (target.kind === "online") return { mode: "web", url: `${appUrl}${target.path}` };

  const nonce = crypto.randomBytes(32).toString("base64url");
  await prisma.authVerification.create({
    data: {
      identifier: handoffIdentifier(nonce),
      value: JSON.stringify({
        authUserId: parent.authUserId,
        kind: target.kind,
        token: target.token,
        studentId: target.studentId,
      }),
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    },
  });

  // 지난 핸드오프 행 정리 (실패해도 무시)
  prisma.authVerification
    .deleteMany({
      where: { identifier: { startsWith: HANDOFF_PREFIX }, expiresAt: { lt: new Date() } },
    })
    .catch(() => {});

  return { mode: "web", url: `${appUrl}/api/parent-handoff?n=${nonce}` };
}

const NONCE_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/**
 * /api/parent-handoff 에서 호출. nonce 를 한 번만 소비하고, 링크·자녀 상태·리포트를 다시 확인한 뒤
 * 게이트 쿠키(≤1시간)를 심는다. 성공 시 리다이렉트할 경로, 실패 시 null.
 */
export async function redeemParentHandoff(nonce: string | null): Promise<string | null> {
  if (!nonce || !NONCE_PATTERN.test(nonce)) return null;

  const row = await prisma.authVerification.findFirst({
    where: { identifier: handoffIdentifier(nonce) },
    select: { id: true, value: true, expiresAt: true },
  });
  if (!row) return null;

  // 원자적 소비 — 같은 nonce 로 동시에 들어와도 삭제에 성공한 한 요청만 통과
  const consumed = await prisma.authVerification.deleteMany({ where: { id: row.id } });
  if (consumed.count !== 1) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  let payload: z.infer<typeof handoffPayloadSchema>;
  try {
    const parsed = handoffPayloadSchema.safeParse(JSON.parse(row.value));
    if (!parsed.success) return null;
    payload = parsed.data;
  } catch {
    return null;
  }

  // 발급 이후 연결 해제·퇴원·리포트 취소가 있었을 수 있다 → 다시 확인
  const link = await prisma.parentLink.findUnique({
    where: {
      authUserId_studentId: { authUserId: payload.authUserId, studentId: payload.studentId },
    },
    select: { student: { select: { status: true } } },
  });
  if (!link || link.student.status !== "ACTIVE") return null;

  const target = await findReport(payload.kind, { token: payload.token });
  if (!target || target.studentId !== payload.studentId || target.webExpired) return null;
  if (!target.token || !target.path) return null;

  if (target.kind !== "online") {
    await grantGatePass(
      "PARENT",
      target.token,
      target.studentId,
      new Date(Date.now() + GATE_PASS_MS),
    );
  }
  return target.path;
}

// ─── 리포트 본문 (앱 네이티브 화면) ─────────────────────────────────
// 웹 리포트 페이지(/r/[token] · /r/online/[token] · /sp/[token] · /cr/[token])와 같은 조회·공개 범위.
// 연결된 학부모에게는 웹 토큰 만료를 무시한다 (취소·미발송 리포트는 계속 숨김 — findReport).
// 학부모 비공개: 원생 기록·상벌점은 visibleInReport=true 만. 성적 메모·출결 메모·학생/멘토 내부 메모·
//               학생의 질문·채팅은 보내지 않는다. 웹 토큰도 응답에 싣지 않는다.
// 월간 리포트 본문은 src/lib/mobile-parent-monthly-report.ts (라우트가 직접 부른다).

/** 앱 열람 기록 (웹 페이지의 접근 로그와 같은 칸) */
export type ReportAccessMeta = { ip: string | null; ua: string | null };

export type ParentReportStudent = { name: string; grade: string | null; school: string | null };

// 웹 학부모 리포트(/r)와 같은 항목·순서. customNote 가 AI 고도화 형식("[오늘 멘토링 내용]…")이면 항목별로 나눈다.
const MENTORING_SECTIONS = [
  { key: "content", label: "오늘 멘토링 내용" },
  { key: "improvements", label: "개선된 점" },
  { key: "weaknesses", label: "보완할 점" },
  { key: "nextGoals", label: "다음 멘토링 목표" },
  { key: "notes", label: "기타 메모" },
] as const;
export type MentoringSectionKey = (typeof MENTORING_SECTIONS)[number]["key"];

/**
 * "[오늘 멘토링 내용]\n본문\n\n[개선된 점]\n본문…" 을 항목별로 나눈다 (웹 src/lib/mentoring-note.ts 와 같은 규칙).
 * 알려진 항목 제목이 하나도 없으면 null (일반 안내문). 첫 항목 앞의 글은 preamble.
 */
export function parseMentoringNote(text: string | null | undefined) {
  if (!text) return null;
  const byLabel = new Map<string, MentoringSectionKey>(MENTORING_SECTIONS.map((s) => [s.label, s.key]));
  const fields: Partial<Record<MentoringSectionKey, string>> = {};
  const preamble: string[] = [];
  let current: MentoringSectionKey | null = null;
  let buf: string[] = [];
  let found = false;
  const flush = () => {
    const body = buf.join("\n").trim();
    if (current) {
      if (body) fields[current] = fields[current] ? `${fields[current]}\n\n${body}` : body;
    } else if (body) {
      preamble.push(body);
    }
    buf = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = line.trim().match(/^\[(.+)\]$/);
    const key = m ? byLabel.get(m[1].trim()) : undefined;
    if (key) {
      flush();
      current = key;
      found = true;
    } else {
      buf.push(line);
    }
  }
  flush();
  return found ? { fields, preamble: preamble.join("\n\n") } : null;
}

function mentoringSections(fields: Partial<Record<MentoringSectionKey, string | null>>) {
  return MENTORING_SECTIONS.flatMap((s) => {
    const body = fields[s.key]?.trim();
    return body ? [{ key: s.key, title: s.label, body }] : [];
  });
}

/** @db.Date(UTC 자정) → "YYYY-MM-DD" */
function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** 시각 → KST 날짜 "YYYY-MM-DD" */
function kstDateKey(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// 과목 표시 순서 — 국·수·영·한국사·탐구·그 외(가나다). 성장 탭(mobile-parent-growth)과 같은 규칙
const SUBJECT_ORDER = ["국어", "수학", "영어", "한국사"];
function subjectRank(subject: string) {
  const i = SUBJECT_ORDER.findIndex((s) => subject.startsWith(s));
  return i === -1 ? SUBJECT_ORDER.length : i;
}
function compareSubject(a: string, b: string) {
  return subjectRank(a) - subjectRank(b) || a.localeCompare(b, "ko");
}
/** 평균 등급에서 빼는 과목 (절대평가·선택 과목) */
function countsTowardAverage(subject: string) {
  return !subject.includes("한국사") && !subject.includes("제2외국어");
}

const EXAM_TYPE_LABEL: Record<string, string> = {
  OFFICIAL_MOCK: "공식 모의고사",
  PRIVATE_MOCK: "사설 모의고사",
  SCHOOL_EXAM: "내신",
};
/** 웹 리포트 성적 추이와 같은 범위 (공식·사설 모의 + 내신, 최근 50개 점수) */
const TREND_EXAM_TYPES = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM"] as const;
const TREND_SCORE_LIMIT = 50;

export type ParentReportVocabPoint = {
  id: string;
  source: "paper" | "online";
  /** "YYYY-MM-DD" */
  date: string;
  score: number;
  correct: number;
  total: number;
};

export type ParentReportExamPoint = {
  key: string;
  /** "YYYY-MM-DD" */
  date: string;
  name: string;
  type: (typeof TREND_EXAM_TYPES)[number];
  typeLabel: string;
  /** 국·수·영·탐구 평균 등급 (한국사·제2외국어 제외) */
  averageGrade: number | null;
  grades: Record<string, number>;
};

export type ParentMentoringReportDetail = {
  kind: "mentoring";
  id: string;
  /** 리포트 작성 시각 ISO */
  createdAt: string;
  student: ParentReportStudent;
  session: {
    /** 멘토링 날짜(없으면 작성일) — KST "YYYY-MM-DD" */
    date: string;
    hasMentoring: boolean;
    completed: boolean;
    /** "14:05 ~ 15:10" */
    time: string | null;
    mentorName: string | null;
  };
  /** 멘토 안내사항 — 형식 없는 customNote 또는 AI 노트의 머리말 */
  message: string | null;
  /** 오늘 멘토링 내용 · 개선된 점 · 보완할 점 · 다음 멘토링 목표 · 기타 메모 (빈 항목 제외) */
  sections: { key: MentoringSectionKey; title: string; body: string }[];
  /** 영단어·원생 기록·상벌점을 모은 달 (멘토링이 있었던 달, KST) */
  period: { year: number; month: number };
  vocab: {
    count: number;
    average: number;
    latest: number;
    /** 오래된 → 최근 */
    points: ParentReportVocabPoint[];
  } | null;
  /** 원생 기록 (리포트 공개로 표시된 것만) */
  monthlyNote: string | null;
  /** 상벌점 (리포트 공개로 표시된 것만) */
  merits: {
    merit: { count: number; points: number };
    demerit: { count: number; points: number };
    items: {
      id: string;
      date: string;
      type: "MERIT" | "DEMERIT";
      points: number;
      reason: string;
      category: string | null;
    }[];
  } | null;
  studyPlan: { note: string | null; images: string[] } | null;
  scores: {
    /** 과목 평균 등급 변화 (양수 = 올랐어요) */
    avgImprovement: number | null;
    mentoringCount: number;
    studyHours: number;
    /** 오래된 → 최근 */
    exams: ParentReportExamPoint[];
    subjects: {
      subject: string;
      firstGrade: number | null;
      latestGrade: number | null;
      /** 양수 = 등급이 올랐어요(숫자가 작아짐) */
      improvement: number | null;
      firstExamName: string | null;
      latestExamName: string | null;
    }[];
  } | null;
};

export type ParentOnlineReportDetail = {
  kind: "online";
  id: string;
  type: string;
  /** 주간 · 월간 · 수시 */
  typeLabel: string;
  title: string;
  student: ParentReportStudent;
  /** "YYYY-MM-DD" */
  periodStart: string;
  periodEnd: string;
  sentAt: string | null;
  markdown: string;
  /** 원장님께 의견 남기기 (POST …/feedback) */
  feedbackEnabled: boolean;
};

export type ParentStudyPlanReportDetail = {
  kind: "study-plan";
  id: string;
  createdAt: string;
  student: ParentReportStudent;
  images: string[];
};

export type ParentConsultationReportDetail = {
  kind: "consultation";
  id: string;
  createdAt: string;
  student: ParentReportStudent;
  recipientName: string | null;
  /** 상담한 날 ISO (없으면 null) */
  consultedAt: string | null;
  content: string;
};

export type ParentReportDetail =
  | ParentMentoringReportDetail
  | ParentOnlineReportDetail
  | ParentStudyPlanReportDetail
  | ParentConsultationReportDetail;

type ReportAccessKind = Exclude<ParentReportKind, "monthly">;

/** 열람 기록 — 실패해도 화면은 그대로 (웹 페이지의 접근 로그·조회수와 같은 칸) */
function logReportAccess(kind: ReportAccessKind, id: string, meta: ReportAccessMeta | undefined) {
  const now = new Date();
  const access = {
    lastAccessedAt: now,
    lastAccessIp: meta?.ip ?? null,
    lastAccessUa: meta?.ua ?? null,
    accessCount: { increment: 1 },
  };
  void Promise.resolve()
    .then(() => {
      if (kind === "mentoring") return prisma.parentReport.updateMany({ where: { id }, data: access });
      if (kind === "study-plan") return prisma.studyPlanReport.updateMany({ where: { id }, data: access });
      if (kind === "consultation") return prisma.consultationReport.updateMany({ where: { id }, data: access });
      return prisma.onlineParentReport.updateMany({
        where: { id, status: "SENT" },
        data: { viewCount: { increment: 1 }, lastViewedAt: now },
      });
    })
    .catch(() => {});
}

export async function getParentReportDetail(
  parent: ParentScope,
  kind: ReportAccessKind,
  id: string,
  meta?: ReportAccessMeta,
): Promise<ParentReportDetail> {
  const target = await requireOwnedReport(parent, kind, id);
  const detail =
    kind === "mentoring"
      ? await mentoringDetail(target.id)
      : kind === "online"
        ? await onlineDetail(target.id)
        : kind === "study-plan"
          ? await studyPlanDetail(target.id)
          : await consultationDetail(target.id);
  logReportAccess(kind, target.id, meta);
  return detail;
}

// ─── 멘토링 리포트 ──────────────────────────────────────────────────

async function mentoringDetail(id: string): Promise<ParentMentoringReportDetail> {
  const r = await prisma.parentReport.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      customNote: true,
      studyPlanNote: true,
      studyPlanImages: true,
      student: { select: { id: true, name: true, grade: true, school: true } },
      mentoring: {
        select: {
          scheduledAt: true,
          actualDate: true,
          actualStartTime: true,
          actualEndTime: true,
          status: true,
          content: true,
          improvements: true,
          weaknesses: true,
          nextGoals: true,
          notes: true,
          mentor: { select: { name: true } },
        },
      },
    },
  });
  const studentId = r.student.id;
  const m = r.mentoring;
  const anchor = m ? (m.actualDate ?? m.scheduledAt) : r.createdAt;
  const day = kstDateKey(anchor);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  // @db.Date 칸은 UTC 자정 기준, 시각 칸은 KST 달 경계
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const KST = 9 * 60 * 60 * 1000;
  const monthStartAt = new Date(monthStart.getTime() - KST);
  const monthEndAt = new Date(monthEnd.getTime() - KST);

  const [monthlyNote, merits, paperVocab, onlineVocab, examScores, analytics] = await Promise.all([
    prisma.monthlyNote.findFirst({
      where: { studentId, year, month, visibleInReport: true },
      orderBy: { updatedAt: "desc" },
      select: { content: true },
    }),
    prisma.meritDemerit.findMany({
      where: { studentId, date: { gte: monthStart, lt: monthEnd }, visibleInReport: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, date: true, type: true, points: true, reason: true, category: true },
    }),
    prisma.vocabTestScore.findMany({
      where: { studentId, testDate: { gte: monthStart, lt: monthEnd } },
      orderBy: [{ testDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, testDate: true, totalWords: true, correctWords: true, score: true },
    }),
    prisma.vocabAttempt.findMany({
      where: {
        studentId,
        status: "SUBMITTED",
        score: { not: null },
        submittedAt: { gte: monthStartAt, lt: monthEndAt },
      },
      orderBy: { submittedAt: "asc" },
      select: { id: true, submittedAt: true, score: true, correctCount: true, totalQuestions: true },
    }),
    prisma.examScore.findMany({
      where: { studentId, examType: { in: [...TREND_EXAM_TYPES] } },
      orderBy: { examDate: "desc" },
      take: TREND_SCORE_LIMIT,
      select: { examType: true, examName: true, examDate: true, subject: true, grade: true },
    }),
    getStudentAnalytics(studentId),
  ]);

  // 멘토링 본문 — AI 노트면 항목별, 아니면 안내사항 + 원본 멘토링 기록
  const ai = parseMentoringNote(r.customNote);
  const aiHasContent = ai && (ai.preamble.trim() || Object.values(ai.fields).some((v) => v?.trim()));
  let message: string | null;
  let sections: ParentMentoringReportDetail["sections"];
  if (ai && aiHasContent) {
    message = ai.preamble.trim() || null;
    sections = mentoringSections(ai.fields);
  } else {
    message = r.customNote?.trim() || null;
    sections = m ? mentoringSections(m) : [];
  }

  const vocabPoints: ParentReportVocabPoint[] = [
    ...paperVocab.map((v) => ({
      id: `paper:${v.id}`,
      source: "paper" as const,
      date: dateKey(v.testDate),
      score: round1(v.score),
      correct: v.correctWords,
      total: v.totalWords,
    })),
    ...onlineVocab.map((v) => ({
      id: `online:${v.id}`,
      source: "online" as const,
      date: kstDateKey(v.submittedAt!),
      score: round1(v.score ?? 0),
      correct: v.correctCount,
      total: v.totalQuestions,
    })),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  const meritItems = merits.map((x) => ({
    id: x.id,
    date: dateKey(x.date),
    type: x.type as "MERIT" | "DEMERIT",
    points: x.points,
    reason: x.reason,
    category: x.category,
  }));
  const sum = (type: "MERIT" | "DEMERIT") => {
    const list = meritItems.filter((x) => x.type === type);
    return { count: list.length, points: list.reduce((s, x) => s + x.points, 0) };
  };

  const studyPlanNote = r.studyPlanNote?.trim() || null;
  const images = r.studyPlanImages.filter(Boolean);

  return {
    kind: "mentoring",
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    student: { name: r.student.name, grade: r.student.grade || null, school: r.student.school },
    session: {
      date: day,
      hasMentoring: !!m,
      completed: m?.status === "COMPLETED",
      time: m?.actualStartTime && m.actualEndTime ? `${m.actualStartTime} ~ ${m.actualEndTime}` : null,
      mentorName: m?.mentor?.name ?? null,
    },
    message,
    sections,
    period: { year, month },
    vocab: vocabPoints.length
      ? {
          count: vocabPoints.length,
          average: round1(vocabPoints.reduce((s, v) => s + v.score, 0) / vocabPoints.length),
          latest: vocabPoints[vocabPoints.length - 1].score,
          points: vocabPoints,
        }
      : null,
    monthlyNote: monthlyNote?.content.trim() || null,
    merits: meritItems.length ? { merit: sum("MERIT"), demerit: sum("DEMERIT"), items: meritItems } : null,
    studyPlan: studyPlanNote || images.length ? { note: studyPlanNote, images } : null,
    scores:
      analytics && analytics.subjects.length > 0
        ? {
            avgImprovement: analytics.avgImprovement,
            mentoringCount: analytics.mentoringCount,
            studyHours: analytics.studyHours,
            exams: examTrend(examScores),
            subjects: [...analytics.subjects]
              .sort((a, b) => compareSubject(a.subject, b.subject))
              .map((s) => ({
                subject: s.subject,
                firstGrade: s.firstGrade,
                latestGrade: s.latestGrade,
                improvement: s.improvement,
                firstExamName: s.firstExamName,
                latestExamName: s.latestExamName,
              })),
          }
        : null,
  };
}

/** 최근 점수(최신순) → 시험별 묶음 (오래된 → 최근) */
function examTrend(
  scores: { examType: string; examName: string; examDate: Date; subject: string; grade: number | null }[],
): ParentReportExamPoint[] {
  const map = new Map<string, ParentReportExamPoint>();
  for (const s of scores) {
    if (s.grade == null) continue;
    const date = dateKey(s.examDate);
    const key = `${s.examType}|${date}|${s.examName}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        date,
        name: s.examName,
        type: s.examType as ParentReportExamPoint["type"],
        typeLabel: EXAM_TYPE_LABEL[s.examType] ?? "시험",
        averageGrade: null,
        grades: {},
      };
      map.set(key, g);
    }
    g.grades[s.subject] = s.grade;
  }
  const exams = [...map.values()];
  for (const g of exams) {
    const graded = Object.entries(g.grades).filter(([subject]) => countsTowardAverage(subject));
    g.averageGrade = graded.length ? round1(graded.reduce((sum, [, v]) => sum + v, 0) / graded.length) : null;
  }
  return exams.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, "ko") : a.date < b.date ? -1 : 1));
}

// ─── 온라인 관리 보고서 ─────────────────────────────────────────────

const ONLINE_TYPE_SHORT: Record<string, string> = { WEEKLY: "주간", MONTHLY: "월간" };

async function onlineDetail(id: string): Promise<ParentOnlineReportDetail> {
  const r = await prisma.onlineParentReport.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      type: true,
      periodStart: true,
      periodEnd: true,
      sentAt: true,
      content: true,
      student: { select: { name: true, grade: true, school: true } },
    },
  });
  const content = (r.content ?? {}) as { markdown?: unknown };
  return {
    kind: "online",
    id: r.id,
    type: r.type,
    typeLabel: ONLINE_TYPE_SHORT[r.type] ?? "수시",
    title: ONLINE_TYPE_LABEL[r.type] ?? "학습 보고서",
    student: { name: r.student.name, grade: r.student.grade || null, school: r.student.school },
    periodStart: dateKey(r.periodStart),
    periodEnd: dateKey(r.periodEnd),
    sentAt: r.sentAt?.toISOString() ?? null,
    markdown: typeof content.markdown === "string" ? content.markdown : "",
    feedbackEnabled: true,
  };
}

// ─── 공부 계획 ──────────────────────────────────────────────────────

async function studyPlanDetail(id: string): Promise<ParentStudyPlanReportDetail> {
  const r = await prisma.studyPlanReport.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      images: true,
      student: { select: { name: true, grade: true, school: true } },
    },
  });
  return {
    kind: "study-plan",
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    student: { name: r.student.name, grade: r.student.grade || null, school: r.student.school },
    images: r.images.filter(Boolean),
  };
}

// ─── 상담 안내 ──────────────────────────────────────────────────────

async function consultationDetail(id: string): Promise<ParentConsultationReportDetail> {
  const r = await prisma.consultationReport.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      content: true,
      recipientName: true,
      consultation: {
        select: {
          actualDate: true,
          scheduledAt: true,
          student: { select: { name: true, grade: true, school: true } },
        },
      },
    },
  });
  const student = r.consultation.student;
  const held = r.consultation.actualDate ?? r.consultation.scheduledAt;
  return {
    kind: "consultation",
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    student: {
      name: student?.name ?? "",
      grade: student?.grade || null,
      school: student?.school ?? null,
    },
    recipientName: r.recipientName?.trim() || null,
    consultedAt: held?.toISOString() ?? null,
    content: r.content.trim(),
  };
}
