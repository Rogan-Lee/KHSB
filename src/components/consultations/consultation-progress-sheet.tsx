"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { TimePickerInput } from "@/components/ui/time-picker";
import { updateConsultation, getStudentConsultationHistory } from "@/actions/consultations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { ChevronDown } from "lucide-react";
import { FormField, StatusBadge } from "@/components/backoffice/ui";
import { formatKST } from "./consultation-tones";

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

function PastConsultationCard({ c }: { c: PastConsultation }) {
  const [open, setOpen] = useState(false);
  const dateStr = c.actualDate ?? c.scheduledAt;
  const rows: { label: string; value: string | null }[] = [
    { label: "주제", value: c.agenda },
    { label: "결과", value: c.outcome },
    { label: "사후조치", value: c.followUp },
    { label: "메모", value: c.notes },
  ];

  return (
    <div className="overflow-hidden rounded-r3 bg-bg-layer-fill">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="flex w-full items-center gap-x3 px-x4 py-x3 text-left transition-colors hover:bg-bg-neutral-weak"
      >
        <span className="shrink-0 t4-medium tabular-nums text-fg-neutral">
          {dateStr ? formatKST(dateStr) : "날짜 미정"}
        </span>
        {c.agenda && (
          <span className="min-w-0 flex-1 truncate t4-regular text-fg-neutral-subtle">{c.agenda}</span>
        )}
        <ChevronDown
          className={cn("ml-auto size-4 shrink-0 text-fg-neutral-subtle transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <dl className="flex flex-col gap-x2 border-t border-stroke-neutral-muted px-x4 py-x3">
          {rows.filter((r) => r.value).map((r) => (
            <div key={r.label} className="grid grid-cols-[4.5rem_1fr] gap-x2 t4-regular">
              <dt className="text-fg-neutral-subtle">{r.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-fg-neutral">{r.value}</dd>
            </div>
          ))}
        </dl>
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
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-stroke-neutral-muted px-x6 pb-x5 pt-x6 pr-x14">
          <StatusBadge tone="info" className="self-start">면담 진행 중</StatusBadge>
          <SheetTitle className="mt-x2">
            {c.student.name}
            <span className="ml-x2 t5-regular text-fg-neutral-subtle">{c.student.grade}</span>
          </SheetTitle>
          {c.scheduledAt && (
            <SheetDescription className="tabular-nums">예정 {formatKST(c.scheduledAt)}</SheetDescription>
          )}
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-x6 overflow-y-auto px-x6 py-x5">
          {/* Past consultations */}
          {pastList.length > 0 && (
            <div className="flex flex-col gap-x2">
              <p className="t4-bold text-fg-neutral">
                이전 면담 기록
                <span className="ml-x1_5 tabular-nums text-fg-brand">{pastList.length}</span>
              </p>
              <div className="flex flex-col gap-x1_5">
                {pastList.map((p) => <PastConsultationCard key={p.id} c={p} />)}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="flex flex-col gap-x4">
            <div className="flex flex-col gap-x2">
              <div className="flex items-center justify-between gap-x2">
                <span className="t4-medium text-fg-neutral">실제 면담 일시</span>
                <Button type="button" variant="link" onClick={handleNowDate} className="t3-medium">
                  지금으로 입력
                </Button>
              </div>
              <div className="flex flex-wrap gap-x2">
                <DatePicker value={actualDatePart || null} onChange={(d) => setActualDatePart(d ?? "")} placeholder="날짜 선택" />
                <TimePickerInput value={actualTimePart} onChange={setActualTimePart} />
              </div>
            </div>

            <FormField label="면담 주제" htmlFor="progress-agenda">
              <Textarea
                id="progress-agenda"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="면담 주제를 입력하세요..."
                rows={3}
                className="resize-none"
              />
            </FormField>

            <FormField label="결과" htmlFor="progress-outcome">
              <Textarea
                id="progress-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="면담 결과를 입력하세요..."
                rows={3}
                className="resize-none"
              />
            </FormField>

            <FormField label="사후조치" htmlFor="progress-followup">
              <Textarea
                id="progress-followup"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="사후조치 사항을 입력하세요..."
                rows={2}
                className="resize-none"
              />
            </FormField>

            <FormField label="메모" htmlFor="progress-notes">
              <Textarea
                id="progress-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="기타 메모..."
                rows={2}
                className="resize-none"
              />
            </FormField>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted px-x6 py-x4">
          <Button type="button" variant="ghost" size="sm" onClick={handleSaveDraft}>
            임시저장
          </Button>
          <div className="ml-auto flex items-center gap-x2">
            <Button type="button" variant="outline" onClick={handleSave} disabled={isPending}>
              {isPending ? "저장 중…" : "저장"}
            </Button>
            <Button type="button" onClick={handleComplete} disabled={isPending}>
              완료 처리
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
