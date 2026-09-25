"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Notice, StatusBadge, TableCard } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { NativeSelect } from "@/components/admin/native-select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calculator, AlertTriangle, Pencil, Plus, Trash2, Bell, UserPlus, Users, Clock, CheckCircle2,
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
import { MonthStepper } from "./month-stepper";

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

// 표시용 시각 — 서버·브라우저 렌더 결과가 같도록 KST 고정
function fmtTagTime(d: Date | string): string {
  return new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
function fmtShort(d: Date | string): string {
  return new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  // 확인 다이얼로그 (window.confirm 대체)
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);

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
    startTransition(async () => {
      try {
        await adminDeleteWorkTag(id);
        setDeleteTagId(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleNotifyMissing() {
    startTransition(async () => {
      try {
        const res = await notifyMissingClockOuts();
        toast.success(`알림 전송: ${res.length}건`);
        setNotifyOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "알림 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x5">
      {/* 기간 선택 + 누락 알림 */}
      <div className="flex flex-wrap items-center justify-between gap-x3">
        <MonthStepper
          year={year}
          month={month}
          onPrev={() => goMonth(-1)}
          onNext={() => goMonth(1)}
          className="-ml-2"
        />

        {missingOutStaff.length > 0 && (
          <div className="inline-flex items-center gap-x2 rounded-full bg-bg-warning-weak py-x1 pl-x3 pr-x1 t3-medium text-fg-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            OUT 누락 <span className="tabular-nums">{missingOutStaff.length}</span>명
            <Button size="xs" variant="ghost" onClick={() => setNotifyOpen(true)} disabled={pending}>
              <Bell />
              알림
            </Button>
          </div>
        )}
      </div>

      {/* 마스터-디테일 */}
      <div className="grid grid-cols-1 gap-x5 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* 좌측: 직원 목록 + 추가 */}
        <div className="flex flex-col gap-x3">
          <p className="px-x1 t3-medium text-fg-neutral-subtle">
            직원 <span className="tabular-nums">{staff.length}</span>
          </p>
          {staff.length === 0 ? (
            <div className="rounded-r3 bg-bg-layer-fill">
              <EmptyState
                compact
                icon={Users}
                title="관리 중인 직원이 없어요"
                description="아래 ‘직원 추가’로 시작하세요."
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-x0_5">
              {staff.map((s) => {
                const userTags = (tagsByUser.get(s.id) ?? []);
                const computed = s.hourlyRate != null
                  ? calculatePayrollFromTags(userTags, s.hourlyRate, s.weeklyHolidayPay)
                  : null;
                const hasMissing = computed?.missing && computed.missing.length > 0;
                const isActive = activeStaffId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActiveStaffId(s.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-x2 rounded-r2 px-x3 py-x2_5 text-left transition-colors",
                        isActive ? "bg-bg-transparent-selected" : "hover:bg-bg-transparent-pressed",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x1_5">
                          <span className={cn("truncate text-fg-neutral", isActive ? "t4-bold" : "t4-medium")}>{s.name}</span>
                          <span className="t2-regular text-fg-neutral-subtle">{ROLE_LABEL[s.role] ?? s.role}</span>
                        </div>
                        <div className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                          {s.hourlyRate != null ? `시급 ${formatWon(s.hourlyRate)}` : <span className="text-fg-critical">시급 미설정</span>}
                        </div>
                        {computed && (
                          <div className="t3-regular tabular-nums text-fg-neutral-subtle">
                            {minutesToHm(computed.totalMinutes)} · {formatWon(computed.totalWage)}
                          </div>
                        )}
                      </div>
                      {hasMissing && (
                        <StatusBadge tone="warn" className="shrink-0">
                          누락
                        </StatusBadge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 직원 추가 */}
          <div className="border-t border-stroke-neutral-muted pt-x3">
            {!showAddCandidate ? (
              <>
                <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAddCandidate(true)} disabled={candidates.length === 0}>
                  <UserPlus />
                  직원 추가
                  {candidates.length > 0 && <span className="tabular-nums text-fg-neutral-subtle">{candidates.length}</span>}
                </Button>
                {candidates.length === 0 && (
                  <p className="mt-x1_5 text-center t3-regular text-fg-neutral-subtle">
                    추가할 수 있는 직원이 없어요
                  </p>
                )}
              </>
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
          </div>
        </div>

        {/* 우측: 선택된 직원 디테일 */}
        <div className="min-w-0">
          {!activeStaffId ? (
            <div className="rounded-r3 bg-bg-layer-fill">
              <EmptyState icon={Users} title="직원을 선택하세요" description="왼쪽 목록에서 직원을 고르면 태그 기록을 볼 수 있어요." />
            </div>
          ) : (() => {
            const s = staff.find((x) => x.id === activeStaffId);
            if (!s) {
              return (
                <div className="rounded-r3 bg-bg-layer-fill">
                  <EmptyState icon={Users} title="선택된 직원이 목록에서 제거되었어요" />
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
              <div className="flex flex-col gap-x5">
                {/* 헤더 */}
                <div className="flex flex-col gap-x3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x2">
                      <h3 className="t6-bold text-fg-neutral">{s.name}</h3>
                      <StatusBadge tone="gray">{ROLE_LABEL[s.role] ?? s.role}</StatusBadge>
                      {hasMissing && (
                        <StatusBadge tone="warn">OUT 누락 {computed!.missing.length}</StatusBadge>
                      )}
                    </div>
                    <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                      {s.hourlyRate != null ? (
                        <>시급 {formatWon(s.hourlyRate)}{s.weeklyHolidayPay && " · 주휴수당 지급"}</>
                      ) : (
                        <span className="text-fg-critical">시급 미설정</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x2">
                    {/* 시급 편집 */}
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-x2">
                        <Input
                          type="number"
                          min={0}
                          step={10}
                          className="h-9 w-28 tabular-nums"
                          value={rateEdit[s.id].rate}
                          onChange={(e) => setRateEdit((p) => ({ ...p, [s.id]: { ...p[s.id], rate: e.target.value } }))}
                          placeholder="시급"
                          aria-label="시급"
                        />
                        <label className="flex items-center gap-x1_5 t3-medium text-fg-neutral-muted">
                          <Checkbox
                            checked={rateEdit[s.id].holiday}
                            onCheckedChange={(v) => setRateEdit((p) => ({ ...p, [s.id]: { ...p[s.id], holiday: !!v } }))}
                          />
                          주휴
                        </label>
                        <Button size="sm" onClick={() => handleRateSave(s.id)} disabled={pending}>
                          저장
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRateEdit((prev) => { const n = { ...prev }; delete n[s.id]; return n; })}>
                          취소
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRateEdit((p) => ({ ...p, [s.id]: { rate: String(s.hourlyRate ?? ""), holiday: s.weeklyHolidayPay } }))}>
                        <Pencil />
                        시급
                      </Button>
                    )}

                    <Button
                      size="sm"
                      onClick={() => handleCalculate(s.id)}
                      disabled={pending || s.hourlyRate == null}
                    >
                      <Calculator />
                      이 달 계산
                    </Button>
                  </div>
                </div>

                {/* 계산 요약 */}
                <dl className="grid grid-cols-2 gap-x3 md:grid-cols-4">
                  <Metric label="근무">{computed ? minutesToHm(computed.totalMinutes) : "시급 미설정"}</Metric>
                  <Metric label="기본급">{computed ? formatWon(computed.baseWage) : "—"}</Metric>
                  <Metric label="주휴수당">{computed ? formatWon(computed.weeklyHolidayWage) : "—"}</Metric>
                  <Metric label="총 예상 지급" strong>{computed ? formatWon(computed.totalWage) : "—"}</Metric>
                </dl>
                {s.record && (
                  <Notice tone="ok" icon={CheckCircle2}>
                    {`저장된 정산: ${minutesToHm(s.record.workMinutes)} · 총 ${formatWon(s.record.totalWage)} · ${fmtShort(s.record.calculatedAt)} 계산됨`}
                  </Notice>
                )}

                {/* 태그 목록 (항상 표시) */}
                <div className="flex flex-col gap-x3">
                  <div className="flex items-center justify-between gap-x2">
                    <p className="t5-bold text-fg-neutral">
                      출퇴근 태그 <span className="tabular-nums text-fg-brand">{userTags.length}</span>
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setAddForStaff(s.id)}>
                      <Plus />
                      수동 추가
                    </Button>
                  </div>

                  {addForStaff === s.id && (
                    <TagAddRow userId={s.id} onDone={() => { setAddForStaff(null); router.refresh(); }} onCancel={() => setAddForStaff(null)} />
                  )}

                  {userTags.length === 0 ? (
                    <div className="rounded-r3 bg-bg-layer-fill">
                      <EmptyState compact icon={Clock} title="이 달 태그가 없어요" description="필요하면 ‘수동 추가’로 기록을 넣을 수 있어요." />
                    </div>
                  ) : (
                    <TableCard>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>구분</TableHead>
                            <TableHead>시각</TableHead>
                            <TableHead>메모</TableHead>
                            <TableHead>수정 이력</TableHead>
                            <TableHead className="w-24 text-right">
                              <span className="sr-only">관리</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userTags.map((t) =>
                            editingTag === t.id ? (
                              <TagEditRow key={t.id} tag={t} onDone={() => { setEditingTag(null); router.refresh(); }} onCancel={() => setEditingTag(null)} />
                            ) : (
                              <TableRow key={t.id}>
                                <TableCell>
                                  <StatusBadge tone={t.type === "CLOCK_IN" ? "ok" : "gray"}>
                                    {t.type === "CLOCK_IN" ? "출근" : "퇴근"}
                                  </StatusBadge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums">
                                  {fmtTagTime(t.taggedAt)}
                                </TableCell>
                                <TableCell className="text-fg-neutral-muted">{t.note ?? "—"}</TableCell>
                                <TableCell className="whitespace-nowrap t3-regular text-fg-neutral-subtle">
                                  {t.editedByName ? `${t.editedByName} · ${t.editedAt ? fmtShort(t.editedAt) : ""}` : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end">
                                    <Button size="icon" variant="ghost" onClick={() => setEditingTag(t.id)} aria-label="태그 수정">
                                      <Pencil />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setDeleteTagId(t.id)}
                                      aria-label="태그 삭제"
                                      className="text-fg-neutral-subtle hover:text-fg-critical"
                                    >
                                      <Trash2 />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          )}
                        </TableBody>
                      </Table>
                    </TableCard>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTagId !== null}
        onOpenChange={(o) => { if (!o) setDeleteTagId(null); }}
        title="이 태그를 삭제할까요?"
        description="삭제한 태그는 되돌릴 수 없어요. 급여를 다시 계산하려면 ‘이 달 계산’을 눌러주세요."
        tone="critical"
        confirmLabel="삭제"
        pendingLabel="삭제 중…"
        pending={pending}
        onConfirm={() => deleteTagId && handleDeleteTag(deleteTagId)}
      />

      <ConfirmDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        title={`OUT 누락 ${missingOutStaff.length}건을 Slack으로 알릴까요?`}
        description="퇴근 태그가 빠진 근무자 목록을 Slack으로 보내요."
        confirmLabel="알림 보내기"
        pendingLabel="보내는 중…"
        pending={pending}
        onConfirm={handleNotifyMissing}
      >
        {missingOutStaff.length > 0 && (
          <p className="rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 t4-regular text-fg-neutral-muted">
            {missingOutStaff.map((m) => m.userName).join(", ")}
          </p>
        )}
      </ConfirmDialog>
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
    <div className="flex flex-col gap-x2">
      <NativeSelect
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        aria-label="추가할 직원"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
        ))}
      </NativeSelect>
      <Input
        type="number"
        min={0}
        step={10}
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="시급 (원)"
        aria-label="시급"
        className="tabular-nums"
      />
      <label className="flex items-center gap-x1_5 t3-medium text-fg-neutral-muted">
        <Checkbox checked={holiday} onCheckedChange={(v) => setHoliday(!!v)} />
        주휴수당 지급
      </label>
      <div className="flex gap-x2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" onClick={save} disabled={pending} className="flex-1">
          {pending ? "저장 중…" : "추가"}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
      <dt className="t3-medium text-fg-neutral-subtle">{label}</dt>
      <dd className={cn("mt-x1 truncate tabular-nums", strong ? "t6-bold text-fg-brand" : "t6-bold text-fg-neutral")}>
        {children}
      </dd>
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
    <TableRow className="bg-bg-layer-fill hover:bg-bg-layer-fill">
      <TableCell>
        <NativeSelect className="h-9 w-24" value={type} onChange={(e) => setType(e.target.value as WorkTagType)} aria-label="구분">
          <option value="CLOCK_IN">출근</option>
          <option value="CLOCK_OUT">퇴근</option>
        </NativeSelect>
      </TableCell>
      <TableCell>
        <DateTimePickerInput value={taggedAt} onChange={setTaggedAt} className="min-w-[15rem]" />
      </TableCell>
      <TableCell>
        <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 min-w-32" placeholder="메모" aria-label="메모" />
      </TableCell>
      <TableCell />
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-x1">
          <Button size="xs" onClick={save} disabled={pending}>
            {pending ? "저장 중…" : "저장"}
          </Button>
          <Button size="xs" variant="ghost" onClick={onCancel}>취소</Button>
        </div>
      </TableCell>
    </TableRow>
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
    <div className="flex flex-wrap items-center gap-x2 rounded-r3 bg-bg-layer-fill p-x3">
      <NativeSelect className="h-9 w-24" value={type} onChange={(e) => setType(e.target.value as WorkTagType)} aria-label="구분">
        <option value="CLOCK_IN">출근</option>
        <option value="CLOCK_OUT">퇴근</option>
      </NativeSelect>
      <DateTimePickerInput value={taggedAt} onChange={setTaggedAt} className="min-w-[15rem]" />
      <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 min-w-32 flex-1" placeholder="메모(선택)" aria-label="메모" />
      <div className="flex items-center gap-x1">
        <Button size="sm" variant="ghost" onClick={onCancel}>취소</Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
