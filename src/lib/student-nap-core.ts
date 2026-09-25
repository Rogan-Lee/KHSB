import { revalidatePath } from "next/cache";

import type { NapStatus } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";

// 쪽잠 신청(학생 측) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/nap.ts, 매직링크 토큰)과
// 학생 앱 라우트(src/lib/mobile-student-life.ts, requireMobileStudent)가 같이 쓴다.
// 오류는 MobileApiError(Error 하위 클래스, 한국어 메시지 + HTTP 상태)로 던진다.

export const NAP_DAILY_LIMIT = 2;
export const NAP_DURATIONS = [20, 30];

export type NapView = {
  id: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  durationMin: number;
  status: NapStatus;
  note: string | null;
  decidedByName: string | null;
  createdAt: string;
};

type NapRow = {
  id: string;
  date: Date;
  startTime: string;
  durationMin: number;
  status: NapStatus;
  note: string | null;
  decidedByName: string | null;
  createdAt: Date;
};

type StudentRef = { id: string; name: string; grade: string };

export function toNapView(n: NapRow): NapView {
  return {
    id: n.id,
    date: n.date.toISOString().slice(0, 10),
    startTime: n.startTime,
    durationMin: n.durationMin,
    status: n.status,
    note: n.note,
    decidedByName: n.decidedByName,
    createdAt: n.createdAt.toISOString(),
  };
}

/** 오늘 + 최근 7일 쪽잠 신청 목록과 오늘 사용 횟수(REJECTED 제외). */
export async function loadStudentNaps(studentId: string) {
  const today = todayKST();
  const since = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const naps = await prisma.napRequest.findMany({
    where: { studentId, date: { gte: since } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const todayStr = today.toISOString().slice(0, 10);
  const todayCount = naps.filter(
    (n) => n.date.toISOString().slice(0, 10) === todayStr && n.status !== "REJECTED"
  ).length;

  return { naps: naps.map(toNapView), todayCount, limit: NAP_DAILY_LIMIT, today: todayStr };
}

/** 쪽잠 신청 — 오늘 날짜로 생성. 하루 2회 제한(REJECTED 제외). */
export async function requestNapForStudent(
  student: StudentRef,
  params: { startTime: string; durationMin: number },
) {
  if (!/^\d{2}:\d{2}$/.test(params.startTime)) {
    throw new MobileApiError("시작 시간을 선택해 주세요", 400);
  }
  if (!NAP_DURATIONS.includes(params.durationMin)) {
    throw new MobileApiError("쪽잠 시간은 20분 또는 30분만 선택할 수 있어요", 400);
  }

  const date = todayKST();
  // ponytail: 동시요청 race 허용 — 승인 단계에서 걸러짐
  const count = await prisma.napRequest.count({
    where: { studentId: student.id, date, status: { not: "REJECTED" } },
  });
  if (count >= NAP_DAILY_LIMIT) {
    throw new MobileApiError("쪽잠은 하루 2회까지 신청할 수 있어요", 400);
  }

  await prisma.napRequest.create({
    data: {
      studentId: student.id,
      date,
      startTime: params.startTime,
      durationMin: params.durationMin,
    },
  });

  notifySlack(
    `😴 [쪽잠 신청] ${student.name}(${student.grade}) — ${params.startTime} · ${params.durationMin}분`
  );
  revalidatePath("/approvals");
  return { ok: true };
}
