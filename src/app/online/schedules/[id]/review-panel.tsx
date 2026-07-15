"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Save, CheckCircle2, RotateCcw, Copy, MessageSquare, CalendarClock, X } from "lucide-react";
import { ScheduleSlotsEditor, type AttendanceSlot, type OutingSlot } from "@/components/online/schedule-slots-editor";
import {
  updateProposedSchedule,
  sendProposalToParent,
  commitScheduleProposal,
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

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "검토 대기", PROPOSED: "학부모 승인 대기", APPROVED: "승인됨", REJECTED: "반려됨",
  COMMITTED: "반영 완료", SUPERSEDED: "대체됨", CANCELLED: "취소됨",
};

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
  const [effDate, setEffDate] = useState("");
  const [pending, startTransition] = useTransition();

  const canEdit = props.status === "SUBMITTED" || props.status === "PROPOSED" || props.status === "REJECTED";
  const canCommit = props.status === "APPROVED";
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
    startTransition(async () => {
      try {
        await updateProposedSchedule(props.id, { proposedAttendance: att, proposedOutings: out, adminNote });
        const { token } = await sendProposalToParent(props.id);
        const url = `${window.location.origin}/r/schedule/${token}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success("학부모 승인 링크를 복사했어요");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "전송 실패"); }
    });
  }
  function commit() {
    const date = effDate || null;
    const msg = date
      ? `${fmtDate(date)} 00시에 자동 반영되도록 예약할까요?`
      : "승인된 스케줄을 지금 입퇴실 일정에 반영할까요? (이전 일정은 되돌릴 수 있게 보관됩니다)";
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        const res = await commitScheduleProposal(props.id, date);
        toast.success(res.scheduled ? `${fmtDate(res.scheduledFor)}에 반영 예약했어요` : "입퇴실 일정에 반영했어요");
        setEffDate("");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "반영 실패"); }
    });
  }
  function cancelScheduled() {
    startTransition(async () => {
      try { await cancelScheduledCommit(props.id); toast.success("반영 예약을 취소했어요"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "취소 실패"); }
    });
  }
  function rollback() {
    if (!confirm("이 반영을 되돌리고 직전 일정으로 복원할까요?")) return;
    startTransition(async () => {
      try { await rollbackScheduleProposal(props.id); toast.success("직전 일정으로 되돌렸어요"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "되돌리기 실패"); }
    });
  }
  function copyLink() {
    const url = `${window.location.origin}/r/schedule/${props.token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("링크 복사됨")).catch(() => toast.error("복사 실패"));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">운영진 제안안 (학부모에게 보여질 일정)</CardTitle>
            <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{STATUS_LABEL[props.status] ?? props.status}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScheduleSlotsEditor attendance={att} outings={out} onAttendanceChange={setAtt} onOutingsChange={setOut} readOnly={!canEdit} />
            <div className="space-y-1.5">
              <label className="text-sm font-medium">학부모 안내 메모</label>
              <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} disabled={!canEdit} placeholder="학부모님께 전달할 안내" />
            </div>
            {props.scheduledFor && (
              <div className="flex items-center gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-info">
                <CalendarClock className="h-4 w-4 shrink-0" />
                <span>{fmtDate(props.scheduledFor)} 00시에 자동 반영 예약됨</span>
                <button
                  type="button"
                  onClick={cancelScheduled}
                  disabled={pending}
                  className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />예약 취소
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && <Button variant="outline" onClick={save} disabled={pending}><Save className="h-4 w-4 mr-1.5" />저장</Button>}
              {canEdit && <Button onClick={send} disabled={pending}><Send className="h-4 w-4 mr-1.5" />학부모 전송</Button>}
              {(props.status === "PROPOSED" || props.status === "APPROVED") && (
                <Button variant="ghost" onClick={copyLink}><Copy className="h-4 w-4 mr-1.5" />링크 복사</Button>
              )}
              {canCommit && (
                <>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />실행 예정일
                    <input
                      type="date"
                      min={todayKSTStr()}
                      value={effDate}
                      onChange={(e) => setEffDate(e.target.value)}
                      className="border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </label>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={commit} disabled={pending}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />{effDate ? "반영 예약" : "즉시 반영"}
                  </Button>
                </>
              )}
              {canRollback && <Button variant="destructive" onClick={rollback} disabled={pending}><RotateCcw className="h-4 w-4 mr-1.5" />되돌리기</Button>}
            </div>
            {canCommit && (
              <p className="text-[11px] text-muted-foreground">
                실행 예정일을 지정하면 그날 00시(KST)에 자동 반영됩니다. 비우면 즉시 반영.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">학생 제출 원본</CardTitle></CardHeader>
          <CardContent>
            {props.studentMemo && <p className="mb-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">{props.studentMemo}</p>}
            <ScheduleSlotsEditor attendance={props.submittedAttendance} outings={props.submittedOutings} readOnly />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {props.feedbacks.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />학부모 피드백</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {props.feedbacks.map((f) => (
                  <li key={f.id} className="rounded-lg bg-rose-50/60 px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap text-foreground/90">{f.content}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{new Date(f.createdAt).toLocaleString("ko-KR")}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">버전 이력</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {props.versions.map((v) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">v{v.version}</span>
                  <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{STATUS_LABEL[v.status] ?? v.status}</span>
                  {v.committedAt && <span className="ml-auto text-[11px] text-emerald-600">{new Date(v.committedAt).toLocaleDateString("ko-KR")} 반영</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
