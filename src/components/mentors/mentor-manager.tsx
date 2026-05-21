"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, Plus, Pencil, UserMinus, UserCheck, ChevronLeft, ChevronRight,
  Wallet, CalendarClock, FileText,
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

function won(n: number) { return `₩${n.toLocaleString("ko-KR")}`; }
function ymKst(d: Date) {
  const k = new Date(new Date(d).getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
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

  function handleDeleteMentor(id: string, name: string) {
    if (!confirm(`${name} 직원을 삭제하시겠습니까?\n관련 데이터가 모두 삭제될 수 있습니다.`)) return;
    startTransition(async () => {
      try {
        await deleteMentor(id);
        setMentors((prev) => prev.filter((m) => m.id !== id));
        setSelectedId(null);
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

  return (
    <div className="space-y-4">
      {/* 탭 + 직원 추가 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
          {([
            { key: "active", label: "재직", count: activeCount },
            { key: "terminated", label: "퇴사", count: terminatedCount },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchFilter(tab.key)}
              className={cn(
                "px-3 py-1 text-sm rounded-md transition-colors",
                statusFilter === tab.key ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{tab.count}</span>
            </button>
          ))}
        </div>
        {statusFilter === "active" && !showAddForm && (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> 직원 추가
          </Button>
        )}
      </div>

      {/* 직원 추가 폼 */}
      {showAddForm && statusFilter === "active" && (
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-sm">직원 추가</CardTitle></CardHeader>
          <CardContent className="pb-4">
            <form onSubmit={handleAddMentor} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">이름 *</Label>
                  <Input name="name" required className="h-8 text-sm" placeholder="홍길동" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">역할 *</Label>
                  <select name="role" required className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="STAFF">운영조교</option>
                    <option value="MENTOR">멘토</option>
                    <option value="HEAD_MENTOR">총괄 멘토</option>
                    <option value="CONSULTANT">컨설턴트</option>
                    <option value="MANAGER_MENTOR">관리 멘토</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">이메일 *</Label>
                  <Input name="email" type="email" required className="h-8 text-sm" placeholder="staff@example.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">전화번호</Label>
                  <Input name="phone" type="tel" className="h-8 text-sm" placeholder="010-1234-5678" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending}>등록</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAddForm(false)}>취소</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 마스터-디테일 */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3 items-start">
        {/* 좌: 직원 목록 */}
        <aside className={cn("space-y-1.5", selected ? "hidden lg:block" : "block")}>
          {visibleMentors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {statusFilter === "terminated" ? "퇴사 처리된 직원이 없습니다" : "재직 중인 직원이 없습니다"}
            </p>
          ) : (
            visibleMentors.map((m) => {
              const isActive = selectedId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => selectStaff(m.id)}
                  className={cn(
                    "w-full text-left rounded-lg border px-3 py-2.5 transition-colors flex items-center gap-2",
                    isActive ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{m.name}</span>
                      {m.status === "TERMINATED" && <Badge variant="destructive" className="text-[9px] h-4 px-1">퇴사</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{ROLE_LABEL[m.role] ?? m.role}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </button>
              );
            })
          )}
        </aside>

        {/* 우: 선택 직원 상세 */}
        <div className={cn("min-w-0", selected ? "block" : "hidden lg:block")}>
          {!selected ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">좌측에서 직원을 선택하세요.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {/* 헤더 */}
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSelectedId(null)} className="lg:hidden inline-flex items-center gap-0.5 text-sm text-muted-foreground">
                      <ChevronLeft className="h-4 w-4" /> 목록
                    </button>
                    <span className="font-bold text-base">{selected.name}</span>
                    <Badge
                      variant={selected.role === "SUPER_ADMIN" || selected.role === "DIRECTOR" ? "default" : selected.role === "STAFF" ? "outline" : "secondary"}
                      className="text-xs"
                    >
                      {ROLE_LABEL[selected.role] ?? selected.role}
                    </Badge>
                    {selected.status === "TERMINATED" && <Badge variant="destructive" className="text-xs">퇴사</Badge>}
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => setEditing((v) => !v)} title="정보 수정" className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {selected.id !== currentUserId && (
                        <button
                          onClick={() => setStatusDialogUser(selected)}
                          title={selected.status === "TERMINATED" ? "활성 복귀" : "퇴사 처리"}
                          className={cn("p-1.5 rounded hover:bg-accent", selected.status === "TERMINATED" ? "text-muted-foreground hover:text-ok" : "text-muted-foreground hover:text-destructive")}
                        >
                          {selected.status === "TERMINATED" ? <UserCheck className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteMentor(selected.id, selected.name)}
                        disabled={isPending || selected.role === "DIRECTOR" || selected.role === "SUPER_ADMIN"}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selected.email}{selected.phone ? ` · ${selected.phone}` : ""}
                  </p>

                  {editing && (
                    <form onSubmit={(e) => handleUpdateMentor(selected.id, e)} className="space-y-3 mt-3 pt-3 border-t">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">이름 *</Label>
                          <Input name="name" defaultValue={selected.name} required className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">이메일 *</Label>
                          <Input name="email" type="email" defaultValue={selected.email} required className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">역할 (권한)</Label>
                          <select name="role" defaultValue={selected.role} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="STAFF">운영조교</option>
                            <option value="MENTOR">멘토</option>
                            <option value="HEAD_MENTOR">총괄 멘토</option>
                            <option value="CONSULTANT">컨설턴트</option>
                            <option value="MANAGER_MENTOR">관리 멘토</option>
                            <option value="DIRECTOR">원장</option>
                            <option value="SUPER_ADMIN">시스템 관리자</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">전화번호 <span className="text-muted-foreground">(매직링크 본인확인용)</span></Label>
                          <Input name="phone" type="tel" defaultValue={selected.phone ?? ""} placeholder="010-1234-5678" className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={isPending}>저장</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>취소</Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>

              {/* 계약 내용 */}
              <Card>
                <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">계약 내용</CardTitle>
                  <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => setContractDialogOpen(true)}>
                    <FileText className="h-3 w-3 mr-1" /> 계약 관리
                  </Button>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  {activeContract ? (
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">현재 시급 {won(activeContract.hourlyRate)}</Badge>
                      <span className="text-xs text-muted-foreground">{ymKst(activeContract.effectiveFrom)}~</span>
                      <span className="text-xs text-muted-foreground">주휴 {activeContract.weeklyHolidayPay ? "지급" : "미지급"}</span>
                      {activeContract.monthlyBonusKrw > 0 && <span className="text-xs text-muted-foreground">고정수당 {won(activeContract.monthlyBonusKrw)}</span>}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">등록된 계약이 없습니다. 계약 관리 버튼으로 시급 계약을 등록하세요.</p>
                  )}
                  {selectedContracts.length > 1 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">이전 계약 {selectedContracts.length - 1}건 — 계약 관리에서 이력 확인</p>
                  )}
                </CardContent>
              </Card>

              {/* 근무 일정 */}
              <Card>
                <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">근무 일정 (주간)</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {DAYS.map((d) => {
                          const sch = scheduleMap.get(d.value);
                          const isEditingThis = editDay === d.value;
                          return (
                            <tr key={d.value} className={cn("border-b last:border-0", d.weekend ? "bg-muted/20" : "")}>
                              <td className={cn("px-3 py-2 font-medium text-sm w-16 whitespace-nowrap", d.weekend ? "text-red-500" : "")}>{d.label}</td>
                              <td className="px-3 py-2">
                                {isEditingThis ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <TimePickerInput value={editStart} onChange={setEditStart} size="sm" />
                                    <span className="text-muted-foreground text-xs">~</span>
                                    <TimePickerInput value={editEnd} onChange={setEditEnd} size="sm" />
                                    <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveSchedule} disabled={isPending}>저장</Button>
                                    <button onClick={() => setEditDay(null)} className="text-xs text-muted-foreground hover:text-foreground">취소</button>
                                  </div>
                                ) : sch ? (
                                  <span className="font-mono text-sm">{sch.timeStart} ~ {sch.timeEnd}</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">미등록</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {!isEditingThis && (
                                  <div className="flex items-center gap-2 justify-end">
                                    <button onClick={() => startEditSchedule(d.value)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                                      {sch ? "수정" : "등록"}
                                    </button>
                                    {sch && (
                                      <button onClick={() => handleDeleteSchedule(sch.id)} disabled={isPending} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* 순찰 매직링크 (퇴사자 제외) */}
              {selected.status !== "TERMINATED" && (
                <Card>
                  <CardContent className="py-4">
                    {selected.phone ? (
                      <StaffMagicLinkPanel userId={selected.id} userName={selected.name} links={linksByUser[selected.id] ?? []} />
                    ) : (
                      <p className="text-xs text-muted-foreground">순찰 매직링크를 발급하려면 먼저 전화번호를 등록하세요 (본인 확인용).</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
