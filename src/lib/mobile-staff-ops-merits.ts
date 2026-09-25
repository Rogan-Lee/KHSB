// 모바일 직원 — 상벌점 조회·부여·삭제.
// 저장 로직은 웹과 같은 @/lib/merit-demerit-core 를 쓴다.

import { z } from "zod";

import type { MeritType } from "@/generated/prisma";
import {
  createMeritRecord,
  deleteMeritRecord,
  meritSchema,
} from "@/lib/merit-demerit-core";
import { MobileApiError } from "@/lib/mobile-auth";
import { queueParentDemeritPush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";
import { MERIT_CATEGORIES, todayKST } from "@/lib/utils";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인하세요");

const createMeritInput = z.object({
  studentId: z.string().trim().min(1, "학생을 선택하세요"),
  type: z.enum(["MERIT", "DEMERIT"], { message: "상점·벌점을 선택하세요" }),
  points: z.coerce
    .number({ message: "점수를 입력하세요" })
    .int("점수는 정수로 입력하세요")
    .min(1, "점수는 1점 이상이어야 해요")
    .max(100, "점수는 100점까지 줄 수 있어요"),
  reason: z
    .string()
    .trim()
    .min(1, "사유를 입력하세요")
    .max(200, "사유는 200자까지 쓸 수 있어요"),
  category: z.string().trim().max(40).optional().nullable(),
  date: dateKey.optional(),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

type MeritRow = {
  id: string;
  date: Date;
  type: MeritType;
  points: number;
  reason: string;
  category: string | null;
  visibleInReport: boolean;
  createdAt: Date;
  createdById: string;
};

export type MobileMeritItem = {
  id: string;
  date: string;
  type: MeritType;
  points: number;
  reason: string;
  category: string | null;
  visibleInReport: boolean;
  createdAt: string;
  createdByName: string | null;
  mine: boolean;
};

/** createdById → 작성자 이름을 붙여 직렬화 */
export async function serializeMerits(
  rows: MeritRow[],
  viewerId?: string,
): Promise<MobileMeritItem[]> {
  const authorIds = [...new Set(rows.map((r) => r.createdById))];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.name]));

  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    type: r.type,
    points: r.points,
    reason: r.reason,
    category: r.category,
    visibleInReport: r.visibleInReport,
    createdAt: r.createdAt.toISOString(),
    createdByName: nameById.get(r.createdById) ?? null,
    mine: !!viewerId && r.createdById === viewerId,
  }));
}

const MERIT_SELECT = {
  id: true,
  date: true,
  type: true,
  points: true,
  reason: true,
  category: true,
  visibleInReport: true,
  createdAt: true,
  createdById: true,
} as const;

/** KST 기준 이번 달 1일 (@db.Date 규약 UTC 자정) */
function kstMonthStart() {
  return new Date(`${todayKST().toISOString().slice(0, 7)}-01`);
}

/** 학생 상벌점 합계 — 이번 달 · 전체 누적 */
export async function getMeritTotals(studentId: string) {
  const [month, total] = await Promise.all([
    prisma.meritDemerit.groupBy({
      by: ["type"],
      where: { studentId, date: { gte: kstMonthStart() } },
      _sum: { points: true },
    }),
    prisma.meritDemerit.groupBy({
      by: ["type"],
      where: { studentId },
      _sum: { points: true },
    }),
  ]);
  const pick = (rows: typeof month, type: MeritType) =>
    rows.find((r) => r.type === type)?._sum.points ?? 0;
  return {
    month: { merit: pick(month, "MERIT"), demerit: pick(month, "DEMERIT") },
    total: { merit: pick(total, "MERIT"), demerit: pick(total, "DEMERIT") },
  };
}

/** 최근에 자주 쓴 사유 (유형별 상위 8개, 칩용 짧은 문구만) */
async function getRecentReasons() {
  const rows = await prisma.meritDemerit.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { type: true, reason: true },
  });
  const tally: Record<MeritType, Map<string, number>> = {
    MERIT: new Map(),
    DEMERIT: new Map(),
  };
  for (const r of rows) {
    const reason = r.reason.trim();
    if (!reason || reason.length > 30 || reason.includes("\n")) continue;
    const m = tally[r.type];
    m.set(reason, (m.get(reason) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reason]) => reason);
  return { MERIT: top(tally.MERIT), DEMERIT: top(tally.DEMERIT) };
}

/** 학생 상벌점 목록·합계·자주 쓴 사유 (studentId 없으면 최근 전체) */
export async function getStaffMobileMerits(
  studentId: string | null,
  viewerId: string,
) {
  if (studentId) {
    const exists = await prisma.student.findFirst({
      where: { id: studentId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!exists) throw new MobileApiError("학생을 찾을 수 없습니다", 404);
  }

  const [rows, totals, recentReasons] = await Promise.all([
    prisma.meritDemerit.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: studentId ? 50 : 30,
      select: MERIT_SELECT,
    }),
    studentId ? getMeritTotals(studentId) : Promise.resolve(null),
    getRecentReasons(),
  ]);

  return {
    categories: MERIT_CATEGORIES,
    items: await serializeMerits(rows, viewerId),
    recentReasons,
    summary: totals,
  };
}

/** 상벌점 1건 부여 — 날짜 기본값 오늘(KST), 미래 날짜 불가 */
export async function createStaffMobileMerit(input: unknown, userId: string) {
  const body = parseBody(createMeritInput, input);
  const today = todayKST().toISOString().slice(0, 10);
  const date = body.date ?? today;
  if (date > today) {
    throw new MobileApiError("미래 날짜에는 줄 수 없어요", 400);
  }

  const student = await prisma.student.findFirst({
    where: { id: body.studentId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);

  // 웹과 같은 스키마로 한 번 더 검증 후 같은 코어로 저장
  const data = meritSchema.parse({
    studentId: body.studentId,
    date,
    type: body.type,
    points: body.points,
    reason: body.reason,
    category: body.category || undefined,
  });
  const created = await createMeritRecord(data, userId);
  // 학부모에게 보이는 벌점이면 학부모 푸시 (fire-and-forget, 웹 createMeritDemerit 와 동일)
  queueParentDemeritPush(created);
  const [item] = await serializeMerits([created], userId);
  return { item, studentId: created.studentId };
}

/** 상벌점 1건 삭제 (되돌리기) */
export async function deleteStaffMobileMerit(meritId: string) {
  const record = await deleteMeritRecord(meritId);
  if (!record) throw new MobileApiError("상벌점 기록을 찾을 수 없습니다", 404);
  return { ok: true, studentId: record.studentId };
}
