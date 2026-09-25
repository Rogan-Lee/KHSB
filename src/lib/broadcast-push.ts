import { sendMobilePush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";

// 단체 푸시 핵심 로직 — 웹 서버 액션(sendBroadcastPush)과 모바일 라우트가 같이 쓴다.
// 권한(원장 전용) 확인은 호출하는 쪽 책임.

export const BROADCAST_AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "STAFF"] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export const BROADCAST_TITLE_MAX = 100;
export const BROADCAST_BODY_MAX = 1000;

// AuthUser 구분: 학생 = studentId 有, 직원 = appUserId 有, 학부모 = ParentLink 有.
// ALL = 필터 없음 — 푸시 토큰을 등록한 모든 계정(학생 + 직원 + 학부모).
function audienceWhere(audience: BroadcastAudience) {
  const filter =
    audience === "STUDENTS"
      ? { studentId: { not: null } }
      : audience === "STAFF"
        ? { appUserId: { not: null } }
        : audience === "PARENTS"
          ? { parentLinks: { some: { student: { status: "ACTIVE" as const } } } }
          : {};
  return { ...filter, pushTokens: { some: { enabled: true } } };
}

/** 대상별 알림 수신 가능 계정 수 (푸시 토큰을 켠 계정) */
export async function countBroadcastTargets(audience: BroadcastAudience) {
  return prisma.authUser.count({ where: audienceWhere(audience) });
}

/**
 * 단체 푸시 발송. 발송 이력 저장은 이번엔 생략.
 * // ponytail: 이력 테이블 없음 — 감사/재발송 필요해지면 BroadcastPushLog 모델 추가
 */
export async function broadcastPush(params: {
  audience: BroadcastAudience;
  title: string;
  body: string;
}) {
  const title = params.title.trim();
  const body = params.body.trim();
  if (!title || !body) throw new Error("제목과 내용을 입력해 주세요");
  if (title.length > BROADCAST_TITLE_MAX) throw new Error("제목은 100자 이하로 작성해 주세요");
  if (body.length > BROADCAST_BODY_MAX) throw new Error("내용은 1000자 이하로 작성해 주세요");

  const targets = await prisma.authUser.findMany({
    where: audienceWhere(params.audience),
    select: { id: true },
  });
  if (targets.length === 0) return { targets: 0, sent: 0 };

  const { sent } = await sendMobilePush({
    authUserIds: targets.map((t) => t.id),
    body,
    category: "SYSTEM",
    data: { broadcast: true },
    title,
  });
  return { targets: targets.length, sent };
}
