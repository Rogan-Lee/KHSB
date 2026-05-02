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

  const [mentors, consultants, staffs, feedbackPendingCount] = await Promise.all([
    canManage
      ? prisma.user.findMany({
          // 관리 멘토: MANAGER_MENTOR 외에도 멘토/운영조교/총괄멘토(/원장/SA) 도 배정 가능
          where: { role: { in: ["MANAGER_MENTOR", "MENTOR", "STAFF", "HEAD_MENTOR", "DIRECTOR", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          where: { role: { in: ["CONSULTANT", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          where: { role: { in: ["STAFF", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    // 최신 제출물이 있지만 피드백이 없는 task 수
    prisma.performanceTask.count({
      where: {
        studentId: id,
        status: { not: "DONE" },
        submissions: {
          some: {
            feedbacks: { none: {} },
          },
        },
      },
    }),
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NavCard
          href={`/online/students/${student.id}/survey`}
          title="초기 설문"
          description="학습 이력 · 목표 · 강점/약점 확인"
        />
        <NavCard
          href={`/online/students/${student.id}/tasks`}
          title="수행평가 일정"
          description="과제 등록 · 마감 관리 · 상태 변경"
          badge={
            feedbackPendingCount > 0
              ? { label: `피드백 ${feedbackPendingCount}건 대기`, tone: "amber" }
              : undefined
          }
        />
        <NavCard
          href={`/online/students/${student.id}/progress`}
          title="과목별 진도"
          description="과목별 현재 위치 · 주간 진행률 · 이슈"
        />
        <NavCard
          href={`/online/students/${student.id}/plans`}
          title="주간 계획"
          description="주 단위 과목별 목표 · 예상 학습시간 · 회고"
        />
        <NavCard
          href={`/online/students/${student.id}/monthly`}
          title="월간 계획"
          description="월간 마일스톤 · 과목별 월간 목표 · 회고"
        />
        <NavCard
          href={`/online/students/${student.id}/daily-log`}
          title="카톡 일일 보고"
          description="관리멘토 일일 대화 요약 · 태그 · 학부모 공개 여부"
        />
        <NavCard
          href={`/online/students/${student.id}/portfolio`}
          title="포트폴리오"
          description="완료된 수행평가 결과물 · 점수 · 총평 · 학부모 보고서 포함 플래그"
        />
      </div>

      {canManage && (
        <section className="rounded-[12px] border border-line bg-panel p-4">
          <h2 className="text-[13px] font-semibold text-ink mb-3">담당자</h2>
          <ReassignOnlineStudentForm
            staffs={staffs}
            currentStaffId={student.assignedStaffId}
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

function NavCard({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge?: { label: string; tone: "amber" | "emerald" | "slate" };
}) {
  const toneClass =
    badge?.tone === "amber"
      ? "bg-amber-100 text-amber-900 border-amber-300"
      : badge?.tone === "emerald"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  const cardClass = badge?.tone === "amber"
    ? "border-amber-300 hover:border-amber-400 bg-amber-50/30"
    : "border-line hover:border-line-strong bg-panel";
  return (
    <Link
      href={href}
      className={`block rounded-[12px] border p-4 transition-colors ${cardClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
            {badge && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${toneClass}`}
              >
                {badge.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-ink-4">{description}</p>
        </div>
        <ChevronLeft className="h-4 w-4 text-ink-4 rotate-180 shrink-0" />
      </div>
    </Link>
  );
}
