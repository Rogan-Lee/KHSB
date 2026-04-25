"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Link2,
  Users,
  ClipboardList,
  CalendarDays,
  CalendarRange,
  MessageSquare,
  FolderOpen,
  FileQuestion,
  ChevronRight,
} from "lucide-react";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import { ReassignOnlineStudentForm } from "@/components/online/reassign-online-student-form";
import { MagicLinkManager } from "@/components/online/magic-link-manager";

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
  onlineStartedAt: string | null;
  parentPhone: string;
  parentEmail: string | null;
  targetUniversity: string | null;
  selectedSubjects: string | null;
  admissionType: string | null;
  assignedMentorId: string | null;
  assignedConsultantId: string | null;
  assignedMentorName: string | null;
  assignedConsultantName: string | null;
  activeLinks: OnlineStudentPanelMagicLink[];
  pendingFeedbackCount: number;
};

export type AssignableUser = { id: string; name: string };

// ─────────────── 메인 컴포넌트 ───────────────

export function OnlineStudentsPanel({
  rows,
  mentors,
  consultants,
  portalOrigin,
  canManage,
}: {
  rows: OnlineStudentPanelRow[];
  mentors: AssignableUser[];
  consultants: AssignableUser[];
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
    <div className="space-y-3">
      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
        rightSlot={
          <span className="text-[11px] text-ink-5 tabular-nums">
            {filteredRows.length} / {rows.length}명
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측 학생 리스트 */}
        <aside className="border border-line rounded-lg bg-panel overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-line text-[11px] text-ink-5 flex items-center justify-between">
            <span>학생을 선택하세요</span>
            <span className="tabular-nums">총 {filteredRows.length}명</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-line max-h-[680px]">
            {filteredRows.length === 0 ? (
              <p className="p-4 text-center text-xs text-ink-5">
                조건에 맞는 학생이 없습니다
              </p>
            ) : (
              filteredRows.map((r) => {
                const isActive = activeStudentId === r.studentId;
                const hasLink = r.activeLinks.length > 0;
                return (
                  <button
                    type="button"
                    key={r.studentId}
                    onClick={() => setActiveStudentId(r.studentId)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-l-2 transition-colors block",
                      isActive
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-canvas-2/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] text-ink truncate">
                        {r.studentName}
                      </span>
                      <span className="text-[10.5px] text-ink-5">{r.grade}</span>
                      {r.pendingFeedbackCount > 0 && (
                        <span
                          className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-px text-[10px] font-bold"
                          title={`피드백 작성 필요 ${r.pendingFeedbackCount}건`}
                        >
                          💬 {r.pendingFeedbackCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10.5px] text-ink-5 flex items-center gap-1.5 flex-wrap">
                      {r.school ? (
                        <span className="truncate">{r.school}</span>
                      ) : (
                        <span className="text-ink-5">학교 미입력</span>
                      )}
                      <span>·</span>
                      <span>
                        멘토 {r.assignedMentorName ?? <span className="text-amber-700">미배정</span>}
                      </span>
                      {hasLink ? (
                        <span className="text-emerald-600 inline-flex items-center gap-0.5">
                          <Link2 className="h-2.5 w-2.5" /> 활성
                        </span>
                      ) : (
                        <span className="text-ink-5">링크 없음</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* 우측 학생 상세 */}
        <main className="border border-line rounded-lg bg-panel flex flex-col min-h-[600px]">
          {!activeRow ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-5">
              좌측에서 학생을 선택하세요
            </div>
          ) : (
            <StudentDetailPane
              row={activeRow}
              mentors={mentors}
              consultants={consultants}
              portalOrigin={portalOrigin}
              canManage={canManage}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ─────────────── 학생 상세 영역 ───────────────

function StudentDetailPane({
  row,
  mentors,
  consultants,
  portalOrigin,
  canManage,
}: {
  row: OnlineStudentPanelRow;
  mentors: AssignableUser[];
  consultants: AssignableUser[];
  portalOrigin: string;
  canManage: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col">
      {/* 헤더 */}
      <div className="px-5 py-3 border-b border-line flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base text-ink">{row.studentName}</h3>
            <span className="text-xs text-ink-5">{row.grade}</span>
            {row.school && (
              <span className="text-xs text-ink-5">· {row.school}</span>
            )}
          </div>
          <p className="text-[11px] text-ink-5 mt-0.5">
            {row.onlineStartedAt
              ? `온라인 시작: ${new Date(row.onlineStartedAt).toLocaleDateString("ko-KR")}`
              : "온라인 시작일 미기록"}
            {row.pendingFeedbackCount > 0 && (
              <span className="ml-1.5 text-amber-700 font-medium">
                · 수행평가 피드백 {row.pendingFeedbackCount}건 작성 필요
              </span>
            )}
          </p>
        </div>
        <Link
          href={`/online/students/${row.studentId}`}
          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:border-line-strong"
          title="이 학생 전용 상세 페이지로 이동"
        >
          <ExternalLink className="h-3 w-3" />
          상세 페이지
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 기본 정보 */}
        <section className="rounded-[12px] border border-line bg-canvas p-4">
          <h4 className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide mb-3">
            기본 정보
          </h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
            <InfoRow label="학부모 연락처" value={row.parentPhone} />
            <InfoRow label="학부모 이메일" value={row.parentEmail} />
            <InfoRow label="목표 대학" value={row.targetUniversity} />
            <InfoRow label="전형" value={row.admissionType} />
            <InfoRow label="선택 과목" value={row.selectedSubjects} className="md:col-span-4" />
          </dl>
          <p className="mt-3 text-[11px] text-ink-5">
            기본 정보 편집은 오프라인 학생 페이지에서 진행합니다.
          </p>
        </section>

        {/* 담당자 */}
        <section className="rounded-[12px] border border-line bg-canvas p-4">
          <h4 className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            담당자
          </h4>
          {canManage ? (
            <ReassignOnlineStudentForm
              studentId={row.studentId}
              studentName={row.studentName}
              currentMentorId={row.assignedMentorId}
              currentConsultantId={row.assignedConsultantId}
              mentors={mentors}
              consultants={consultants}
            />
          ) : (
            <div className="text-[12.5px] text-ink-3 space-y-1">
              <p>관리 멘토: {row.assignedMentorName ?? "미배정"}</p>
              <p>컨설턴트: {row.assignedConsultantName ?? "미배정"}</p>
            </div>
          )}
        </section>

        {/* 매직링크 */}
        {canManage && (
          <section className="rounded-[12px] border border-line bg-canvas p-4">
            <h4 className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              매직링크
            </h4>
            <MagicLinkManager
              studentId={row.studentId}
              studentName={row.studentName}
              initialLinks={row.activeLinks}
              portalOrigin={portalOrigin}
            />
          </section>
        )}

        {/* 빠른 진입 */}
        <section>
          <h4 className="text-[12px] font-semibold text-ink-3 uppercase tracking-wide mb-2">
            빠른 진입
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <QuickLink
              href={`/online/students/${row.studentId}/survey`}
              icon={<FileQuestion className="h-3.5 w-3.5" />}
              label="초기 설문"
              hint="이력 · 목표 · 강점/약점"
            />
            <QuickLink
              href={`/online/students/${row.studentId}/tasks`}
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="수행평가"
              hint="등록 · 마감 · 상태"
              badge={
                row.pendingFeedbackCount > 0
                  ? `피드백 ${row.pendingFeedbackCount}건 대기`
                  : undefined
              }
            />
            <QuickLink
              href={`/online/students/${row.studentId}/progress`}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label="과목별 진도"
              hint="현재 위치 · 주간 진행"
            />
            <QuickLink
              href={`/online/students/${row.studentId}/plans`}
              icon={<CalendarRange className="h-3.5 w-3.5" />}
              label="주간 계획"
              hint="과목별 목표 · 회고"
            />
            <QuickLink
              href={`/online/students/${row.studentId}/monthly`}
              icon={<CalendarRange className="h-3.5 w-3.5" />}
              label="월간 계획"
              hint="마일스톤 · 회고"
            />
            <QuickLink
              href={`/online/students/${row.studentId}/daily-log`}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="카톡 일일 보고"
              hint="대화 요약 · 태그"
            />
            <QuickLink
              href={`/online/students/${row.studentId}/portfolio`}
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="포트폴리오"
              hint="결과물 · 점수 · 보고서"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────── 헬퍼들 ───────────────

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] text-ink-4">{label}</dt>
      <dd className="text-[12.5px] text-ink mt-0.5">
        {value ? value : <span className="text-ink-5">—</span>}
      </dd>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-[10px] border bg-canvas px-3 py-2.5 transition-colors",
        badge
          ? "border-amber-300 hover:border-amber-400 bg-amber-50/40"
          : "border-line hover:border-line-strong"
      )}
    >
      <div
        className={cn(
          "grid place-items-center w-7 h-7 rounded-md shrink-0",
          badge ? "bg-amber-100 text-amber-700" : "bg-canvas-2 text-ink-4"
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] font-medium text-ink">{label}</span>
          {badge && (
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 text-amber-900 px-1.5 py-px text-[10px] font-semibold">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-5 truncate">{hint}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-ink-4 shrink-0" />
    </Link>
  );
}
