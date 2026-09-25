"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  DescriptionList,
  EmptyState,
  FormActions,
  FormField,
  PageHeader,
  SearchField,
  Section,
  Segmented,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import {
  Trash2, Plus, Pencil, UserMinus, UserCheck, ChevronLeft, ChevronRight,
  FileText, Users, Phone, SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimePickerInput } from "@/components/ui/time-picker";
import {
  createMentor,
  updateMentor,
  deleteMentor,
  saveMentorScheduleForMentor,
  deleteMentorScheduleById,
} from "@/actions/mentors";
import { StaffStatusDialog } from "@/components/admin/staff-status-dialog";
import { StaffMagicLinkPanel, type StaffMagicLinkRow } from "@/components/admin/staff-magic-link-panel";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { NativeSelect } from "@/components/admin/native-select";
import { ContractHistoryDialog } from "@/components/payroll/contract-history-dialog";
import type { MentorSchedule, User, PayrollContract } from "@/generated/prisma";

type MentorUser = Pick<User, "id" | "name" | "email" | "role" | "phone" | "status" | "terminationNote" | "terminatedAt">;

const DAYS = [
  { value: 0, label: "일", weekend: true },
  { value: 1, label: "월", weekend: false },
  { value: 2, label: "화", weekend: false },
  { value: 3, label: "수", weekend: false },
  { value: 4, label: "목", weekend: false },
  { value: 5, label: "금", weekend: false },
  { value: 6, label: "토", weekend: true },
];

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "시스템 관리자", DIRECTOR: "원장", HEAD_MENTOR: "총괄 멘토",
  STAFF: "운영조교", CONSULTANT: "컨설턴트", MANAGER_MENTOR: "관리 멘토", MENTOR: "멘토",
};

// 역할 배지 색 — 관리자급은 brand, 멘토 리드는 info, 온라인 컨설턴트는 violet
const ROLE_TONE: Record<string, Tone> = {
  SUPER_ADMIN: "brand", DIRECTOR: "brand", HEAD_MENTOR: "info", MANAGER_MENTOR: "info",
  CONSULTANT: "violet", MENTOR: "gray", STAFF: "gray",
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
function won(n: number) { return `${n.toLocaleString("ko-KR")}원`; }
function fmtWorkSchedule(days: number[], start: string | null, end: string | null): string | null {
  if (!days || days.length === 0 || !start || !end) return null;
  return `${[...days].sort((a, b) => a - b).map((d) => DOW[d]).join("·")} ${start}~${end}`;
}
function ymKst(d: Date) {
  const k = new Date(new Date(d).getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 이름 첫 글자 원 — 무채색 */
function Initial({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-bg-neutral-weak text-fg-neutral-muted",
        large ? "size-x14 t7-bold" : "size-x9 t4-bold",
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}

interface Props {
  mentors: MentorUser[];
  schedules: MentorSchedule[];
  linksByUser: Record<string, StaffMagicLinkRow[]>;
  contractsByUser: Record<string, PayrollContract[]>;
  currentUserId: string;
}

export function MentorManager({ mentors: initialMentors, schedules, linksByUser, contractsByUser, currentUserId }: Props) {
  const [mentors, setMentors] = useState(initialMentors);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "terminated">("active");
  const [statusDialogUser, setStatusDialogUser] = useState<MentorUser | null>(null);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MentorUser | null>(null);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Schedule edit state
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("14:00");
  const [editEnd, setEditEnd] = useState("18:00");

  const activeCount = mentors.filter((m) => m.status !== "TERMINATED").length;
  const terminatedCount = mentors.filter((m) => m.status === "TERMINATED").length;
  const visibleMentors = mentors.filter((m) =>
    statusFilter === "terminated" ? m.status === "TERMINATED" : m.status !== "TERMINATED",
  );
  // 목록 검색 — 이름·이메일·역할
  const q = query.trim().toLowerCase();
  const listedMentors = q
    ? visibleMentors.filter((m) =>
        `${m.name} ${m.email} ${ROLE_LABEL[m.role] ?? m.role}`.toLowerCase().includes(q),
      )
    : visibleMentors;
  const selected = useMemo(() => mentors.find((m) => m.id === selectedId) ?? null, [mentors, selectedId]);

  function switchFilter(key: "active" | "terminated") {
    setStatusFilter(key);
    setSelectedId(null);
    setEditing(false);
    setEditDay(null);
  }

  function selectStaff(id: string) {
    setSelectedId(id);
    setEditing(false);
    setEditDay(null);
  }

  function handleAddMentor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createMentor(formData);
        toast.success("직원이 등록되었습니다");
        setShowAddForm(false);
        window.location.reload();
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  function handleUpdateMentor(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateMentor(id, formData);
        toast.success("수정되었습니다");
        setEditing(false);
        window.location.reload();
      } catch {
        toast.error("수정 실패");
      }
    });
  }

  // 확인은 ConfirmDialog 에서 받는다 (window.confirm 대체)
  function handleDeleteMentor(id: string) {
    startTransition(async () => {
      try {
        await deleteMentor(id);
        setMentors((prev) => prev.filter((m) => m.id !== id));
        setSelectedId(null);
        setDeleteTarget(null);
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  function startEditSchedule(day: number) {
    if (!selected) return;
    const existing = schedules.find((s) => s.mentorId === selected.id && s.dayOfWeek === day);
    setEditStart(existing?.timeStart ?? "14:00");
    setEditEnd(existing?.timeEnd ?? "18:00");
    setEditDay(day);
  }

  function handleSaveSchedule() {
    if (!selected || editDay == null) return;
    const mentorId = selected.id;
    const day = editDay;
    startTransition(async () => {
      try {
        await saveMentorScheduleForMentor(mentorId, day, editStart, editEnd);
        toast.success("저장되었습니다");
        setEditDay(null);
        window.location.reload();
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function handleDeleteSchedule(id: string) {
    startTransition(async () => {
      try {
        await deleteMentorScheduleById(id);
        toast.success("삭제되었습니다");
        window.location.reload();
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const selectedContracts = selected ? (contractsByUser[selected.id] ?? []) : [];
  const activeContract = selectedContracts.find((c) => !c.effectiveTo) ?? null;
  const selectedSchedules = selected ? schedules.filter((s) => s.mentorId === selected.id) : [];
  const scheduleMap = new Map(selectedSchedules.map((s) => [s.dayOfWeek, s]));
  const selectedTerminated = selected?.status === "TERMINATED";

  return (
    <>
      <PageHeader
        title="직원 관리"
        description="직원 정보와 급여 계약, 주간 근무 일정, 순찰 링크를 한곳에서 관리해요."
        actions={
          <Button onClick={() => setShowAddForm(true)}>
            <Plus />
            직원 추가
          </Button>
        }
      />

      {/* 마스터-디테일 */}
      <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* 좌: 직원 목록 */}
        <aside className={cn(selected ? "hidden lg:block" : "block")} aria-label="직원 목록">
          <Section flush>
            <div className="flex flex-col gap-x3 border-b border-stroke-neutral-muted p-x4">
              <Segmented
                aria-label="재직 상태"
                value={statusFilter}
                onChange={switchFilter}
                options={[
                  { value: "active", label: <>재직 <span className="tabular-nums">{activeCount}</span></> },
                  { value: "terminated", label: <>퇴사 <span className="tabular-nums">{terminatedCount}</span></> },
                ]}
              />
              {visibleMentors.length > 0 && (
                <SearchField
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름·이메일·역할 검색"
                  aria-label="직원 검색"
                  className="sm:w-full"
                />
              )}
            </div>
            {visibleMentors.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title={statusFilter === "terminated" ? "퇴사 처리된 직원이 없어요" : "재직 중인 직원이 없어요"}
                description={statusFilter === "active" ? "오른쪽 위 ‘직원 추가’로 등록해 보세요." : undefined}
              />
            ) : listedMentors.length === 0 ? (
              <EmptyState compact icon={SearchX} title="일치하는 직원이 없어요" description="다른 검색어로 찾아보세요." />
            ) : (
              <ul className="flex flex-col py-x2">
                {listedMentors.map((m) => {
                  const isActive = selectedId === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => selectStaff(m.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-x3 px-x4 py-x2_5 text-left transition-colors",
                          isActive ? "bg-bg-transparent-selected" : "hover:bg-bg-transparent-pressed",
                        )}
                      >
                        <Initial name={m.name} />
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-fg-neutral", isActive ? "t4-bold" : "t4-medium")}>{m.name}</p>
                          <p className="truncate t3-regular text-fg-neutral-subtle">{ROLE_LABEL[m.role] ?? m.role}</p>
                        </div>
                        {m.status === "TERMINATED" && <StatusBadge tone="bad">퇴사</StatusBadge>}
                        <ChevronRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </aside>

        {/* 우: 선택 직원 상세 */}
        <div className={cn("min-w-0", selected ? "block" : "hidden lg:block")}>
          {!selected ? (
            <Section>
              <EmptyState
                icon={Users}
                title="직원을 선택하세요"
                description="왼쪽 목록에서 직원을 고르면 정보·계약·근무 일정을 볼 수 있어요."
              />
            </Section>
          ) : (
            <div className="flex flex-col gap-x4">
              {/* 헤더 */}
              <Section>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="-ml-1 mb-x4 inline-flex items-center gap-x1 rounded-r2 px-1 py-x0_5 t4-medium text-fg-neutral-subtle transition-colors hover:text-fg-neutral lg:hidden"
                >
                  <ChevronLeft className="size-4" aria-hidden /> 목록
                </button>
                <div className="flex flex-col gap-x4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-x4">
                    <Initial name={selected.name} large />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x2">
                        <h2 className="t7-bold text-fg-neutral">{selected.name}</h2>
                        <StatusBadge tone={ROLE_TONE[selected.role] ?? "gray"}>
                          {ROLE_LABEL[selected.role] ?? selected.role}
                        </StatusBadge>
                        {selectedTerminated && <StatusBadge tone="bad">퇴사</StatusBadge>}
                      </div>
                      <p className="mt-x1 break-all t4-regular text-fg-neutral-subtle">
                        {selected.email}{selected.phone ? ` · ${selected.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing((v) => !v)}
                      aria-expanded={editing}
                    >
                      <Pencil />
                      정보 수정
                    </Button>
                    {selected.id !== currentUserId && (
                      <Button variant="outline" size="sm" onClick={() => setStatusDialogUser(selected)}>
                        {selectedTerminated ? <UserCheck /> : <UserMinus />}
                        {selectedTerminated ? "활성 복귀" : "퇴사 처리"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-fg-critical"
                      onClick={() => setDeleteTarget(selected)}
                      disabled={isPending || selected.role === "DIRECTOR" || selected.role === "SUPER_ADMIN"}
                    >
                      <Trash2 />
                      삭제
                    </Button>
                  </div>
                </div>

                {editing && (
                  <form
                    onSubmit={(e) => handleUpdateMentor(selected.id, e)}
                    className="mt-x5 border-t border-stroke-neutral-muted pt-x5"
                  >
                    <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
                      <FormField label="이름" htmlFor="edit-name" required>
                        <Input id="edit-name" name="name" defaultValue={selected.name} required />
                      </FormField>
                      <FormField label="이메일" htmlFor="edit-email" required>
                        <Input id="edit-email" name="email" type="email" defaultValue={selected.email} required />
                      </FormField>
                      <FormField label="역할 (권한)" htmlFor="edit-role">
                        <NativeSelect id="edit-role" name="role" defaultValue={selected.role}>
                          <option value="STAFF">운영조교</option>
                          <option value="MENTOR">멘토</option>
                          <option value="HEAD_MENTOR">총괄 멘토</option>
                          <option value="CONSULTANT">컨설턴트</option>
                          <option value="MANAGER_MENTOR">관리 멘토</option>
                          <option value="DIRECTOR">원장</option>
                          <option value="SUPER_ADMIN">시스템 관리자</option>
                        </NativeSelect>
                      </FormField>
                      <FormField label="전화번호" htmlFor="edit-phone" hint="매직링크 본인 확인에 써요">
                        <Input
                          id="edit-phone"
                          name="phone"
                          type="tel"
                          defaultValue={selected.phone ?? ""}
                          placeholder="010-1234-5678"
                        />
                      </FormField>
                    </div>
                    <FormActions className="mt-x4">
                      <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                        취소
                      </Button>
                      <Button type="submit" disabled={isPending}>
                        {isPending ? "저장 중…" : "저장"}
                      </Button>
                    </FormActions>
                  </form>
                )}
              </Section>

              {/* 계약 내용 */}
              <Section
                title="급여 계약"
                actions={
                  <Button variant="outline" size="sm" onClick={() => setContractDialogOpen(true)}>
                    <FileText />
                    계약 관리
                  </Button>
                }
              >
                {activeContract ? (
                  <>
                    <DescriptionList
                      cols={3}
                      items={[
                        {
                          label: "시급",
                          value: <span className="t5-bold tabular-nums">{won(activeContract.hourlyRate)}</span>,
                        },
                        ...(activeContract.monthlySalary != null && activeContract.monthlySalary > 0
                          ? [{
                              label: "월 기본급",
                              value: <span className="t5-bold tabular-nums">{won(activeContract.monthlySalary)}</span>,
                            }]
                          : []),
                        {
                          label: "적용 시작",
                          value: <span className="tabular-nums">{ymKst(activeContract.effectiveFrom)}부터</span>,
                        },
                        { label: "주휴수당", value: activeContract.weeklyHolidayPay ? "지급" : "미지급" },
                        ...(activeContract.monthlyBonusKrw > 0
                          ? [{
                              label: "고정 수당",
                              value: <span className="tabular-nums">{won(activeContract.monthlyBonusKrw)}</span>,
                            }]
                          : []),
                        {
                          label: "근무",
                          value: fmtWorkSchedule(
                            activeContract.workDays,
                            activeContract.workStartTime,
                            activeContract.workEndTime,
                          ),
                        },
                      ]}
                    />
                    {selectedContracts.length > 1 && (
                      <p className="mt-x4 t3-regular text-fg-neutral-subtle">
                        이전 계약 <span className="tabular-nums">{selectedContracts.length - 1}</span>건은 계약 관리에서 볼 수 있어요.
                      </p>
                    )}
                  </>
                ) : (
                  <EmptyState
                    compact
                    icon={FileText}
                    title="등록된 계약이 없어요"
                    description="계약 관리에서 시급 계약을 등록하세요."
                    action={
                      <Button size="sm" onClick={() => setContractDialogOpen(true)}>
                        <Plus />
                        계약 등록
                      </Button>
                    }
                  />
                )}
              </Section>

              {/* 근무 일정 */}
              <Section title="주간 근무 일정" description="요일별 근무 시간을 등록해요." flush>
                <Table>
                  <TableBody>
                    {DAYS.map((d) => {
                      const sch = scheduleMap.get(d.value);
                      const isEditingThis = editDay === d.value;
                      return (
                        <TableRow key={d.value} className={cn(isEditingThis && "bg-bg-layer-fill hover:bg-bg-layer-fill")}>
                          <TableCell
                            className={cn(
                              "w-16 whitespace-nowrap pl-x5 t4-bold",
                              d.weekend ? "text-fg-critical" : "text-fg-neutral",
                            )}
                          >
                            {d.label}
                          </TableCell>
                          <TableCell>
                            {isEditingThis ? (
                              <div className="flex flex-wrap items-center gap-x2">
                                <TimePickerInput value={editStart} onChange={setEditStart} size="sm" />
                                <span className="t4-regular text-fg-neutral-subtle">~</span>
                                <TimePickerInput value={editEnd} onChange={setEditEnd} size="sm" />
                                <div className="flex items-center gap-x1">
                                  <Button size="sm" onClick={handleSaveSchedule} disabled={isPending}>
                                    {isPending ? "저장 중…" : "저장"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditDay(null)}>
                                    취소
                                  </Button>
                                </div>
                              </div>
                            ) : sch ? (
                              <span className="t4-medium tabular-nums text-fg-neutral">
                                {sch.timeStart} ~ {sch.timeEnd}
                              </span>
                            ) : (
                              <span className="t4-regular text-fg-placeholder">미등록</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap pr-x5 text-right">
                            {!isEditingThis && (
                              <div className="flex items-center justify-end gap-x1">
                                <Button size="sm" variant="ghost" onClick={() => startEditSchedule(d.value)}>
                                  {sch ? "수정" : "등록"}
                                </Button>
                                {sch && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDeleteSchedule(sch.id)}
                                    disabled={isPending}
                                    aria-label={`${d.label}요일 일정 삭제`}
                                    className="text-fg-neutral-subtle hover:text-fg-critical"
                                  >
                                    <Trash2 />
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Section>

              {/* 순찰 매직링크 (퇴사자 제외) */}
              {!selectedTerminated && (
                selected.phone ? (
                  <StaffMagicLinkPanel userId={selected.id} userName={selected.name} links={linksByUser[selected.id] ?? []} />
                ) : (
                  <Section title="순찰 매직링크">
                    <EmptyState
                      compact
                      icon={Phone}
                      title="전화번호를 먼저 등록하세요"
                      description="순찰 매직링크는 전화번호 뒷 4자리로 본인 확인을 해요."
                      action={
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                          <Pencil />
                          정보 수정
                        </Button>
                      }
                    />
                  </Section>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 직원 추가 */}
      <Dialog open={showAddForm} onOpenChange={(open) => { if (!isPending) setShowAddForm(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="t7-bold">직원 추가</DialogTitle>
            <DialogDescription>등록한 이메일로 계정 초대를 보낼 수 있어요.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMentor} className="flex flex-col gap-x4">
            <FormField label="이름" htmlFor="add-name" required>
              <Input id="add-name" name="name" required placeholder="홍길동" />
            </FormField>
            <FormField label="역할" htmlFor="add-role" required>
              <NativeSelect id="add-role" name="role" required>
                <option value="STAFF">운영조교</option>
                <option value="MENTOR">멘토</option>
                <option value="HEAD_MENTOR">총괄 멘토</option>
                <option value="CONSULTANT">컨설턴트</option>
                <option value="MANAGER_MENTOR">관리 멘토</option>
              </NativeSelect>
            </FormField>
            <FormField label="이메일" htmlFor="add-email" required>
              <Input id="add-email" name="email" type="email" required placeholder="staff@example.com" />
            </FormField>
            <FormField label="전화번호" htmlFor="add-phone" hint="순찰 매직링크 본인 확인에 써요">
              <Input id="add-phone" name="phone" type="tel" placeholder="010-1234-5678" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)} disabled={isPending}>
                취소
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "등록 중…" : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="직원을 삭제할까요?"
        description={
          <>
            <span className="t4-bold text-fg-neutral">{deleteTarget?.name}</span> 직원을 삭제하면 관련 데이터가 모두
            삭제될 수 있어요. 되돌릴 수 없어요.
          </>
        }
        tone="critical"
        confirmLabel="삭제"
        pendingLabel="삭제 중…"
        pending={isPending}
        onConfirm={() => deleteTarget && handleDeleteMentor(deleteTarget.id)}
      />

      {statusDialogUser && (
        <StaffStatusDialog
          open={!!statusDialogUser}
          onOpenChange={(open) => { if (!open) setStatusDialogUser(null); }}
          user={{ id: statusDialogUser.id, name: statusDialogUser.name, status: statusDialogUser.status, terminationNote: statusDialogUser.terminationNote }}
          onSuccess={() => { setStatusDialogUser(null); window.location.reload(); }}
        />
      )}

      {selected && (
        <ContractHistoryDialog
          open={contractDialogOpen}
          onOpenChange={setContractDialogOpen}
          userId={selected.id}
          userName={selected.name}
          contracts={selectedContracts}
          onChanged={() => window.location.reload()}
        />
      )}
    </>
  );
}
