// 모바일 직원 — 휴대폰 제출 검사. 조회·저장은 웹과 같은 @/lib/phone-check-core.

import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import {
  bulkUpsertPhoneSubmitted,
  loadPhoneCheckBoard,
  upsertPhoneCheck,
} from "@/lib/phone-check-core";
import { prisma } from "@/lib/prisma";
import { offlineStudentWhere } from "@/lib/student-filters";
import { todayKST } from "@/lib/utils";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인하세요");

const setInput = z.object({
  date: dateKey,
  status: z.enum(["SUBMITTED", "NOT_SUBMITTED", "ABSENT", "EXEMPT"], {
    message: "검사 상태를 선택하세요",
  }),
  note: z.string().trim().max(200, "사유는 200자까지 쓸 수 있어요").optional().nullable(),
});

const bulkInput = z.object({
  date: dateKey,
  studentIds: z.array(z.string().min(1)).max(500),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function resolveDate(raw: string | null) {
  const today = todayKST().toISOString().slice(0, 10);
  if (!raw) return today;
  const parsed = dateKey.safeParse(raw);
  if (!parsed.success) throw new MobileApiError("날짜 형식을 확인하세요", 400);
  if (parsed.data > today) throw new MobileApiError("미래 날짜는 볼 수 없어요", 400);
  return parsed.data;
}

/** 휴대폰 제출 보드 (오프라인 자습실 학생만) */
export async function getStaffPhoneCheckBoard(rawDate: string | null) {
  const date = resolveDate(rawDate);
  const today = todayKST().toISOString().slice(0, 10);
  const rows = await loadPhoneCheckBoard(date, { offlineOnly: true });
  return { date, isToday: date === today, rows };
}

/** 학생 1명 검사 상태 저장 (미제출 외에는 사유를 지움 — 웹과 동일) */
export async function setStaffPhoneCheck(
  studentId: string,
  input: unknown,
  userId: string,
) {
  const body = parseBody(setInput, input);
  resolveDate(body.date);
  const student = await prisma.student.findFirst({
    where: offlineStudentWhere({ id: studentId, status: "ACTIVE" }),
    select: { id: true },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);

  const note = body.status === "NOT_SUBMITTED" ? (body.note ?? null) : null;
  await upsertPhoneCheck({
    studentId,
    date: body.date,
    status: body.status,
    note,
    checkedById: userId,
  });
  return { ok: true, record: { status: body.status, note: note?.trim() || null } };
}

/** 여러 명 '제출' 일괄 처리 */
export async function bulkStaffPhoneSubmitted(input: unknown, userId: string) {
  const body = parseBody(bulkInput, input);
  resolveDate(body.date);
  const ids = [...new Set(body.studentIds)];
  if (ids.length === 0) return { count: 0 };

  const valid = await prisma.student.findMany({
    where: offlineStudentWhere({ id: { in: ids }, status: "ACTIVE" }),
    select: { id: true },
  });
  const count = await bulkUpsertPhoneSubmitted(
    body.date,
    valid.map((s) => s.id),
    userId,
  );
  return { count };
}
