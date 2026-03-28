"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TimePickerInput } from "@/components/ui/time-picker";
import { updateMentoring, sendFeedbackEmail, updateMentoringStatus } from "@/actions/mentoring";
import { toast } from "sonner";
import type { Mentoring } from "@/generated/prisma";
import { Mail, CheckCircle2, ChevronDown, ChevronUp, History, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParentReportDialog } from "./parent-report-dialog";
import { useDraft } from "@/hooks/use-draft";

export type PreviousMentoring = {
  id: string;
  scheduledAt: Date;
  actualDate?: Date | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  content?: string | null;
  improvements?: string | null;
  weaknesses?: string | null;
  nextGoals?: string | null;
  notes?: string | null;
};

interface Props {
  mentoring: Mentoring;
  studentName: string;
  parentEmail?: string | null;
  previousMentoring?: PreviousMentoring | null;
}

type MentoringDraft = {
  content: string;
  improvements: string;
  weaknesses: string;
  nextGoals: string;
  notes: string;
  actualStartTime: string;
  actualEndTime: string;
};

function NowButton({ onSet }: { onSet: (t: string) => void }) {
  function handleClick() {
    const now = new Date();
    onSet(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-xs text-primary hover:underline underline-offset-2 whitespace-nowrap"
    >
      지금
    </button>
  );
}

function PreviousMentoringCard({ prev }: { prev: PreviousMentoring }) {
  const [open, setOpen] = useState(true);
  const dateStr = (prev.actualDate ?? prev.scheduledAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">이전 멘토링 기록</span>
          <span className="text-xs text-muted-foreground">{dateStr}</span>
          {prev.actualStartTime && prev.actualEndTime && (
            <span className="text-xs text-muted-foreground font-mono">
              {prev.actualStartTime}~{prev.actualEndTime}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t">
          {prev.content && (
            <div className="pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">멘토링 내용</p>
              <p className="text-sm bg-background rounded p-2 border whitespace-pre-wrap">{prev.content}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {prev.improvements && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">개선된 점</p>
                <p className="text-sm bg-background rounded p-2 border whitespace-pre-wrap">{prev.improvements}</p>
              </div>
            )}
            {prev.weaknesses && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">부족한 점</p>
                <p className="text-sm bg-background rounded p-2 border whitespace-pre-wrap">{prev.weaknesses}</p>
              </div>
            )}
          </div>
          {prev.nextGoals && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">다음 멘토링 목표 → 이번 이전 전달 내용으로 자동 입력됨</p>
              <p className="text-sm bg-primary/5 border border-primary/20 rounded p-2 whitespace-pre-wrap">{prev.nextGoals}</p>
            </div>
          )}
          {prev.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">메모</p>
              <p className="text-sm bg-background rounded p-2 border whitespace-pre-wrap">{prev.notes}</p>
            </div>
          )}
          {!prev.content && !prev.improvements && !prev.weaknesses && !prev.nextGoals && !prev.notes && (
            <p className="text-xs text-muted-foreground pt-3">기록된 내용이 없습니다</p>
          )}
        </div>
      )}
    </div>
  );
}

export function MentoringRecordForm({ mentoring, studentName, parentEmail, previousMentoring }: Props) {
  const [isPending, startTransition] = useTransition();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const [draft, setDraft, clearDraft] = useDraft<MentoringDraft>(
    `mentoring-record-${mentoring.id}`,
    {
      content: mentoring.content ?? "",
      improvements: mentoring.improvements ?? "",
      weaknesses: mentoring.weaknesses ?? "",
      nextGoals: mentoring.nextGoals ?? "",
      notes: mentoring.notes ?? "",
      actualStartTime: mentoring.actualStartTime ?? "",
      actualEndTime: mentoring.actualEndTime ?? "",
    }
  );

  const defaultActualDate = mentoring.actualDate
    ? new Date(mentoring.actualDate).toISOString().split("T")[0]
    : "";

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateMentoring(mentoring.id, formData);
        clearDraft();
        toast.success("저장되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      try {
        await updateMentoringStatus(mentoring.id, "COMPLETED");
        toast.success("완료 처리되었습니다");
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  function handleSendFeedback() {
    startTransition(async () => {
      try {
        const result = await sendFeedbackEmail(mentoring.id);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch {
        toast.error("발송 실패");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* 이전 멘토링 기록 (읽기 전용) */}
      {previousMentoring && <PreviousMentoringCard prev={previousMentoring} />}
      {!previousMentoring && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          이전 멘토링 기록이 없습니다 (첫 멘토링)
        </div>
      )}

      <form action={handleSubmit} className="space-y-5">
        {/* 상태 + 날짜 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>상태</Label>
            <Select name="status" defaultValue={mentoring.status}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">예정</SelectItem>
                <SelectItem value="COMPLETED">완료</SelectItem>
                <SelectItem value="CANCELLED">취소</SelectItem>
                <SelectItem value="RESCHEDULED">일정변경</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>실제 진행일</Label>
            <Input name="actualDate" type="date" defaultValue={defaultActualDate} />
          </div>
        </div>

        {/* 시작/종료 시각 + 지금 버튼 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>실제 시작 시각</Label>
              <NowButton onSet={(v) => setDraft((d) => ({ ...d, actualStartTime: v }))} />
            </div>
            <input type="hidden" name="actualStartTime" value={draft.actualStartTime} />
            <TimePickerInput
              value={draft.actualStartTime}
              onChange={(v) => setDraft((d) => ({ ...d, actualStartTime: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>실제 종료 시각</Label>
              <NowButton onSet={(v) => setDraft((d) => ({ ...d, actualEndTime: v }))} />
            </div>
            <input type="hidden" name="actualEndTime" value={draft.actualEndTime} />
            <TimePickerInput
              value={draft.actualEndTime}
              onChange={(v) => setDraft((d) => ({ ...d, actualEndTime: v }))}
            />
          </div>
        </div>

        {/* 피드백 내용 */}
        <div className="border-t pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="content">오늘 멘토링 내용</Label>
            <Textarea
              id="content"
              name="content"
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="오늘 다룬 주제, 내용, 진행 상황..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="improvements">개선된 점</Label>
              <Textarea
                id="improvements"
                name="improvements"
                value={draft.improvements}
                onChange={(e) => setDraft((d) => ({ ...d, improvements: e.target.value }))}
                placeholder="지난 번보다 나아진 부분..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weaknesses">부족한 점</Label>
              <Textarea
                id="weaknesses"
                name="weaknesses"
                value={draft.weaknesses}
                onChange={(e) => setDraft((d) => ({ ...d, weaknesses: e.target.value }))}
                placeholder="여전히 부족하거나 보완이 필요한 부분..."
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nextGoals">다음 멘토링 목표</Label>
            <Textarea
              id="nextGoals"
              name="nextGoals"
              value={draft.nextGoals}
              onChange={(e) => setDraft((d) => ({ ...d, nextGoals: e.target.value }))}
              placeholder="다음 멘토링까지 달성해야 할 목표와 과제..."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">학부모 안내 메시지</Label>
            <Textarea
              id="notes"
              name="notes"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="학부모 리포트에 포함될 안내 메시지를 입력하세요..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <Button type="submit" disabled={isPending}>
            {isPending ? "저장 중..." : "저장"}
          </Button>
          {mentoring.status === "SCHEDULED" && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleComplete}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              완료 처리
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReportDialogOpen(true)}
              className="gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              학부모 리포트
            </Button>
            {mentoring.feedbackSentAt && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {new Date(mentoring.feedbackSentAt).toLocaleDateString("ko-KR")} 발송됨
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSendFeedback}
              disabled={isPending || !parentEmail}
              title={!parentEmail ? "학부모 이메일이 등록되지 않았습니다" : ""}
            >
              <Mail className="h-4 w-4 mr-1.5" />
              피드백 발송
            </Button>
            {!parentEmail && (
              <span className="text-xs text-muted-foreground">이메일 미등록</span>
            )}
          </div>
        </div>
      </form>

      <ParentReportDialog
        mentoringId={mentoring.id}
        studentName={studentName}
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
      />

    </div>
  );
}
