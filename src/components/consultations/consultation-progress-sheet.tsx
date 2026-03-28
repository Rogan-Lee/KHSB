"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { TimePickerInput } from "@/components/ui/time-picker";
import { updateConsultation, getStudentConsultationHistory } from "@/actions/consultations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { History, ChevronDown, ChevronUp, CalendarDays, ClipboardList, MessageSquare } from "lucide-react";

type PastConsultation = {
  id: string;
  scheduledAt: Date | null;
  actualDate: Date | null;
  agenda: string | null;
  outcome: string | null;
  followUp: string | null;
  notes: string | null;
};

type Consultation = {
  id: string;
  scheduledAt: Date | null;
  actualDate?: Date | null;
  status: string;
  agenda: string | null;
  notes?: string | null;
  outcome: string | null;
  followUp: string | null;
  student: { id: string; name: string; grade: string };
};

function formatKST(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = dayNames[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const timeStr = hh === "00" && mm === "00" ? "" : ` ${hh}:${mm}`;
  return `${m}월 ${d}일 (${dow})${timeStr}`;
}

function PastConsultationCard({ c }: { c: PastConsultation }) {
  const [open, setOpen] = useState(false);
  const dateStr = c.actualDate ?? c.scheduledAt;

  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">
            {dateStr ? formatKST(dateStr) : "날짜 미정"}
          </span>
          {c.agenda && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">{c.agenda}</span>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs text-foreground/80 border-t bg-muted/10">
          {c.agenda && (
            <div className="flex items-start gap-1.5 pt-2">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div><span className="text-muted-foreground">주제:</span> {c.agenda}</div>
            </div>
          )}
          {c.outcome && (
            <div className="flex items-start gap-1.5">
              <ClipboardList className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div><span className="text-muted-foreground">결과:</span> {c.outcome}</div>
            </div>
          )}
          {c.followUp && (
            <div className="flex items-start gap-1.5">
              <ClipboardList className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div><span className="text-muted-foreground">사후조치:</span> {c.followUp}</div>
            </div>
          )}
          {c.notes && (
            <div className="flex items-start gap-1.5">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <div><span className="text-muted-foreground">메모:</span> {c.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Draft = {
  actualDate: string;
  agenda: string;
  outcome: string;
  followUp: string;
  notes: string;
};

function getDraftKey(id: string) {
  return `consultation-draft-${id}`;
}

function loadDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(id: string, draft: Draft) {
  try {
    localStorage.setItem(getDraftKey(id), JSON.stringify(draft));
  } catch {
    // ignore
  }
}

function clearDraft(id: string) {
  try {
    localStorage.removeItem(getDraftKey(id));
  } catch {
    // ignore
  }
}

interface Props {
  consultation: Consultation;
  open: boolean;
  onClose: () => void;
}

export function ConsultationProgressSheet({ consultation: c, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [pastList, setPastList] = useState<PastConsultation[]>([]);

  const savedDraft = typeof window !== "undefined" ? loadDraft(c.id) : null;
  const defaultActualDatetime = savedDraft?.actualDate ?? c.actualDate?.toISOString().slice(0, 16) ?? "";
  const [actualDatePart, setActualDatePart] = useState(defaultActualDatetime.slice(0, 10));
  const [actualTimePart, setActualTimePart] = useState(defaultActualDatetime.slice(11, 16));
  const [agenda, setAgenda] = useState(savedDraft?.agenda ?? c.agenda ?? "");
  const [outcome, setOutcome] = useState(savedDraft?.outcome ?? c.outcome ?? "");
  const [followUp, setFollowUp] = useState(savedDraft?.followUp ?? c.followUp ?? "");
  const [notes, setNotes] = useState(savedDraft?.notes ?? (c.notes as string | null | undefined) ?? "");

  useEffect(() => {
    if (!open) return;
    getStudentConsultationHistory(c.student.id, c.id)
      .then(setPastList)
      .catch(() => {});
  }, [open, c.student.id, c.id]);

  const actualDate = actualDatePart
    ? `${actualDatePart}T${actualTimePart || "00:00"}`
    : "";

  function handleSaveDraft() {
    saveDraft(c.id, { actualDate, agenda, outcome, followUp, notes });
    toast.success("임시저장되었습니다");
  }

  function handleNowDate() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    setActualDatePart(`${y}-${mo}-${d}`);
    setActualTimePart(`${h}:${mi}`);
  }

  function buildFormData(status?: string) {
    const fd = new FormData();
    if (actualDate) fd.set("actualDate", actualDate);
    fd.set("agenda", agenda);
    fd.set("outcome", outcome);
    fd.set("followUp", followUp);
    fd.set("notes", notes);
    if (status) fd.set("status", status);
    return fd;
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateConsultation(c.id, buildFormData());
        saveDraft(c.id, { actualDate, agenda, outcome, followUp, notes });
        toast.success("저장되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      try {
        await updateConsultation(c.id, buildFormData("COMPLETED"));
        clearDraft(c.id);
        toast.success("면담이 완료 처리되었습니다");
        onClose();
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <span>{c.student.name}</span>
            <span className="text-sm font-normal text-muted-foreground">{c.student.grade}</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
              면담 진행 중
            </span>
          </SheetTitle>
          {c.scheduledAt && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              예정: {formatKST(c.scheduledAt)}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Past consultations */}
          {pastList.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">이전 면담 기록</p>
              <div className="space-y-1.5">
                {pastList.map((p) => <PastConsultationCard key={p.id} c={p} />)}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">실제 면담 일시</Label>
                <button
                  type="button"
                  onClick={handleNowDate}
                  className="text-xs text-primary hover:underline underline-offset-2"
                >
                  지금
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={actualDatePart}
                  onChange={(e) => setActualDatePart(e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
                />
                <TimePickerInput value={actualTimePart} onChange={setActualTimePart} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">면담 주제</Label>
              <Textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="면담 주제를 입력하세요..."
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">결과</Label>
              <Textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="면담 결과를 입력하세요..."
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">사후조치</Label>
              <Textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="사후조치 사항을 입력하세요..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">메모</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="기타 메모..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t px-5 py-4 flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={handleSaveDraft}>
            임시저장
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "저장 중..." : "저장"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleComplete}
            disabled={isPending}
            className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            완료처리
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
