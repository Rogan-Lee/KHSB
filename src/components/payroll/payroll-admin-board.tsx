"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calculator, AlertTriangle, Pencil, Save, Plus, Trash2, Bell, ChevronLeft, ChevronRight, UserPlus, X,
} from "lucide-react";
import {
  setPayrollSetting,
  calculateMonthlyPayroll,
  adminCreateWorkTag,
  adminUpdateWorkTag,
  adminDeleteWorkTag,
  notifyMissingClockOuts,
} from "@/actions/payroll";
import { calculatePayrollFromTags } from "@/lib/payroll";
import type { WorkTag, PayrollRecord, WorkTagType } from "@/generated/prisma";

type StaffRow = {
  id: string;
  name: string;
  role: string;
  hourlyRate: number | null;
  weeklyHolidayPay: boolean;
  record: PayrollRecord | null;
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "시스템 관리자",
  ADMIN: "(구) 어드민",
  DIRECTOR: "원장",
  MENTOR: "멘토",
  STAFF: "스태프",
  STUDENT: "학생",
};

type CandidateUser = { id: string; name: string; role: string; email: string };

function formatWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function minutesToHm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}시간 ${m}분`;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PayrollAdminBoard({
  year,
  month,
  staff,
  tags,
  candidates = [],
}: {
  year: number;
  month: number;
  staff: StaffRow[];
  tags: WorkTag[];
  candidates?: CandidateUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeStaffId, setActiveStaffId] = useState<string | null>(staff[0]?.id ?? null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [rateEdit, setRateEdit] = useState<Record<string, { rate: string; holiday: boolean }>>({});
  const [addForStaff, setAddForStaff] = useState<string | null>(null);
  // 신규 직원 추가 드롭다운
  const [showAddCandidate, setShowAddCandidate] = useState(false);

  // 월별 사용자 그룹
  const tagsByUser = useMemo(() => {
    const m = new Map<string, WorkTag[]>();
    for (const t of tags) {
      if (!m.has(t.userId)) m.set(t.userId, []);
      m.get(t.userId)!.push(t);
    }
    return m;
  }, [tags]);

  // 미매칭(OUT 누락) 직원 감지 — 월내 마지막 태그가 IN 이면
  const missingOutStaff = useMemo(() => {
    const list: { userId: string; userName: string; lastIn: Date }[] = [];
    for (const s of staff) {
      const userTags = (tagsByUser.get(s.id) ?? []).slice().sort((a, b) => new Date(a.taggedAt).getTime() - new Date(b.taggedAt).getTime());
      const last = userTags[userTags.length - 1];
      if (last?.type === "CLOCK_IN") {
        list.push({ userId: s.id, userName: s.name, lastIn: new Date(last.taggedAt) });
      }
    }
    return list;
  }, [staff, tagsByUser]);

  function goMonth(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 1) { y -= 1; m = 12; }
    if (m > 12) { y += 1; m = 1; }
    router.push(`/payroll?year=${y}&month=${m}`);
  }

  function handleRateSave(userId: string) {
    const e = rateEdit[userId];
    if (!e) return;
    const rate = Number(e.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error("시급은 0 이상 숫자");
      return;
    }
    startTransition(async () => {
      try {
        await setPayrollSetting(userId, { hourlyRate: rate, weeklyHolidayPay: e.holiday });
        toast.success("시급 저장 완료");
        setRateEdit((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  function handleCalculate(userId: string) {
    startTransition(async () => {
      try {
        const res = await calculateMonthlyPayroll(userId, year, month);
        toast.success(
          `계산 완료: ${minutesToHm(res.totalMinutes)} / 총 ${formatWon(res.totalWage)}` +
          (res.missing > 0 ? ` · 누락 ${res.missing}건` : "")
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "계산 실패");
      }
    });
  }

  function handleDeleteTag(id: string) {
    if (!confirm("이 태그를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await adminDeleteWorkTag(id);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleNotifyMissing() {
    if (!confirm(`현재 OUT 누락 ${missingOutStaff.length}건을 Slack 으로 알릴까요?`)) return;
    startTransition(async () => {
      try {
        const res = await notifyMissingClockOuts();
        toast.success(`알림 전송: ${res.length}건`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "알림 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 기간 선택 + 툴바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => goMonth(-1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-bold text-base min-w-[80px] text-center">
          {year}.{String(month).padStart(2, "0")}
        </span>
        <Button variant="outline" size="sm" onClick={() => goMonth(1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        {missingOutStaff.length > 0 && (
          <span className="inline-flex items-center gap-1.5 ml-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            OUT 누락 {missingOutStaff.length}명
            <button
              onClick={handleNotifyMissing}
              disabled={pending}
              className="ml-1 text-amber-700 hover:text-amber-900 font-medium underline-offset-2 hover:underline inline-flex items-center gap-0.5"
            >
              <Bell className="h-3 w-3" /> 알림
            </button>
          </span>
        )}
      </div>

      {/* 마스터-디테일 */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3 min-h-[500px]">
        {/* 좌측: 직원 칩스 + 추가 */}
        <div className="flex flex-col gap-2">
          <div className="border rounded-lg bg-background overflow-hidden flex-1 flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/40 flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                직원 ({staff.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {staff.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  아직 관리 중인 직원이 없습니다.<br />아래 &quot;직원 추가&quot; 로 시작하세요.
                </p>
              ) : (
                staff.map((s) => {
                  const userTags = (tagsByUser.get(s.id) ?? []);
                  const computed = s.hourlyRate != null
                    ? calculatePayrollFromTags(userTags, s.hourlyRate, s.weeklyHolidayPay)
                    : null;
                  const hasMissing = computed?.missing && computed.missing.length > 0;
                  const isActive = activeStaffId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveStaffId(s.id)}
                      className={cn(
                        "w-full text-left rounded-md px-2.5 py-2 transition-colors flex items-start gap-2",
                        isActive
                          ? "bg-primary/10 border border-primary"
                          : "border border-transparent hover:bg-muted/60"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm truncate">{s.name}</span>
                          <span className="text-[9px] bg-muted px-1 py-0.5 rounded">{ROLE_LABEL[s.role] ?? s.role}</span>
                        </div>
                        <div className="text-[10.5px] text-muted-foreground mt-0.5">
                          {s.hourlyRate != null ? `시급 ${formatWon(s.hourlyRate)}` : <span className="text-red-600">시급 미설정</span>}
                        </div>
                        {computed && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {minutesToHm(computed.totalMinutes)} · {formatWon(computed.totalWage)}
                          </div>
                        )}
                      </div>
                      {hasMissing && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded shrink-0" title="OUT 누락">
                          !
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 직원 추가 */}
          <div className="border rounded-lg bg-background p-3">
            {!showAddCandidate ? (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAddCandidate(true)} disabled={candidates.length === 0}>
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                직원 추가 {candidates.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({candidates.length})</span>}
              </Button>
            ) : (
              <AddCandidateForm
                candidates={candidates}
                onDone={(userId) => {
                  setShowAddCandidate(false);
                  setActiveStaffId(userId);
                  router.refresh();
                }}
                onCancel={() => setShowAddCandidate(false)}
              />
            )}
            {candidates.length === 0 && !showAddCandidate && (
              <p className="text-[10px] text-muted-foreground mt-1 text-center">
                추가 가능한 직원이 없습니다
              </p>
            )}
          </div>
        </div>

        {/* 우측: 선택된 직원 디테일 */}
        <div className="border rounded-lg bg-background overflow-hidden">
          {!activeStaffId ? (
            <div className="flex items-center justify-center h-full min-h-[500px] text-sm text-muted-foreground">
              좌측에서 직원을 선택하세요
            </div>
          ) : (() => {
            const s = staff.find((x) => x.id === activeStaffId);
            if (!s) {
              return (
                <div className="flex items-center justify-center h-full min-h-[500px] text-sm text-muted-foreground">
                  선택된 직원이 목록에서 제거되었습니다.
                </div>
              );
            }
            const userTags = (tagsByUser.get(s.id) ?? []).slice().sort((a, b) => new Date(a.taggedAt).getTime() - new Date(b.taggedAt).getTime());
            const computed = s.hourlyRate != null
              ? calculatePayrollFromTags(userTags, s.hourlyRate, s.weeklyHolidayPay)
              : null;
            const isEditing = rateEdit[s.id] !== undefined;
            const hasMissing = computed?.missing && computed.missing.length > 0;
            return (
              <div>
                {/* 헤더 */}
                <div className="flex items-center gap-3 p-4 border-b bg-muted/20 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base">{s.name}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{ROLE_LABEL[s.role] ?? s.role}</span>
                      {hasMissing && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          OUT 누락 {computed!.missing.length}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.hourlyRate != null ? (
                        <>시급 {formatWon(s.hourlyRate)}{s.weeklyHolidayPay && " · 주휴수당 지급"}</>
                      ) : (
                        <span className="text-red-600">시급 미설정</span>
                      )}
                    </div>
                  </div>

                  {/* 시급 편집 */}
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        step={10}
                        className="w-24 h-8"
                        value={rateEdit[s.id].rate}
                        onChange={(e) => setRateEdit((p) => ({ ...p, [s.id]: { ...p[s.id], rate: e.target.value } }))}
                        placeholder="시급"
                      />
                      <label className="text-[11px] flex items-center gap-1 text-muted-foreground">
                        <Checkbox
                          checked={rateEdit[s.id].holiday}
                          onCheckedChange={(v) => setRateEdit((p) => ({ ...p, [s.id]: { ...p[s.id], holiday: !!v } }))}
                        />
                        주휴
                      </label>
                      <Button size="sm" onClick={() => handleRateSave(s.id)} disabled={pending}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRateEdit((prev) => { const n = { ...prev }; delete n[s.id]; return n; })}>
                        취소
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setRateEdit((p) => ({ ...p, [s.id]: { rate: String(s.hourlyRate ?? ""), holiday: s.weeklyHolidayPay } }))}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />시급
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={() => handleCalculate(s.id)}
                    disabled={pending || s.hourlyRate == null}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Calculator className="h-3.5 w-3.5 mr-1" />이 달 계산
                  </Button>
                </div>

                {/* 계산 요약 */}
                <div className="px-4 py-3 border-b grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Cell label="근무">{computed ? minutesToHm(computed.totalMinutes) : "시급 미설정"}</Cell>
                  <Cell label="기본급">{computed ? formatWon(computed.baseWage) : "—"}</Cell>
                  <Cell label="주휴수당">{computed ? formatWon(computed.weeklyHolidayWage) : "—"}</Cell>
                  <Cell label="총 예상 지급">
                    <span className="font-bold text-blue-700">{computed ? formatWon(computed.totalWage) : "—"}</span>
                  </Cell>
                </div>
                {s.record && (
                  <div className="px-4 py-2 border-b bg-emerald-50 text-[11px] text-emerald-800 flex items-center gap-2 flex-wrap">
                    <span>저장된 정산:</span>
                    <span>{minutesToHm(s.record.workMinutes)}</span>
                    <span>· 총 {formatWon(s.record.totalWage)}</span>
                    <span className="ml-auto">
                      {new Date(s.record.calculatedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 계산됨
                    </span>
                  </div>
                )}

                {/* 태그 목록 (항상 표시) */}
                <div>
                  <div className="px-4 py-2 flex items-center gap-2 border-b">
                    <span className="text-xs font-semibold text-muted-foreground">출퇴근 태그 ({userTags.length})</span>
                    <Button size="sm" variant="outline" onClick={() => setAddForStaff(s.id)} className="ml-auto h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" />수동 추가
                    </Button>
                  </div>

                  {addForStaff === s.id && (
                    <TagAddRow userId={s.id} onDone={() => { setAddForStaff(null); router.refresh(); }} onCancel={() => setAddForStaff(null)} />
                  )}

                  {userTags.length === 0 ? (
                    <p className="p-6 text-center text-xs text-muted-foreground">이 달 태그 없음</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-1.5 text-left">타입</th>
                          <th className="px-3 py-1.5 text-left">시각</th>
                          <th className="px-3 py-1.5 text-left">메모</th>
                          <th className="px-3 py-1.5 text-left">수정이력</th>
                          <th className="px-3 py-1.5 w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {userTags.map((t) =>
                          editingTag === t.id ? (
                            <TagEditRow key={t.id} tag={t} onDone={() => { setEditingTag(null); router.refresh(); }} onCancel={() => setEditingTag(null)} />
                          ) : (
                            <tr key={t.id} className="border-t">
                              <td className="px-3 py-1.5">
                                <span className={cn(
                                  "inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-semibold",
                                  t.type === "CLOCK_IN" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                                )}>
                                  {t.type === "CLOCK_IN" ? "출근" : "퇴근"}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 font-mono">
                                {new Date(t.taggedAt).toLocaleString("ko-KR")}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{t.note ?? "—"}</td>
                              <td className="px-3 py-1.5 text-[10px] text-muted-foreground">
                                {t.editedByName ? `${t.editedByName} · ${t.editedAt ? new Date(t.editedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}` : "—"}
                              </td>
                              <td className="px-3 py-1.5">
                                <button onClick={() => setEditingTag(t.id)} className="p-1 text-muted-foreground hover:text-foreground">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleDeleteTag(t.id)} className="p-1 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── 직원 추가 ─────────────────────────────────────────────────────────

function AddCandidateForm({
  candidates,
  onDone,
  onCancel,
}: {
  candidates: CandidateUser[];
  onDone: (userId: string) => void;
  onCancel: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(candidates[0]?.id ?? "");
  const [rate, setRate] = useState<string>("");
  const [holiday, setHoliday] = useState<boolean>(true);
  const [pending, startTransition] = useTransition();

  function save() {
    const n = Number(rate);
    if (!selectedId) { toast.error("직원 선택"); return; }
    if (!Number.isFinite(n) || n < 0) { toast.error("시급은 0 이상"); return; }
    startTransition(async () => {
      try {
        await setPayrollSetting(selectedId, { hourlyRate: Math.round(n), weeklyHolidayPay: holiday });
        toast.success("직원 추가 완료");
        onDone(selectedId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "추가 실패");
      }
    });
  }

  return (
    <div className="space-y-2">
      <select
        className="w-full h-8 text-xs border rounded px-2 bg-background"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
        ))}
      </select>
      <Input
        type="number"
        min={0}
        step={10}
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="시급 (원)"
        className="h-8 text-xs"
      />
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Checkbox checked={holiday} onCheckedChange={(v) => setHoliday(!!v)} />
        주휴수당 지급
      </label>
      <div className="flex gap-1">
        <Button size="sm" onClick={save} disabled={pending} className="flex-1 h-7 text-xs">
          {pending ? "저장 중…" : "추가"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm mt-0.5">{children}</p>
    </div>
  );
}

// ─── 태그 편집 Row ─────────────────────────────────────────────────────

function TagEditRow({ tag, onDone, onCancel }: { tag: WorkTag; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<WorkTagType>(tag.type);
  const [taggedAt, setTaggedAt] = useState(toLocalInput(new Date(tag.taggedAt)));
  const [note, setNote] = useState(tag.note ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await adminUpdateWorkTag(tag.id, { type, taggedAt: new Date(taggedAt).toISOString(), note });
        toast.success("수정 완료");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  return (
    <tr className="border-t bg-blue-50/60">
      <td className="px-3 py-1.5">
        <select className="text-xs border rounded px-1 py-0.5 bg-background" value={type} onChange={(e) => setType(e.target.value as WorkTagType)}>
          <option value="CLOCK_IN">출근</option>
          <option value="CLOCK_OUT">퇴근</option>
        </select>
      </td>
      <td className="px-3 py-1.5">
        <input type="datetime-local" value={taggedAt} onChange={(e) => setTaggedAt(e.target.value)} className="text-xs border rounded px-1 py-0.5 bg-background" />
      </td>
      <td className="px-3 py-1.5">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="text-xs border rounded px-1 py-0.5 bg-background w-full" placeholder="메모" />
      </td>
      <td />
      <td className="px-3 py-1.5">
        <button onClick={save} disabled={pending} className="p-1 text-blue-600 hover:text-blue-800">
          <Save className="h-3 w-3" />
        </button>
        <button onClick={onCancel} className="p-1 text-muted-foreground">취소</button>
      </td>
    </tr>
  );
}

// ─── 태그 추가 Row ─────────────────────────────────────────────────────

function TagAddRow({ userId, onDone, onCancel }: { userId: string; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<WorkTagType>("CLOCK_IN");
  const [taggedAt, setTaggedAt] = useState(toLocalInput(new Date()));
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await adminCreateWorkTag({ userId, type, taggedAt: new Date(taggedAt).toISOString(), note });
        toast.success("태그 추가");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "추가 실패");
      }
    });
  }

  return (
    <div className="px-3 py-2 border-t bg-blue-50/40 flex items-center gap-2 flex-wrap text-xs">
      <select className="border rounded px-1 py-0.5 bg-background" value={type} onChange={(e) => setType(e.target.value as WorkTagType)}>
        <option value="CLOCK_IN">출근</option>
        <option value="CLOCK_OUT">퇴근</option>
      </select>
      <input type="datetime-local" value={taggedAt} onChange={(e) => setTaggedAt(e.target.value)} className="border rounded px-1 py-0.5 bg-background" />
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-1 py-0.5 bg-background flex-1 min-w-[120px]" placeholder="메모(선택)" />
      <Button size="sm" onClick={save} disabled={pending} className="h-7 text-xs">저장</Button>
      <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">취소</Button>
    </div>
  );
}
