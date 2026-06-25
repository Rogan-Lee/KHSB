import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { WaitlistAdmin } from "@/components/waitlist/waitlist-admin";

export const dynamic = "force-dynamic";

export default async function WaitlistAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const [branches, entries, grouped] = await Promise.all([
    prisma.branch.findMany({
      orderBy: { sortOrder: "asc" },
      include: { programs: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.waitlist.findMany({
      orderBy: { createdAt: "asc" },
      include: { branch: { select: { name: true } }, program: { select: { name: true } } },
    }),
    prisma.waitlist.groupBy({
      by: ["branchId", "programId", "status"],
      _count: { _all: true },
    }),
  ]);

  // 정원 집계: 지점별 / 프로그램별 등록(ENROLLED)·대기(WAITING) 수
  const branchEnrolled = new Map<string, number>();
  const branchWaiting = new Map<string, number>();
  const programEnrolled = new Map<string, number>();
  const programWaiting = new Map<string, number>();
  for (const g of grouped) {
    const n = g._count._all;
    if (g.status === "ENROLLED") {
      branchEnrolled.set(g.branchId, (branchEnrolled.get(g.branchId) ?? 0) + n);
      if (g.programId) programEnrolled.set(g.programId, (programEnrolled.get(g.programId) ?? 0) + n);
    } else if (g.status === "WAITING") {
      branchWaiting.set(g.branchId, (branchWaiting.get(g.branchId) ?? 0) + n);
      if (g.programId) programWaiting.set(g.programId, (programWaiting.get(g.programId) ?? 0) + n);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-brand" />
        <h1 className="text-xl font-bold tracking-tight">대기자 관리</h1>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        공개 신청 링크(<code>/apply</code>)로 등록된 대기자를 관리하고, 지점·프로그램·정원을 설정합니다.
      </p>

      <WaitlistAdmin
        branches={branches.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          waitStatus: b.waitStatus,
          notice: b.notice,
          isActive: b.isActive,
          capacity: b.capacity,
          enrolled: branchEnrolled.get(b.id) ?? 0,
          waiting: branchWaiting.get(b.id) ?? 0,
          programs: b.programs.map((p) => ({
            id: p.id,
            name: p.name,
            isActive: p.isActive,
            capacity: p.capacity,
            enrolled: programEnrolled.get(p.id) ?? 0,
            waiting: programWaiting.get(p.id) ?? 0,
          })),
        }))}
        entries={entries.map((e) => ({
          id: e.id,
          name: e.name,
          phone: e.phone,
          branchId: e.branchId,
          branchName: e.branch.name,
          programId: e.programId,
          programName: e.program?.name ?? null,
          gender: e.gender,
          gradeType: e.gradeType,
          status: e.status,
          note: e.note,
          cancelReason: e.cancelReason,
          guideToken: e.guideToken,
          guideContent: e.guideContent,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
