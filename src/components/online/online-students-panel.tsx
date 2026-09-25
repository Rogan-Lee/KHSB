"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileQuestion,
  FolderOpen,
  Link2,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
  UserCheck,
  UserMinus,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DescriptionList, ListItem, StatusBadge } from "@/components/backoffice/ui";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import {
  DetailPane,
  DetailPaneEmpty,
  DetailPaneHeader,
  MasterDetail,
  PaneSection,
  PickerCount,
  PickerItem,
  PickerList,
} from "@/components/online/student-picker";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";
import { ReassignOnlineStudentForm } from "@/components/online/reassign-online-student-form";
import { MagicLinkManager } from "@/components/online/magic-link-manager";
import {
  MentoringSessionsSection,
  type MentoringSessionRow,
} from "@/components/online/mentoring-sessions-section";
import { OnlineStudentEditDialog } from "@/components/online/online-student-edit-dialog";
import {
  deleteOnlineStudent,
  withdrawOnlineStudent,
  readmitOnlineStudent,
} from "@/actions/online/students";

// ─────────────── 데이터 타입 ───────────────

export type OnlineStudentPanelMagicLink = {
  id: string;
  token: string;
  expiresAt: string;
  issuedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
};

export type OnlineStudentPanelRow = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  status: "ACTIVE" | "INACTIVE" | "GRADUATED" | "WITHDRAWN";
  onlineStartedAt: string | null;
  parentPhone: string;
  parentEmail: string | null;
  targetUniversity: string | null;
  selectedSubjects: string | null;
  admissionType: string | null;
  assignedMentorId: string | null;
  assignedConsultantId: string | null;
  assignedStaffId: string | null;
  assignedMentorName: string | null;
  assignedConsultantName: string | null;
  assignedStaffName: string | null;
  activeLinks: OnlineStudentPanelMagicLink[];
  pendingFeedbackCount: number;
  upcomingSessionCount: number;
  mentoringSessions: MentoringSessionRow[];
};

export type AssignableUser = { id: string; name: string };

// ─────────────── 메인 컴포넌트 ───────────────

export function OnlineStudentsPanel({
  rows,
  mentors,
  consultants,
  staffs,
  portalOrigin,
  canManage,
}: {
  rows: OnlineStudentPanelRow[];
  mentors: AssignableUser[];
  consultants: AssignableUser[];
  staffs: AssignableUser[];
  portalOrigin: string;
  canManage: boolean;
}) {
  const [filter, setFilter] = useState<StudentFilterState>(defaultFilterState);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(
    rows[0]?.studentId ?? null
  );

  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);
  const filteredRows = useMemo(
    () => rows.filter((r) => matchesStudentFilter(r, filter)),
    [rows, filter]
  );
  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  return (
    <div className="flex flex-col gap-x4">
      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
        rightSlot={<PickerCount shown={filteredRows.length} total={rows.length} />}
      />

      <MasterDetail
        list={
          <PickerList
            header={
              <>
                <span>학생을 선택하세요</span>
                <span className="tabular-nums">{filteredRows.length}명</span>
              </>
            }
            isEmpty={filteredRows.length === 0}
          >
            {filteredRows.map((r) => {
              const hasLink = r.activeLinks.length > 0;
              const withdrawn = r.status === "WITHDRAWN";
              return (
                <PickerItem
                  key={r.studentId}
                  active={activeStudentId === r.studentId}
                  onClick={() => setActiveStudentId(r.studentId)}
                  name={r.studentName}
                  grade={r.grade}
                  muted={withdrawn}
                  badges={
                    <>
                      {withdrawn && <StatusBadge tone="gray">퇴원</StatusBadge>}
                      {r.upcomingSessionCount > 0 && (
                        <StatusBadge tone="info">
                          <span className="inline-flex items-center gap-x0_5" title={`예정된 화상 세션 ${r.upcomingSessionCount}건`}>
                            <Video aria-hidden />
                            {r.upcomingSessionCount}
                          </span>
                        </StatusBadge>
                      )}
                      {r.pendingFeedbackCount > 0 && (
                        <StatusBadge tone="warn">
                          <span title={`피드백 작성 필요 ${r.pendingFeedbackCount}건`}>
                            피드백 {r.pendingFeedbackCount}
                          </span>
                        </StatusBadge>
                      )}
                    </>
                  }
                  description={
                    <>
                      <span className="truncate">{r.school ?? "학교 미입력"}</span>
                      <span aria-hidden>·</span>
                      <span>
                        멘토{" "}
                        {r.assignedMentorName ?? <span className="text-fg-warning">미배정</span>}
                      </span>
                      <span aria-hidden>·</span>
                      {hasLink ? (
                        <span className="inline-flex items-center gap-x0_5 text-fg-positive">
                          <Link2 className="size-3" aria-hidden /> 링크 활성
                        </span>
                      ) : (
                        <span>링크 없음</span>
                      )}
                    </>
                  }
                />
              );
            })}
          </PickerList>
        }
        detail={
          <DetailPane>
            {!activeRow ? (
              <DetailPaneEmpty />
            ) : (
              <StudentDetailPane
                key={activeRow.studentId}
                row={activeRow}
                mentors={mentors}
                consultants={consultants}
                staffs={staffs}
                portalOrigin={portalOrigin}
                canManage={canManage}
              />
            )}
          </DetailPane>
        }
      />
    </div>
  );
}

// ─────────────── 학생 상세 영역 ───────────────

function StudentDetailPane({
  row,
  mentors,
  consultants,
  staffs,
  portalOrigin,
  canManage,
}: {
  row: OnlineStudentPanelRow;
  mentors: AssignableUser[];
  consultants: AssignableUser[];
  staffs: AssignableUser[];
  portalOrigin: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"withdraw" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const withdrawn = row.status === "WITHDRAWN";

  function handleWithdraw() {
    setConfirm(null);
    startTransition(async () => {
      try {
        await withdrawOnlineStudent(row.studentId);
        toast.success("퇴원 처리되었습니다");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "퇴원 실패");
      }
    });
  }

  function handleReadmit() {
    startTransition(async () => {
      try {
        await readmitOnlineStudent(row.studentId);
        toast.success("재원 처리되었습니다");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "재원 실패");
      }
    });
  }

  function handleDelete() {
    setConfirm(null);
    startTransition(async () => {
      try {
        await deleteOnlineStudent(row.studentId);
        toast.success("삭제되었습니다");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  const base = `/online/students/${row.studentId}`;

  return (
    <>
      <DetailPaneHeader
        title={<span className={withdrawn ? "text-fg-neutral-subtle line-through" : undefined}>{row.studentName}</span>}
        meta={withdrawn ? <StatusBadge tone="gray">퇴원</StatusBadge> : undefined}
        description={
          <>
            <span>{row.grade}</span>
            {row.school && (
              <>
                <span aria-hidden>·</span>
                <span>{row.school}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {row.onlineStartedAt
                ? `온라인 시작 ${new Date(row.onlineStartedAt).toLocaleDateString("ko-KR")}`
                : "온라인 시작일 미기록"}
            </span>
            {row.pendingFeedbackCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="t3-medium text-fg-warning">
                  수행평가 피드백 {row.pendingFeedbackCount}건 작성 필요
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            {canManage && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={pending}>
                  <Pencil />
                  수정
                </Button>
                {withdrawn ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleReadmit} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <UserCheck />}
                    재원
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("withdraw")} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <UserMinus />}
                    퇴원
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-fg-critical"
                  onClick={() => setConfirm("delete")}
                  disabled={pending}
                  aria-label="학생 삭제"
                  title="삭제"
                >
                  <Trash2 />
                </Button>
              </>
            )}
            <Button asChild variant="secondary" size="sm">
              <Link href={base} title="이 학생 전용 상세 페이지로 이동">
                상세 페이지
                <ArrowUpRight />
              </Link>
            </Button>
          </>
        }
      />

      {editOpen && (
        <OnlineStudentEditDialog
          row={row}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm === "withdraw"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`${row.studentName} 학생을 퇴원 처리할까요?`}
        description="매직링크가 모두 무효화돼요. 퇴원 후에도 '재원'으로 되돌릴 수 있어요."
        confirmLabel="퇴원 처리"
        destructive
        pending={pending}
        onConfirm={handleWithdraw}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`${row.studentName} 학생을 영구 삭제할까요?`}
        description="매직링크·제출·피드백 등 관련 데이터가 모두 삭제되고 되돌릴 수 없어요."
        confirmLabel="영구 삭제"
        destructive
        pending={pending}
        onConfirm={handleDelete}
      />

      {/* 기본 정보 */}
      <PaneSection title="기본 정보" description="기본 정보 편집은 오프라인 학생 페이지에서 진행해요">
        <DescriptionList
          cols={2}
          items={[
            { label: "학부모 연락처", value: <InfoValue value={row.parentPhone} tabular /> },
            { label: "학부모 이메일", value: <InfoValue value={row.parentEmail} /> },
            { label: "목표 대학", value: <InfoValue value={row.targetUniversity} /> },
            { label: "전형", value: <InfoValue value={row.admissionType} /> },
            { label: "선택 과목", value: <InfoValue value={row.selectedSubjects} />, full: true },
          ]}
        />
      </PaneSection>

      {/* 담당자 */}
      <PaneSection title="담당자">
        {canManage ? (
          <ReassignOnlineStudentForm
            studentId={row.studentId}
            studentName={row.studentName}
            currentMentorId={row.assignedMentorId}
            currentConsultantId={row.assignedConsultantId}
            currentStaffId={row.assignedStaffId}
            mentors={mentors}
            consultants={consultants}
            staffs={staffs}
          />
        ) : (
          <DescriptionList
            cols={3}
            items={[
              { label: "관리 멘토", value: <InfoValue value={row.assignedMentorName} empty="미배정" /> },
              { label: "컨설턴트", value: <InfoValue value={row.assignedConsultantName} empty="미배정" /> },
              { label: "운영조교", value: <InfoValue value={row.assignedStaffName} empty="미배정" /> },
            ]}
          />
        )}
      </PaneSection>

      {/* 매직링크 */}
      {canManage && (
        <PaneSection title="매직링크" description="학생 포털에 로그인 없이 들어가는 전용 링크예요">
          <MagicLinkManager
            studentId={row.studentId}
            studentName={row.studentName}
            initialLinks={row.activeLinks}
            portalOrigin={portalOrigin}
          />
        </PaneSection>
      )}

      {/* 화상 1:1 세션 */}
      <PaneSection
        title="화상 1:1 세션"
        actions={
          row.upcomingSessionCount > 0 ? (
            <StatusBadge tone="info">예정 {row.upcomingSessionCount}</StatusBadge>
          ) : undefined
        }
      >
        <MentoringSessionsSection studentId={row.studentId} sessions={row.mentoringSessions} />
      </PaneSection>

      {/* 하위 화면 바로 가기 */}
      <PaneSection title="바로 가기">
        <ul className="-mx-5 -mb-2 grid grid-cols-1 md:grid-cols-2">
          <QuickLink href={`${base}/survey`} icon={FileQuestion} label="초기 설문" hint="이력 · 목표 · 강점/약점" />
          <QuickLink
            href={`${base}/tasks`}
            icon={ClipboardList}
            label="수행평가"
            hint="등록 · 마감 · 상태"
            badge={row.pendingFeedbackCount > 0 ? `피드백 ${row.pendingFeedbackCount}건 대기` : undefined}
          />
          <QuickLink href={`${base}/progress`} icon={CalendarDays} label="과목별 진도" hint="현재 위치 · 주간 진행" />
          <QuickLink href={`${base}/plans`} icon={CalendarRange} label="주간 계획" hint="과목별 목표 · 회고" />
          <QuickLink href={`${base}/monthly`} icon={CalendarRange} label="월간 계획" hint="마일스톤 · 회고" />
          <QuickLink href={`${base}/daily-log`} icon={MessageSquare} label="카톡 일일 보고" hint="대화 요약 · 태그" />
          <QuickLink href={`${base}/portfolio`} icon={FolderOpen} label="포트폴리오" hint="결과물 · 점수 · 보고서" />
        </ul>
      </PaneSection>
    </>
  );
}

// ─────────────── 헬퍼들 ───────────────

function InfoValue({
  value,
  empty = "—",
  tabular = false,
}: {
  value: string | null;
  empty?: string;
  tabular?: boolean;
}) {
  if (!value) return <span className="text-fg-placeholder">{empty}</span>;
  return <span className={tabular ? "tabular-nums" : undefined}>{value}</span>;
}

function QuickLink({
  href,
  icon: Icon,
  label,
  hint,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  badge?: string;
}) {
  return (
    <li>
      <ListItem
        href={href}
        leading={
          <span className="grid size-x8 shrink-0 place-items-center rounded-r2 bg-bg-neutral-weak text-fg-neutral-muted">
            <Icon className="size-4" />
          </span>
        }
        title={label}
        description={hint}
        trailing={badge ? <StatusBadge tone="warn">{badge}</StatusBadge> : undefined}
      />
    </li>
  );
}
