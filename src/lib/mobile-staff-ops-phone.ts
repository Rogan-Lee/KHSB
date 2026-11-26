// 모바일 직원 — 휴대폰 제출 검사. 조회·저장은 웹과 같은 @/lib/phone-check-core.
// period 를 안 보내는 옛 앱(1.1.0 이하)은 그대로 입실 검사(0)만 쓴다.

import { z } from "zod";

import { currentPeriodNo, periodsFor } from "@/lib/class-periods";
import { MobileApiError } from "@/lib/mobile-auth";
import {
  bulkCreatePhoneChecks,
  deletePhoneCheck,
  loadPhoneCheckBoard,
  parsePhoneCheckPeriod,
  upsertPhoneCheck,
} from "@/lib/phone-check-core";
import { PHONE_LOCKER_ROWS } from "@/lib/phone-locker";
import { prisma } from "@/lib/prisma";
import { offlineStudentWhere } from "@/lib/student-filters";
import { nowKSTTimeString, todayKST } from "@/lib/utils";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인하세요");

const period = z.number().int().min(0).optional();

const setInput = z.object({
  date: dateKey,
  period,
  status: z.enum(["SUBMITTED", "NOT_SUBMITTED", "ABSENT", "EXEMPT"], {
    message: "검사 상태를 선택하세요",
  }),
  note: z.string().trim().max(200, "사유는 200자까지 쓸 수 있어요").optional().nullable(),
});

const bulkInput = z.object({
  date: dateKey,
  period,
  studentIds: z.array(z.string().min(1)).max(500),
  exemptIds: z.array(z.string().min(1)).max(500).optional(),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function todayKey() {
  return todayKST().toISOString().slice(0, 10);
}

function resolveDate(raw: string | null) {
  const today = todayKey();
  if (!raw) return today;
  const parsed = dateKey.safeParse(raw);
  if (!parsed.success) throw new MobileApiError("날짜 형식을 확인하세요", 400);
  if (parsed.data > today) throw new MobileApiError("미래 날짜는 볼 수 없어요", 400);
  return parsed.data;
}

/** 교시 — 없으면 0(입실), "current" 면 그 날짜의 지금 교시(오늘이 아니면 0). 교시표에 없으면 400. */
function resolvePeriod(date: string, raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (raw === "current") return date === todayKey() ? currentPeriodNo(date, nowKSTTimeString()) : 0;
  try {
    return parsePhoneCheckPeriod(date, typeof raw === "string" ? Number(raw) : raw);
  } catch {
    throw new MobileApiError("교시를 확인하세요", 400);
  }
}

async function requireOfflineStudents(ids: string[]) {
  const valid = await prisma.student.findMany({
    where: offlineStudentWhere({ id: { in: ids }, status: "ACTIVE" }),
    select: { id: true },
  });
  return new Set(valid.map((s) => s.id));
}

/** 휴대폰 제출 보드 (오프라인 자습실 학생만) — ?date=&period=(0|번호|current) */
export async function getStaffPhoneCheckBoard(rawDate: string | null, rawPeriod: string | null = null) {
  const date = resolveDate(rawDate);
  const today = todayKey();
  const board = await loadPhoneCheckBoard(date, { offlineOnly: true, period: resolvePeriod(date, rawPeriod) });
  return {
    ...board,
    isToday: date === today,
    periods: periodsFor(date),
    currentPeriod: date === today ? currentPeriodNo(date, nowKSTTimeString()) : null,
    locker: PHONE_LOCKER_ROWS,
  };
}

/** 학생 1명 검사 상태 저장 (미제출 외에는 사유를 지움 — 웹과 동일) */
export async function setStaffPhoneCheck(
  studentId: string,
  input: unknown,
  userId: string,
) {
  const body = parseBody(setInput, input);
  resolveDate(body.date);
  const p = resolvePeriod(body.date, body.period);
  if (!(await requireOfflineStudents([studentId])).has(studentId)) {
    throw new MobileApiError("학생을 찾을 수 없습니다", 404);
  }

  const note = body.status === "NOT_SUBMITTED" ? (body.note ?? null) : null;
  await upsertPhoneCheck({
    studentId,
    date: body.date,
    status: body.status,
    note,
    checkedById: userId,
    period: p,
  });
  return { ok: true, record: { status: body.status, note: note?.trim() || null } };
}

/** 학생 1명 기록 지우기 — 검사 중 누른 칸 되돌리기 (?date=&period=) */
export async function clearStaffPhoneCheck(studentId: string, rawDate: string | null, rawPeriod: string | null) {
  if (!rawDate) throw new MobileApiError("날짜 형식을 확인하세요", 400);
  const date = resolveDate(rawDate);
  if (!(await requireOfflineStudents([studentId])).has(studentId)) {
    throw new MobileApiError("학생을 찾을 수 없습니다", 404);
  }
  await deletePhoneCheck(studentId, date, resolvePeriod(date, rawPeriod));
  return { ok: true };
}

/** 검사 완료 — 기록 없는 학생만 '제출'(exemptIds 는 '면제')로. 옛 앱의 '모두 제출'도 이 경로. */
export async function bulkStaffPhoneSubmitted(input: unknown, userId: string) {
  const body = parseBody(bulkInput, input);
  resolveDate(body.date);
  const p = resolvePeriod(body.date, body.period);
  const all = [...new Set([...body.studentIds, ...(body.exemptIds ?? [])])];
  if (all.length === 0) return { count: 0 };

  const valid = await requireOfflineStudents(all);
  const count = await bulkCreatePhoneChecks(
    body.date,
    {
      submitted: body.studentIds.filter((id) => valid.has(id)),
      exempt: (body.exemptIds ?? []).filter((id) => valid.has(id)),
    },
    userId,
    p,
  );
  return { count };
}
