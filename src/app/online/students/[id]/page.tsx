import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { ReassignOnlineStudentForm } from "@/components/online/reassign-online-student-form";
import { MagicLinkManager } from "@/components/online/magic-link-manager";
import { ChevronLeft } from "lucide-react";

export default async function OnlineStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const canManage = isFullAccess(user?.role);

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      assignedMentor: { select: { id: true, name: true } },
      assignedConsultant: { select: { id: true, name: true } },
      magicLinks: {
        where: { revokedAt: null },
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  if (!student || !student.isOnlineManaged) notFound();

  const [mentors, consultants] = await Promise.all([
    canManage
      ? prisma.user.findMany({
          where: { role: "MANAGER_MENTOR" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          where: { role: "CONSULTANT" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const portalOrigin = `${proto}://${host}`;

  // 만료 임박 링크도 포함해 전부 표시 (활성 = revokedAt null)
  const activeLinks = student.magicLinks
    .filter((l) => l.expiresAt.getTime() > Date.now())
    .map((l) => ({
      id: l.id,
      token: l.token,
      expiresAt: l.expiresAt.toISOString(),
      issuedAt: l.issuedAt.toISOString(),
      lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
      accessCount: l.accessCount,
    }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/online/students"
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          온라인 학생 목록
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          {student.name}
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {student.grade} · {student.school ?? "학교 미등록"}
          {student.onlineStartedAt && (
            <>
              {" · 온라인 시작일 "}
              {student.onlineStartedAt.toLocaleDateString("ko-KR")}
            </>
          )}
        </p>
      </header>

      <section className="rounded-[12px] border border-line bg-panel p-4">
        <h2 className="text-[13px] font-semibold text-ink mb-3">기본 정보</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
          <InfoRow label="학부모 연락처" value={student.parentPhone} />
          <InfoRow label="목표 대학" value={student.targetUniversity} />
          <InfoRow label="선택 과목" value={student.selectedSubjects} />
          <InfoRow label="전형" value={student.admissionType} />
        </dl>
      </section>

      <Link
        href={`/online/students/${student.id}/survey`}
        className="block rounded-[12px] border border-line bg-panel p-4 hover:border-line-strong transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-ink">초기 설문</h2>
            <p className="mt-0.5 text-[12px] text-ink-4">
              학생이 작성한 학습 이력 · 목표 · 강점/약점 등을 확인합니다.
            </p>
          </div>
          <ChevronLeft className="h-4 w-4 text-ink-4 rotate-180" />
        </div>
      </Link>

      {canManage && (
        <section className="rounded-[12px] border border-line bg-panel p-4">
          <h2 className="text-[13px] font-semibold text-ink mb-3">담당자</h2>
          <ReassignOnlineStudentForm
            studentId={student.id}
            studentName={student.name}
            currentMentorId={student.assignedMentorId}
            currentConsultantId={student.assignedConsultantId}
            mentors={mentors}
            consultants={consultants}
          />
        </section>
      )}

      {!canManage && (
        <section className="rounded-[12px] border border-line bg-panel p-4 text-[12.5px] text-ink-3">
          <h2 className="text-[13px] font-semibold text-ink mb-2">담당자</h2>
          <p>관리 멘토: {student.assignedMentor?.name ?? "미배정"}</p>
          <p>컨설턴트: {student.assignedConsultant?.name ?? "미배정"}</p>
        </section>
      )}

      {canManage && (
        <section className="rounded-[12px] border border-line bg-panel p-4">
          <h2 className="text-[13px] font-semibold text-ink mb-3">매직링크</h2>
          <MagicLinkManager
            studentId={student.id}
            studentName={student.name}
            initialLinks={activeLinks}
            portalOrigin={portalOrigin}
          />
        </section>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-4">{label}</dt>
      <dd className="text-ink">
        {value ? value : <span className="text-ink-5">—</span>}
      </dd>
    </div>
  );
}
