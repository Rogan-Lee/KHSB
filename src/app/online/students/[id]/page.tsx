import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess, isOnlineStaff } from "@/lib/roles";
import { ReassignOnlineStudentForm } from "@/components/online/reassign-online-student-form";
import { MagicLinkManager } from "@/components/online/magic-link-manager";
import { DescriptionList, Section } from "@/components/backoffice/ui";
import { StudentDetailHeader } from "./_components/student-detail-header";

export default async function OnlineStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  // 온라인 학생 상세는 온라인 직원 전용 (레이아웃은 전 직원 허용으로 완화됨)
  if (!isOnlineStaff(user?.role)) redirect("/");
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
          // 관리 멘토 picker — 퇴사자 제외
          // MANAGER_MENTOR 외에도 멘토/운영조교/총괄멘토(/원장/SA) 도 배정 가능
          where: { status: "ACTIVE", role: { in: ["MANAGER_MENTOR", "MENTOR", "STAFF", "HEAD_MENTOR", "DIRECTOR", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          // 컨설턴트 picker — 퇴사자 제외
          where: { status: "ACTIVE", role: { in: ["CONSULTANT", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          // 운영조교 picker — 퇴사자 제외
          where: { status: "ACTIVE", role: { in: ["STAFF", "SUPER_ADMIN"] } },
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
  const activeLinks = toActiveLinks(student.magicLinks);

  const empty = <span className="text-fg-placeholder">—</span>;

  return (
    <div>
      <StudentDetailHeader
        student={student}
        current="overview"
        counts={{ tasks: feedbackPendingCount }}
        description={
          <>
            {student.grade} · {student.school ?? "학교 미등록"}
            {student.onlineStartedAt && (
              <span className="tabular-nums">
                {" · 온라인 시작일 "}
                {student.onlineStartedAt.toLocaleDateString("ko-KR")}
              </span>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-x6">
        {feedbackPendingCount > 0 && (
          <Link
            href={`/online/students/${student.id}/tasks`}
            className="flex items-center gap-x3 rounded-r3 bg-bg-warning-weak px-x4 py-x3_5 transition-opacity hover:opacity-90"
          >
            <ClipboardCheck className="size-5 shrink-0 text-fg-warning" aria-hidden />
            <span className="min-w-0 flex-1 t4-medium text-fg-neutral">
              피드백을 기다리는 수행평가가 <span className="tabular-nums">{feedbackPendingCount}</span>건 있어요
            </span>
            <span className="shrink-0 t4-bold text-fg-neutral">확인하기</span>
          </Link>
        )}

        <Section title="기본 정보">
          <DescriptionList
            cols={2}
            items={[
              {
                label: "학부모 연락처",
                value: student.parentPhone ? <span className="tabular-nums">{student.parentPhone}</span> : empty,
              },
              { label: "목표 대학", value: student.targetUniversity || empty },
              { label: "선택 과목", value: student.selectedSubjects || empty },
              { label: "전형", value: student.admissionType || empty },
            ]}
          />
        </Section>

        {canManage ? (
          <Section title="담당자" description="관리 멘토·컨설턴트·운영조교를 바꾸거나 온라인 관리를 해제해요">
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
          </Section>
        ) : (
          <Section title="담당자">
            <DescriptionList
              cols={2}
              items={[
                { label: "관리 멘토", value: student.assignedMentor?.name ?? "미배정" },
                { label: "컨설턴트", value: student.assignedConsultant?.name ?? "미배정" },
              ]}
            />
          </Section>
        )}

        {canManage && (
          <Section
            title="매직링크"
            description="학생 포털에 로그인 없이 들어가는 전용 링크예요"
          >
            <MagicLinkManager
              studentId={student.id}
              studentName={student.name}
              initialLinks={activeLinks}
              portalOrigin={portalOrigin}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

/** 아직 만료되지 않은 링크만 직렬화 — 렌더 밖 헬퍼(Date.now 는 순수하지 않음) */
function toActiveLinks(
  links: {
    id: string;
    token: string;
    expiresAt: Date;
    issuedAt: Date;
    lastAccessedAt: Date | null;
    accessCount: number;
  }[],
) {
  const now = Date.now();
  return links
    .filter((l) => l.expiresAt.getTime() > now)
    .map((l) => ({
      id: l.id,
      token: l.token,
      expiresAt: l.expiresAt.toISOString(),
      issuedAt: l.issuedAt.toISOString(),
      lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
      accessCount: l.accessCount,
    }));
}
