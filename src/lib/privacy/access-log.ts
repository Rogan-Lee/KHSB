import { after } from "next/server";

import { prisma } from "@/lib/prisma";

// 직원의 개인정보처리시스템 접속 기록 (안전성 확보조치 기준 제8조: 계정 · 일시 · 접속지 · 처리한 정보주체 · 한 일).
// 정보주체(학생·학부모) 본인의 접속은 기록 대상이 아니다.

const BUCKET_MS = 10 * 60 * 1000;

export type AccessAction = "LOGIN" | "VIEW" | "ACTION";

/** 화면 주소에서 학생을 알 수 있으면 그 id */
export function studentIdFromPath(path: string): string | null {
  return path.match(/\/students\/([a-z0-9]{20,})(?:\/|$)/)?.[1] ?? null;
}

/** 공개 링크 토큰 같은 긴 조각은 남기지 않는다. 주소 뒤의 쿼리도 뺀다 */
export function loggablePath(path: string): string {
  return path.split("?")[0].slice(0, 200);
}

export function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || null;
}

/** 미리 불러오기는 사람이 연 화면이 아니다 */
export function isPrefetch(headers: Headers): boolean {
  return headers.get("next-router-prefetch") === "1" || /prefetch/.test(headers.get("purpose") ?? headers.get("sec-purpose") ?? "");
}

type Entry = { actor: { id: string; name: string }; action: AccessAction; path: string; ip: string | null; at?: Date };

export async function writeAccessLog({ actor, action, path, ip, at = new Date() }: Entry) {
  const clean = loggablePath(path);
  await prisma.personalDataAccessLog.createMany({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action,
      path: clean,
      studentId: studentIdFromPath(clean),
      ip,
      bucket: new Date(Math.floor(at.getTime() / BUCKET_MS) * BUCKET_MS),
    },
    skipDuplicates: true,
  });
}

/** 응답을 보낸 뒤 남긴다. 기록이 실패해도 업무는 막지 않는다 */
export function queueAccessLog(entry: Entry) {
  const run = () => writeAccessLog(entry).catch((error) => console.error("[access-log]", error));
  try {
    after(run);
  } catch {
    // 요청 밖(스크립트·테스트)에서는 after 를 쓸 수 없다 — 접속이 아니므로 남기지 않는다
  }
}
