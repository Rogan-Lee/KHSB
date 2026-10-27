import { z } from "zod";

import { ASK_FACILITY } from "@/lib/facility";
import { MobileApiError } from "@/lib/mobile-auth";
import { parseMobileBody, type ParentChildRef } from "@/lib/mobile-parent-services";
import {
  addDays,
  checkParkingAttempt,
  COUNTED_STATUSES,
  normalizeCarNo,
  PARKING_FLAG_LABEL,
  PARKING_RULES,
  type ParkingFlag,
} from "@/lib/parking/rules";
import { applyWdcDiscount, parkingEnabled, type WdcResult } from "@/lib/parking/wdc";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { nowKSTTimeString, todayKST } from "@/lib/utils";

// 학부모 앱 — 주차 등록. 차량번호를 받으면 주차장 웹할인 사이트에 독서실 계정으로 할인을 적용한다.
// 인증은 라우트의 requireParentChild(ParentLink). 한도·의심 감지는 src/lib/parking/rules.ts.

const registerSchema = z.object({ carNo: z.string().trim().min(1, "차량번호를 입력해 주세요").max(20) });

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dateOf = (s: string) => new Date(`${s}T00:00:00Z`);

export async function getParentParking(authUserId: string, child: ParentChildRef) {
  const today = todayKST();
  const [rows, last] = await Promise.all([
    prisma.parkingRegistration.findMany({
      where: { studentId: child.id, date: today },
      orderBy: { createdAt: "desc" },
      select: { id: true, carNo: true, status: true, message: true, createdAt: true },
    }),
    // 다음 등록 때 미리 채워 줄 번호 — 이 학부모가 마지막으로 등록에 성공한 차량
    prisma.parkingRegistration.findFirst({
      where: { authUserId, status: "OK" },
      orderBy: { createdAt: "desc" },
      select: { carNo: true },
    }),
  ]);
  const enabled = parkingEnabled();
  return {
    enabled,
    dailyLimit: PARKING_RULES.dailyLimit,
    todayCount: rows.filter((r) => COUNTED_STATUSES.includes(r.status)).length,
    lastCarNo: last?.carNo ?? null,
    guide: enabled
      ? `주차장에 들어온 차량만 등록할 수 있어요. 출차하기 전에 등록해 주세요. 하루 ${PARKING_RULES.dailyLimit}번까지 할 수 있어요.`
      : ASK_FACILITY,
    today: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

export async function registerParentParking(authUserId: string, child: ParentChildRef, input: unknown) {
  if (!parkingEnabled()) throw new MobileApiError(`지금은 주차 등록을 할 수 없어요. ${ASK_FACILITY}`, 409);
  const body = parseMobileBody(registerSchema, input);
  const carNo = normalizeCarNo(body.carNo);
  if (!carNo) throw new MobileApiError("차량번호를 확인해 주세요. (예: 12가3456)", 400);

  const today = ymd(todayKST());
  const hour = Number(nowKSTTimeString().slice(0, 2));

  // 1) 한도·의심 판정과 기록을 학생 단위 락 안에서 — 두 번 눌러도 한도를 넘지 않게 PENDING 을 먼저 남긴다
  const { id, check } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`parking:${child.id}`}))) AS l`;
    const history = await tx.parkingRegistration.findMany({
      where: {
        date: { gte: dateOf(addDays(today, -(PARKING_RULES.windowDays - 1))) },
        OR: [{ studentId: child.id }, { carNo }, { authUserId }],
      },
      select: { studentId: true, authUserId: true, carNo: true, date: true, status: true, flags: true },
    });
    const check = checkParkingAttempt(
      { studentId: child.id, authUserId, carNo, today, hour },
      history.map((r) => ({ ...r, date: ymd(r.date) })),
    );
    const row = await tx.parkingRegistration.create({
      data: {
        studentId: child.id,
        authUserId,
        carNo,
        date: dateOf(today),
        status: check.blocked ? "BLOCKED" : "PENDING",
        flags: check.flags,
        message: check.blocked,
      },
      select: { id: true },
    });
    return { id: row.id, check };
  });
  if (check.blocked) throw new MobileApiError(check.blocked, 409);

  // 2) 주차장 사이트에 적용 (수 초 걸림 — 트랜잭션 밖)
  const result: WdcResult = await applyWdcDiscount(carNo).catch((error: unknown) => ({
    ok: false,
    reason: "ERROR",
    detail: error instanceof Error ? error.message : String(error),
  }));

  if (result.ok) {
    await prisma.parkingRegistration.update({ where: { id }, data: { status: "OK" } });
    if (check.newFlags.length > 0) void notifySlack(suspicionAlert(child.name, carNo, check.newFlags));
    return { ok: true as const, message: `${carNo} 주차 등록을 마쳤어요.` };
  }

  // 학부모에게는 안내 문장만 남기고, 사이트 쪽 원인은 슬랙·로그로 보낸다
  const message = {
    NOT_FOUND: `주차장에서 ${carNo} 차량을 찾지 못했어요. 번호를 확인해 주세요.`,
    ALREADY: `${carNo} 차량은 이번 주차에 이미 할인을 받았어요. 더 필요하면 ${ASK_FACILITY}`,
    ERROR: `주차 등록을 하지 못했어요. ${ASK_FACILITY}`,
  }[result.reason];
  // 적용되지 않은 시도는 의심 표시·알림 근거에서 뺀다
  await prisma.parkingRegistration.update({ where: { id }, data: { status: "FAILED", message, flags: [] } });
  if (result.reason === "ERROR") {
    console.error("[parking]", result.detail);
    void notifySlack(`[주차 등록 실패] ${child.name} 학생 학부모 · ${carNo} — ${result.detail}`);
  }
  throw new MobileApiError(message, result.reason === "NOT_FOUND" ? 404 : result.reason === "ALREADY" ? 409 : 502);
}

function suspicionAlert(studentName: string, carNo: string, flags: ParkingFlag[]) {
  const reasons = flags.map((f) => `• ${PARKING_FLAG_LABEL[f]}`).join("\n");
  return `[주차 등록 의심] ${studentName} 학생 가족 · ${carNo}\n${reasons}\n등록은 처리됐어요. 어드민 > 주차 등록에서 확인하세요.`;
}
