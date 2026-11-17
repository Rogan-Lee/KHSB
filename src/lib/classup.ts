import { createHmac } from "node:crypto";

import { safeEqual } from "@/lib/cron-auth";
import { MobileApiError } from "@/lib/mobile-auth";
import { updateMobileAttendance, type MobileAttendanceAction } from "@/lib/mobile-workflows";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

/**
 * 클래스업(학원 관리 프로그램) 키오스크 입퇴장 → 우리 입퇴실 자동 입력.
 *
 * 클래스업이 변경 알림(웹훅)으로 보낸 출입 사건을 /api/webhooks/classup 이 받아 여기로 넘긴다.
 * 반영은 운영진 앱의 입실·외출·복귀·퇴실 버튼과 같은 함수(updateMobileAttendance)를 사건 시각으로
 * 부른다 — 지각 판정·N차 외출·학부모 알림 규칙을 따로 두지 않기 위해서. 이미 그 상태면(409) 건너뛴다.
 *
 * 클래스업 API 는 등록한 공인 IP 에서만 불러지므로 Vercel 에서 조회(폴링)는 못 한다. 알림만 받고,
 * 알림 등록·학생 대조는 scripts/classup.ts 로 허용 IP 에서 한다.
 */

const SEQ_KEY = "classup.attendance.seq";
/** 이름으로 못 찾는 학생(동명이인·표기 차이)만 적는다: {"<클래스업 학생 번호>": "<Student.id>"} */
export const STUDENT_MAP_KEY = "classup.student_map";
const MAX_SKEW_SEC = 5 * 60;

/** HMAC-SHA256(secret, `${timestamp}.${rawBody}`) — 비밀 교체 중엔 새·이전 비밀 둘 다 받는다 */
export function verifyClassupSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secrets: string[],
  nowMs = Date.now(),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowMs / 1000 - ts) > MAX_SKEW_SEC) return false;
  const signed = `${timestamp}.${rawBody}`;
  return secrets.some((secret) =>
    safeEqual(signature, `sha256=${createHmac("sha256", secret).update(signed).digest("hex")}`),
  );
}

// 앞에서부터 시도해 지금 상태에서 되는 첫 동작을 쓴다. 들어옴은 외출 중이면 복귀, 아니면 입실.
// outClass(부재)는 우리 쪽에 대응 상태가 없어 무시.
const ACTIONS: Record<string, MobileAttendanceAction[]> = {
  entrance: ["CHECK_IN", "RETURN"],
  reenter: ["RETURN", "CHECK_IN"],
  outing: ["START_OUTING"],
  exit: ["CHECK_OUT"],
};

async function applyEvent(studentId: string, eventType: string, at: Date) {
  for (const action of ACTIONS[eventType] ?? []) {
    try {
      await updateMobileAttendance(studentId, { action }, at);
      return true;
    } catch (error) {
      if (!(error instanceof MobileApiError)) throw error; // DB 오류 등은 500 → 클래스업이 다시 보낸다
    }
  }
  // 이미 반영됐거나 지금 상태와 안 맞음 (예: 퇴실 뒤 재입장 — 우리 기록은 하루 입·퇴실 한 번)
  return false;
}

async function resolveStudent(classupId: number, name: string | null, map: Record<string, string>) {
  const mapped = map[String(classupId)];
  if (mapped) return mapped;
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const found = await prisma.student.findMany({
    where: { name: trimmed, status: "ACTIVE" },
    select: { id: true },
    take: 2,
  });
  return found.length === 1 ? found[0].id : null; // 동명이인은 대조표로
}

function parseMap(raw: string | undefined): Record<string, string> {
  try {
    const value = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const NOTICES: Record<string, string> = {
  "subscription.connected": "클래스업 출결 연동이 연결됐습니다. 이제 키오스크 입퇴장이 자동 입력됩니다.",
  "subscription.revoked": "클래스업 출결 연동이 해제됐습니다. 입퇴실이 더 이상 자동 입력되지 않습니다.",
  SYNC_RESET_REQUIRED: "클래스업 변경 이력이 만료돼 일부 입퇴실이 빠졌을 수 있습니다. 출결 화면을 확인해 주세요.",
};

type Change = {
  sequence?: unknown;
  operation?: unknown;
  data?: { studentId?: unknown; studentName?: unknown; eventType?: unknown; occurredAt?: unknown };
};

/** 검증을 마친 알림 본문 하나를 처리한다. 반영 실패만 throw (→ 500 → 재전송). */
export async function handleClassupEvent(body: unknown): Promise<{ applied: number }> {
  const event = (body ?? {}) as { type?: unknown; resource?: unknown; events?: unknown };
  const notice = typeof event.type === "string" ? NOTICES[event.type] : undefined;
  if (notice) {
    await notifySlack(notice);
    return { applied: 0 };
  }
  if (event.type !== "resource.changed" || event.resource !== "attendance" || !Array.isArray(event.events)) {
    return { applied: 0 };
  }

  const settings = await prisma.appSetting.findMany({ where: { key: { in: [SEQ_KEY, STUDENT_MAP_KEY] } } });
  const startSeq = Number(settings.find((s) => s.key === SEQ_KEY)?.value ?? 0) || 0;
  const map = parseMap(settings.find((s) => s.key === STUDENT_MAP_KEY)?.value);

  const changes = (event.events as Change[])
    .filter((c): c is Change & { sequence: number } => Number.isInteger(c?.sequence))
    .sort((a, b) => a.sequence - b.sequence);

  // ponytail: 전달이 구독별로 순서대로 온다고 보고 마지막 순번 하나로 중복을 거른다. 동시 전달이 생기면 사건 id 별 기록으로
  let lastSeq = startSeq;
  let applied = 0;
  const unmatched = new Set<string>();
  try {
    for (const change of changes) {
      if (change.sequence <= lastSeq) continue; // 재전송·중복
      const d = change.data ?? {};
      const at = typeof d.occurredAt === "string" ? new Date(d.occurredAt) : null;
      // delete(클래스업에서 기록 삭제)는 반영하지 않는다 — 운영진이 직접 고친다
      if (
        change.operation === "upsert" &&
        typeof d.studentId === "number" &&
        typeof d.eventType === "string" &&
        at &&
        !Number.isNaN(at.getTime())
      ) {
        const name = typeof d.studentName === "string" ? d.studentName : null;
        const studentId = await resolveStudent(d.studentId, name, map);
        if (!studentId) unmatched.add(`${name ?? "이름 없음"}(클래스업 #${d.studentId})`);
        else if (await applyEvent(studentId, d.eventType, at)) applied++;
      }
      lastSeq = change.sequence;
    }
  } finally {
    if (lastSeq > startSeq) {
      await prisma.appSetting.upsert({
        where: { key: SEQ_KEY },
        create: { key: SEQ_KEY, value: String(lastSeq) },
        update: { value: String(lastSeq) },
      });
    }
  }

  if (unmatched.size) {
    await notifySlack(
      `클래스업 출결: 학생을 찾지 못해 입력하지 못했습니다 — ${[...unmatched].join(", ")}\n` +
        `이름을 맞추거나 대조표(${STUDENT_MAP_KEY})에 추가해 주세요.`,
    );
  }
  return { applied };
}
