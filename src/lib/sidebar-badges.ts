import { staffUnreadFamilyChatStats } from "@/lib/family-chat";
import { prisma } from "@/lib/prisma";
import { isFullAccess, isStaff } from "@/lib/roles";
import { pendingParentRequestStats } from "@/lib/student-instructions";
import { todayKST } from "@/lib/utils";

/** 메뉴별 처리 대기 수 + 그중 가장 최근에 들어온 시각 (웹 새 건 알림창이 이 시각으로 판단) */
type Stat = { count: number; newest: Date | null };

function latest(dates: (Date | null | undefined)[]): Date | null {
  return dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);
}

function sumStats(...stats: Stat[]): Stat {
  return { count: stats.reduce((n, s) => n + s.count, 0), newest: latest(stats.map((s) => s.newest)) };
}

const NONE: Stat = { count: 0, newest: null };

// "봤음" 칸이 없는 건은 스키마를 바꾸지 않고 AppSetting 에 본 시각을 둔다.
// 이 배지들을 켠 날 — 화면을 한 번도 안 연 직원에게 지난 건 전부를 새 건으로 띄우지 않는다
const BADGE_SINCE = new Date("2026-11-17T00:00:00+09:00");

// 입회 대기 신청·문의, 차단 — 직원마다 그 화면을 마지막으로 연 시각
type SeenArea = "waitlist" | "moderation";
const seenKey = (area: SeenArea, userId: string) => `${area}.seenAt:${userId}`;

/** 대기자 관리·신고 관리 화면을 열면 호출 — 그때까지 들어온 건은 이 직원에게 더 이상 새 건이 아니다 */
export async function markSeen(area: SeenArea, userId: string) {
  const key = seenKey(area, userId);
  const value = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function seenSince(area: SeenArea, userId: string) {
  const seen = await prisma.appSetting.findUnique({ where: { key: seenKey(area, userId) }, select: { value: true } });
  return seen ? new Date(seen.value) : BADGE_SINCE;
}

async function newWaitlistStats(userId: string): Promise<Stat> {
  const since = await seenSince("waitlist", userId);
  // 공개 폼으로 들어온 건만 WAITING 으로 시작한다 (직원 일괄 등록은 ENROLLED)
  const agg = await prisma.waitlist.aggregate({
    where: { status: "WAITING", createdAt: { gt: since } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return { count: agg._count._all, newest: agg._max.createdAt };
}

// 초기 설문 — 학생마다 한 번만 내므로 누구든 그 학생 설문 화면을 열면 본 것으로 (직원 전체 공동)
const SURVEY_SEEN_PREFIX = "survey.seenAt:";

export async function markSurveySeen(studentId: string) {
  const key = SURVEY_SEEN_PREFIX + studentId;
  const value = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function unseenSurveyStats(): Promise<Stat> {
  const [surveys, seen] = await Promise.all([
    prisma.onboardingSurvey.findMany({
      where: { submittedAt: { gt: BADGE_SINCE }, student: { status: "ACTIVE" } },
      select: { studentId: true, submittedAt: true },
    }),
    prisma.appSetting.findMany({ where: { key: { startsWith: SURVEY_SEEN_PREFIX } }, select: { key: true } }),
  ]);
  const seenIds = new Set(seen.map((s) => s.key.slice(SURVEY_SEEN_PREFIX.length)));
  const unseen = surveys.filter((s) => !seenIds.has(s.studentId));
  return { count: unseen.length, newest: latest(unseen.map((s) => s.submittedAt)) };
}

/**
 * 사이드바 미확인 배지 전체 집계 — (dashboard)·/online 레이아웃과
 * /api/sidebar-badges 폴링, 운영진 앱 배지(mobile-badges.ts)가 공유하는 단일 소스.
 * 메뉴 href → 처리 대기 수. 웹 새 건 알림창용으로 "newest:<href>" → 가장 최근 건 시각(ms)도 같이 담는다
 * (숫자 차이만 보면 같은 사이에 한 건 처리·한 건 도착이 상쇄돼 알림이 빠진다). 다른 읽는 쪽은 href 키만 본다.
 * 항목별 실패는 해당 배지만 생략 (레이아웃 렌더 차단 금지).
 */
export async function getSidebarBadges(
  userId: string,
  role?: string | null,
): Promise<Record<string, number>> {
  const staff = isStaff(role);
  const full = isFullAccess(role);
  const now = new Date();
  const today = todayKST();
  const agg = async (
    run: Promise<{ _count: { _all: number }; _max: Record<string, Date | null> }>,
  ): Promise<Stat> => {
    const r = await run;
    return { count: r._count._all, newest: latest(Object.values(r._max)) };
  };

  const entries: [string, Promise<Stat>][] = [
    // 내가 아직 안 본 열린 기능 요청 (직원 내부 — 알림창 없음)
    [
      "/requests",
      prisma.featureRequest
        .count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] }, NOT: { seenById: { has: userId } } } })
        .then((count) => ({ count, newest: null })),
    ],
    // 접수(RECEIVED) 상태 건의. 삭제·숨김·퇴원생 제외
    [
      "/suggestions",
      agg(
        prisma.studentSuggestion.aggregate({
          where: { status: "RECEIVED", deletedAt: null, hiddenAt: null, student: { status: "ACTIVE" } },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
      ),
    ],
    // 직원 미확인 질문 (새 질문 + 학생 추가 메시지 — 추가 메시지도 lastMessageAt 이 바뀐다)
    [
      "/questions",
      agg(
        prisma.studentQuestion.aggregate({
          where: { staffReadAt: null, status: { not: "ARCHIVED" }, student: { status: "ACTIVE" } },
          _count: { _all: true },
          _max: { lastMessageAt: true },
        }),
      ),
    ],
    // 내 채팅방 중 학생 메시지 미확인 방
    [
      "/online/inbox",
      prisma.portalChat
        .findMany({
          where: { staffId: userId, lastMessageAt: { not: null }, student: { status: "ACTIVE" } },
          select: { lastMessageAt: true, staffReadAt: true },
        })
        .then((rows) => {
          const unread = rows.filter((c) => c.lastMessageAt && (!c.staffReadAt || c.lastMessageAt > c.staffReadAt));
          return { count: unread.length, newest: latest(unread.map((c) => c.lastMessageAt)) };
        }),
    ],
    // 운영진이 할 일: 학생 제출(SUBMITTED)·학부모 수정 요청(REJECTED). 학생별 최신 버전 기준 (구버전 잔존분 제외 — 목록과 동일)
    [
      "/online/schedules",
      prisma.scheduleProposal
        .findMany({
          where: { status: { in: ["SUBMITTED", "PROPOSED", "APPROVED", "REJECTED"] } },
          select: { studentId: true, version: true, status: true, updatedAt: true },
        })
        .then((rows) => {
          const byStudent = new Map<string, (typeof rows)[number]>();
          for (const p of rows) {
            const cur = byStudent.get(p.studentId);
            if (!cur || p.version > cur.version) byStudent.set(p.studentId, p);
          }
          const todo = [...byStudent.values()].filter((p) => p.status === "SUBMITTED" || p.status === "REJECTED");
          return { count: todo.length, newest: latest(todo.map((p) => p.updatedAt)) };
        }),
    ],
    // 확정 대기 모의고사 신청 (지난 시험 제외). 재신청은 행을 고쳐 쓰므로 updatedAt
    [
      "/exams",
      agg(
        prisma.examApplication.aggregate({
          where: { status: "PENDING", student: { status: "ACTIVE" }, session: { examDate: { gte: today } } },
          _count: { _all: true },
          _max: { updatedAt: true },
        }),
      ),
    ],
    // 미답변 학부모 변경 요청 + 학부모가 "입금했어요" 했는데 아직 확인 전인 주문
    [
      "/lunch",
      Promise.all([
        agg(
          prisma.lunchChangeRequest.aggregate({
            where: { reply: null, student: { status: "ACTIVE" } },
            _count: { _all: true },
            _max: { createdAt: true },
          }),
        ),
        agg(
          prisma.lunchOrder.aggregate({
            where: { paidStatus: "PENDING", depositClaimedAt: { not: null }, student: { status: "ACTIVE" } },
            _count: { _all: true },
            _max: { depositClaimedAt: true },
          }),
        ),
      ]).then((s) => sumStats(...s)),
    ],
    // 학부모 리포트 피드백 미확인 (원장만)
    [
      "/online/reports",
      full
        ? agg(
            prisma.onlineParentFeedback.aggregate({
              where: { readAt: null },
              _count: { _all: true },
              _max: { createdAt: true },
            }),
          )
        : Promise.resolve(NONE),
    ],
    // 직원 DM 중 내가 안 읽은 메시지 (직원 내부 — 알림창 없음)
    [
      "/staff-messages",
      prisma.staffThreadMessage
        .count({
          where: {
            readAt: null,
            senderId: { not: userId },
            thread: { OR: [{ aUserId: userId }, { bUserId: userId }] },
          },
        })
        .then((count) => ({ count, newest: null })),
    ],
    // 처리 대기 신고 + 이 직원이 신고 관리를 마지막으로 연 뒤 생긴 차단 (원장만)
    [
      "/moderation",
      full
        ? Promise.all([
            agg(prisma.contentReport.aggregate({ where: { status: "OPEN" }, _count: { _all: true }, _max: { createdAt: true } })),
            seenSince("moderation", userId).then((since) =>
              agg(
                prisma.userBlock.aggregate({
                  where: { createdAt: { gt: since } },
                  _count: { _all: true },
                  _max: { createdAt: true },
                }),
              ),
            ),
          ]).then((s) => sumStats(...s))
        : Promise.resolve(NONE),
    ],
    // 직원 확인을 기다리는 현장 결제 신청 (자습실 직원 전체)
    [
      "/tuition",
      staff
        ? agg(
            prisma.tuitionPayment.aggregate({
              where: { status: "ONSITE_REQUESTED" },
              _count: { _all: true },
              _max: { requestedAt: true, createdAt: true },
            }),
          )
        : Promise.resolve(NONE),
    ],
    // 학생·학부모 글을 운영진 아무도 아직 안 본 방 (직원 전체 공동 읽음)
    ["/family-chat", staffUnreadFamilyChatStats()],
    // 아직 처리 안 한 학부모 요청 (직원 전체 공동)
    ["/instructions", pendingParentRequestStats()],
    // 승인 대기 쪽잠(오늘 이후)·네트워크 사용 신청(사용 시간이 안 지난 것) — 운영진 앱 신청함과 같은 기준
    [
      "/approvals",
      staff
        ? Promise.all([
            agg(
              prisma.napRequest.aggregate({
                where: { status: "PENDING", date: { gte: today } },
                _count: { _all: true },
                _max: { createdAt: true },
              }),
            ),
            agg(
              prisma.networkRequest.aggregate({
                where: { status: "PENDING", endAt: { gt: now } },
                _count: { _all: true },
                _max: { createdAt: true },
              }),
            ),
          ]).then((s) => sumStats(...s))
        : Promise.resolve(NONE),
    ],
    // 승인 대기 포인트 상점 교환 신청
    [
      "/merit-demerit",
      staff
        ? agg(prisma.rewardRedemption.aggregate({ where: { status: "PENDING" }, _count: { _all: true }, _max: { createdAt: true } }))
        : Promise.resolve(NONE),
    ],
    // 이 직원이 대기자 화면을 마지막으로 연 뒤 들어온 입회 대기 신청·문의
    ["/waitlist", staff ? newWaitlistStats(userId) : Promise.resolve(NONE)],
    // 학생이 내고 아직 검토(승인·수정 요청) 전인 수행평가. 다시 내도 과제 상태는 그대로라 제출 행의 시각
    [
      "/online/performance",
      Promise.all([
        prisma.performanceTask.count({ where: { status: "SUBMITTED", student: { status: "ACTIVE" } } }),
        prisma.taskSubmission.aggregate({
          where: { task: { status: "SUBMITTED", student: { status: "ACTIVE" } } },
          _max: { submittedAt: true },
        }),
      ]).then(([count, sub]) => ({ count, newest: sub._max.submittedAt })),
    ],
    // 제출됐는데 아직 아무도 설문 화면을 안 연 초기 설문
    ["/students", unseenSurveyStats()],
  ];

  const settled = await Promise.allSettled(entries.map(([, p]) => p));
  const badges: Record<string, number> = {};
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled" || r.value.count <= 0) return;
    const href = entries[i][0];
    badges[href] = r.value.count;
    if (r.value.newest) badges[`newest:${href}`] = r.value.newest.getTime();
  });
  return badges;
}
