"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormField, Section, StatusBadge } from "@/components/backoffice/ui";
import { Send, Save, RotateCcw, Copy, CalendarClock, X, Zap, Trash2, ChevronRight } from "lucide-react";
import { useConfirm } from "@/components/online/use-confirm";
import { cn } from "@/lib/utils";
import { proposalStatus } from "../_lib/status";
import { ScheduleSlotsEditor, type AttendanceSlot, type OutingSlot } from "@/components/online/schedule-slots-editor";
import {
  updateProposedSchedule,
  sendProposalToParent,
  commitProposalByAdmin,
  deleteScheduleProposal,
  cancelScheduledCommit,
  rollbackScheduleProposal,
} from "@/actions/online/schedule-proposals";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}
// 오늘(KST) YYYY-MM-DD — <input type="date"> min 값
function todayKSTStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Feedback = { id: string; content: string; createdAt: string };
type Version = { id: string; version: number; status: string; committedAt: string | null };

// 요일별 비교표 — 월요일부터
const DAY_ROWS: { value: number; label: string }[] = [
  { value: 1, label: "월" }, { value: 2, label: "화" }, { value: 3, label: "수" },
  { value: 4, label: "목" }, { value: 5, label: "금" }, { value: 6, label: "토" }, { value: 0, label: "일" },
];

function attendanceText(slots: AttendanceSlot[], day: number): string | null {
  const a = slots.find((x) => x.dayOfWeek === day);
  return a ? `${a.startTime} ~ ${a.endTime}` : null;
}

function outingTexts(outs: OutingSlot[], day: number): string[] {
  return outs
    .filter((o) => o.dayOfWeek === day)
    .sort((x, y) => x.outStart.localeCompare(y.outStart))
    .map((o) => `외출 ${o.outStart}~${o.outEnd}${o.reason?.trim() ? ` · ${o.reason.trim()}` : ""}`);
}

export function ScheduleReviewPanel(props: {
  id: string;
  token: string;
  status: string;
  submittedAttendance: AttendanceSlot[];
  submittedOutings: OutingSlot[];
  proposedAttendance: AttendanceSlot[];
  proposedOutings: OutingSlot[];
  adminNote: string | null;
  studentMemo: string | null;
  scheduledFor: string | null;
  feedbacks: Feedback[];
  versions: Version[];
}) {
  const router = useRouter();
  const [att, setAtt] = useState<AttendanceSlot[]>(props.proposedAttendance);
  const [out, setOut] = useState<OutingSlot[]>(props.proposedOutings);
  const [adminNote, setAdminNote] = useState(props.adminNote ?? "");
  const [effDate, setEffDate] = useState(props.scheduledFor ? props.scheduledFor.slice(0, 10) : "");
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const canEdit = props.status === "SUBMITTED" || props.status === "PROPOSED" || props.status === "REJECTED";
  const canRollback = props.status === "COMMITTED";

  function save() {
    startTransition(async () => {
      try {
        await updateProposedSchedule(props.id, { proposedAttendance: att, proposedOutings: out, adminNote });
        toast.success("제안안을 저장했어요");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "저장 실패"); }
    });
  }
  function send() {
    if (!effDate) { toast.error("실행 예정일을 지정해 주세요"); return; }
    startTransition(async () => {
      try {
        await updateProposedSchedule(props.id, { proposedAttendance: att, proposedOutings: out, adminNote });
        const { token } = await sendProposalToParent(props.id, effDate);
        const url = `${window.location.origin}/r/schedule/${token}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success("학부모 승인 링크를 복사했어요");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "전송 실패"); }
    });
  }
  async function commitNow() {
    const when = effDate && effDate > todayKSTStr() ? `${fmtDate(effDate)}부터 예약 반영` : "지금 즉시 반영";
    if (
      !(await confirm({
        title: `학부모 승인 없이 ${when}할까요?`,
        description: "제안안을 저장하고 입퇴실 일정에 반영해요. 학부모 피드백은 반영 후에도 받을 수 있어요.",
        confirmLabel: "우선 반영",
      }))
    )
      return;
    startTransition(async () => {
      try {
        await updateProposedSchedule(props.id, { proposedAttendance: att, proposedOutings: out, adminNote });
        await commitProposalByAdmin(props.id, effDate || undefined);
        toast.success("우선 반영했어요");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "반영 실패"); }
    });
  }
  async function remove() {
    if (
      !(await confirm({
        title: "이 등원 스케줄 제안을 삭제할까요?",
        description: "삭제하면 되돌릴 수 없어요.",
        confirmLabel: "삭제",
        destructive: true,
      }))
    )
      return;
    startTransition(async () => {
      try { await deleteScheduleProposal(props.id); toast.success("삭제했어요"); router.push("/online/schedules"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
    });
  }
  function cancelScheduled() {
    startTransition(async () => {
      try { await cancelScheduledCommit(props.id); toast.success("반영 예약을 취소했어요"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "취소 실패"); }
    });
  }
  async function rollback() {
    if (
      !(await confirm({
        title: "반영을 되돌릴까요?",
        description: "이 반영을 취소하고 직전 입퇴실 일정으로 복원해요.",
        confirmLabel: "되돌리기",
        destructive: true,
      }))
    )
      return;
    startTransition(async () => {
      try { await rollbackScheduleProposal(props.id); toast.success("직전 일정으로 되돌렸어요"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "되돌리기 실패"); }
    });
  }
  function copyLink() {
    const url = `${window.location.origin}/r/schedule/${props.token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("링크 복사됨")).catch(() => toast.error("복사 실패"));
  }

  // 학생 제출안 vs 편집 중인 제안안 — 요일별로 한눈에 비교
  const diffRows = DAY_ROWS.map((d) => {
    const subAtt = attendanceText(props.submittedAttendance, d.value);
    const propAtt = attendanceText(att, d.value);
    const subOut = outingTexts(props.submittedOutings, d.value);
    const propOut = outingTexts(out, d.value);
    const changed = subAtt !== propAtt || subOut.join("|") !== propOut.join("|");
    return { ...d, subAtt, propAtt, subOut, propOut, changed };
  });
  const changedCount = diffRows.filter((r) => r.changed).length;
  const showLink = props.status === "PROPOSED" || props.status === "APPROVED" || props.status === "COMMITTED";

  return (
    <div className="grid grid-cols-1 gap-x6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-x6">
        <Section
          title="제출안과 제안안 비교"
          description={
            changedCount > 0
              ? `학생 제출안에서 ${changedCount}개 요일이 바뀌었어요.`
              : "학생 제출안과 제안안이 같아요."
          }
          flush
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-x14">요일</TableHead>
                <TableHead>학생 제출</TableHead>
                <TableHead>운영진 제안</TableHead>
                <TableHead className="w-20 text-right">
                  <span className="sr-only">변경 여부</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diffRows.map((r) => (
                <TableRow key={r.value} className={cn("hover:bg-transparent", r.changed && "bg-bg-brand-weak hover:bg-bg-brand-weak")}>
                  <TableCell className="t4-bold">{r.label}</TableCell>
                  <TableCell className="align-top">
                    <DiffCell att={r.subAtt} outs={r.subOut} muted={r.changed} />
                  </TableCell>
                  <TableCell className="align-top">
                    <DiffCell att={r.propAtt} outs={r.propOut} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.changed && <StatusBadge tone="brand">변경</StatusBadge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section
          title="운영진 제안안"
          description={canEdit ? "학부모에게 보여질 일정이에요. 요일·시간을 고쳐 제안하세요." : "학부모에게 보여진 일정이에요."}
        >
          <div className="flex flex-col gap-x6">
            <ScheduleSlotsEditor attendance={att} outings={out} onAttendanceChange={setAtt} onOutingsChange={setOut} readOnly={!canEdit} />
            <FormField label="학부모 안내 메모" htmlFor="schedule-admin-note">
              <Textarea
                id="schedule-admin-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
                disabled={!canEdit}
                placeholder="학부모님께 전달할 안내"
              />
            </FormField>
          </div>
        </Section>

        <Section title="학생 제출 원본" description="학생이 포털에서 제출한 그대로예요.">
          {props.studentMemo && (
            <div className="mb-x5 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
              <p className="t3-medium text-fg-neutral-subtle">학생 메모</p>
              <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral">{props.studentMemo}</p>
            </div>
          )}
          <ScheduleSlotsEditor attendance={props.submittedAttendance} outings={props.submittedOutings} readOnly />
        </Section>
      </div>

      <div className="flex min-w-0 flex-col gap-x4 lg:sticky lg:top-20">
        <Section title="검토 처리">
          <div className="flex flex-col gap-x4">
            {props.status === "APPROVED" && props.scheduledFor && (
              <div className="flex items-start gap-x2 rounded-r3 bg-bg-informative-weak px-x4 py-x3">
                <CalendarClock className="mt-x0_5 size-4 shrink-0 text-fg-informative" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="t4-medium text-fg-neutral">{fmtDate(props.scheduledFor)} 00시에 자동 반영돼요</p>
                  <button
                    type="button"
                    onClick={cancelScheduled}
                    disabled={pending}
                    className="mt-x1 inline-flex items-center gap-x0_5 t3-medium text-fg-neutral-subtle underline-offset-2 hover:text-fg-critical hover:underline disabled:text-fg-disabled"
                  >
                    <X className="size-3.5" aria-hidden />
                    반영 예약 취소
                  </button>
                </div>
              </div>
            )}

            {canEdit ? (
              <>
                <FormField
                  label="실행 예정일"
                  htmlFor="schedule-eff-date"
                  hint="학부모 전송에는 꼭 필요해요. 우선 반영은 비워 두면 바로 반영돼요."
                >
                  <Input
                    id="schedule-eff-date"
                    type="date"
                    min={todayKSTStr()}
                    value={effDate}
                    onChange={(e) => setEffDate(e.target.value)}
                    className="tabular-nums"
                  />
                </FormField>
                <div className="flex flex-col gap-x2">
                  <Button onClick={send} disabled={pending} className="w-full">
                    <Send />
                    학부모 전송
                  </Button>
                  <div className="grid grid-cols-2 gap-x2">
                    <Button variant="secondary" onClick={commitNow} disabled={pending}>
                      <Zap />
                      우선 반영
                    </Button>
                    <Button variant="outline" onClick={save} disabled={pending}>
                      <Save />
                      {pending ? "처리 중…" : "저장"}
                    </Button>
                  </div>
                </div>
                <p className="t3-regular text-fg-neutral-subtle">
                  <b className="t3-bold text-fg-neutral-muted">학부모 전송</b>은 승인 링크를 복사해 두고, 학부모가 승인하면 반영해요.{" "}
                  <b className="t3-bold text-fg-neutral-muted">우선 반영</b>은 승인 없이 바로(또는 실행 예정일에) 반영하고 이후 학부모 피드백을 받아요.
                </p>
              </>
            ) : (
              <p className="t4-regular text-fg-neutral-subtle">
                {props.status === "COMMITTED"
                  ? "입퇴실 일정에 반영된 제안이에요."
                  : "지금 상태에서는 제안안을 고칠 수 없어요."}
              </p>
            )}

            {(showLink || canRollback || props.status !== "COMMITTED") && (
              <div className="flex flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted pt-x4">
                {showLink && (
                  <Button variant="outline" size="sm" onClick={copyLink}>
                    <Copy />
                    승인 링크 복사
                  </Button>
                )}
                {canRollback && (
                  <Button variant="destructive" size="sm" onClick={rollback} disabled={pending}>
                    <RotateCcw />
                    되돌리기
                  </Button>
                )}
                {props.status !== "COMMITTED" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={remove}
                    disabled={pending}
                    className="ml-auto text-fg-critical"
                  >
                    <Trash2 />
                    삭제
                  </Button>
                )}
              </div>
            )}
          </div>
        </Section>

        {props.feedbacks.length > 0 && (
          <Section title="학부모 피드백" count={props.feedbacks.length} flush>
            <ul className="border-t border-stroke-neutral-muted">
              {props.feedbacks.map((f) => (
                <li key={f.id} className="border-b border-stroke-neutral-muted px-x5 py-x3 last:border-b-0">
                  <p className="whitespace-pre-wrap t4-regular text-fg-neutral">{f.content}</p>
                  <p className="mt-x1 t2-regular tabular-nums text-fg-neutral-subtle">{new Date(f.createdAt).toLocaleString("ko-KR")}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="버전 이력" flush>
          <ul className="border-t border-stroke-neutral-muted py-x1">
            {props.versions.map((v) => {
              const vs = proposalStatus(v.status);
              const current = v.id === props.id;
              const body = (
                <>
                  <span className={cn("w-x8 shrink-0 tabular-nums", current ? "t4-bold text-fg-neutral" : "t4-regular text-fg-neutral-muted")}>
                    v{v.version}
                  </span>
                  <StatusBadge tone={vs.tone}>{vs.label}</StatusBadge>
                  <span className="ml-auto shrink-0 t2-regular tabular-nums text-fg-neutral-subtle">
                    {current
                      ? "지금 보는 버전"
                      : v.committedAt
                        ? `${new Date(v.committedAt).toLocaleDateString("ko-KR")} 반영`
                        : ""}
                  </span>
                </>
              );
              return (
                <li key={v.id}>
                  {current ? (
                    <div className="flex items-center gap-x2 bg-bg-layer-fill px-x5 py-x2_5">{body}</div>
                  ) : (
                    <Link
                      href={`/online/schedules/${v.id}`}
                      className="flex items-center gap-x2 px-x5 py-x2_5 transition-colors hover:bg-bg-layer-default-pressed"
                    >
                      {body}
                      <ChevronRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
      {confirmDialog}
    </div>
  );
}

function DiffCell({ att, outs, muted = false }: { att: string | null; outs: string[]; muted?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-x0_5", muted && "text-fg-neutral-subtle")}>
      <span className={cn("whitespace-nowrap tabular-nums", att ? (muted ? "t4-regular" : "t4-medium") : "t4-regular text-fg-placeholder")}>
        {att ?? "등원 안 함"}
      </span>
      {outs.map((o, i) => (
        <span key={i} className="t3-regular tabular-nums text-fg-neutral-subtle">
          {o}
        </span>
      ))}
    </div>
  );
}
