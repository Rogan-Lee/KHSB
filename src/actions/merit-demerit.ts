"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import {
  createMeritRecord,
  deleteMeritRecord,
  meritSchema,
  meritUpdateSchema,
  updateMeritRecord,
} from "@/lib/merit-demerit-core";
import { queueParentDemeritPush } from "@/lib/mobile-push";

export async function createMeritDemerit(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const raw = Object.fromEntries(formData.entries());
  const data = meritSchema.parse(raw);

  const created = await createMeritRecord(data, session.user.id);
  // 학부모 앱 벌점 알림 — 학부모에게 보이는(visibleInReport) 벌점만, fire-and-forget
  queueParentDemeritPush(created);

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${data.studentId}`);
}

export async function updateMeritDemerit(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const raw = Object.fromEntries(formData.entries());
  const data = meritUpdateSchema.parse(raw);

  const record = await updateMeritRecord(id, data);
  if (!record) throw new Error("Not found");

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${record.studentId}`);
}

export async function deleteMeritDemerit(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const record = await deleteMeritRecord(id);
  if (!record) throw new Error("Not found");

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${record.studentId}`);
}

export async function toggleMeritDemeritVisibility(id: string, visible: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const record = await prisma.meritDemerit.findUnique({ where: { id } });
  if (!record) throw new Error("상벌점 기록을 찾을 수 없습니다");

  await prisma.meritDemerit.update({
    where: { id },
    data: { visibleInReport: visible },
  });

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${record.studentId}`);
  revalidatePath("/mentoring");
}

export async function bulkDeleteMeritDemerits(ids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);
  if (!ids.length) return;

  await prisma.meritDemerit.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/merit-demerit");
}

export async function getMeritDemerits(studentId?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  return prisma.meritDemerit.findMany({
    where: studentId ? { studentId } : undefined,
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: { date: "desc" },
  });
}

export async function getMeritsByRange(from: string, to: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  // 화면(기간별 조회·오늘 내역)이 읽는 필드만 (egress 절감)
  return prisma.meritDemerit.findMany({
    where: { date: { gte: fromDate, lte: toDate } },
    select: {
      id: true,
      date: true,
      type: true,
      points: true,
      reason: true,
      category: true,
      visibleInReport: true,
      student: { select: { id: true, name: true, grade: true } },
    },
    orderBy: [{ student: { name: "asc" } }, { date: "asc" }],
  });
}

/**
 * 기간 내 원생별 상점·벌점 합계 — 랭킹용. 행 전체 대신 DB 에서 합산한다(egress 절감).
 * 반환 순서는 getMeritsByRange 와 같은 학생 이름순(동점 시 화면 정렬이 이 순서를 유지).
 */
export async function getMeritTotalsByRange(from: string, to: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const sums = await prisma.meritDemerit.groupBy({
    by: ["studentId", "type"],
    where: { date: { gte: fromDate, lte: toDate } },
    _sum: { points: true },
  });
  if (sums.length === 0) return [];

  const totals = new Map<string, { merits: number; demerits: number }>();
  for (const s of sums) {
    const t = totals.get(s.studentId) ?? { merits: 0, demerits: 0 };
    if (s.type === "MERIT") t.merits += s._sum.points ?? 0;
    else t.demerits += s._sum.points ?? 0;
    totals.set(s.studentId, t);
  }

  const students = await prisma.student.findMany({
    where: { id: { in: [...totals.keys()] } },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });
  return students.map((s) => ({ id: s.id, name: s.name, grade: s.grade, ...totals.get(s.id)! }));
}

export async function getStudentPointSummary() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 상벌점은 오프라인 자습실 운영 기능 — 모바일(requireMobileStaff)과 동일하게 오프라인 직원만
  requireStaff(session.user.role);

  // 매월 1일 초기화: 현재 월의 상벌점만 집계
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      merits: {
        where: { date: { gte: monthStart } },
        select: { type: true, points: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.map((s) => {
    const totalMerits = s.merits
      .filter((m) => m.type === "MERIT")
      .reduce((acc, m) => acc + m.points, 0);
    const totalDemerits = s.merits
      .filter((m) => m.type === "DEMERIT")
      .reduce((acc, m) => acc + m.points, 0);
    return {
      id: s.id,
      name: s.name,
      grade: s.grade,
      totalMerits,
      totalDemerits,
      netPoints: totalMerits - totalDemerits,
    };
  });
}
