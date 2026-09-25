"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TimePickerInput } from "@/components/ui/time-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { updateConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { ChevronDown, CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormActions, FormField, Segmented } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
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

interface Props {
  consultationId: string;
  scheduledAt: Date | null;
  actualDate: Date | null;
  agenda: string | null;
  outcome: string | null;
  followUp: string | null;
  notes: string | null;
  consultationType: string | null;
  consultationCategory: string | null;
  previousConsultations: PastConsultation[];
}

const TYPE_OPTIONS = [
  { value: "STUDENT", label: "학생 상담" },
  { value: "PARENT", label: "학부모 상담" },
];
const CATEGORY_OPTIONS = [
  { value: "ENROLLED", label: "재원생" },
  { value: "NEW_ADMISSION", label: "신규 입실" },
  { value: "CONSIDERING", label: "등록 고민" },
];

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

function getDraftKey(id: string) { return `consultation-draft-${id}`; }
type Draft = { actualDatePart: string; actualTimePart: string; agenda: string; outcome: string; followUp: string; notes: string; };
function loadDraft(id: string): Draft | null {
  try { return JSON.parse(localStorage.getItem(getDraftKey(id)) ?? "null"); } catch { return null; }
}
function saveDraftStorage(id: string, d: Draft) {
  try { localStorage.setItem(getDraftKey(id), JSON.stringify(d)); } catch { /* ignore */ }
}
function clearDraftStorage(id: string) {
  try { localStorage.removeItem(getDraftKey(id)); } catch { /* ignore */ }
}

export function ConsultationRecordForm({
  consultationId,
  scheduledAt,
  actualDate: initialActualDate,
  agenda: initialAgenda,
  outcome: initialOutcome,
  followUp: initialFollowUp,
  notes: initialNotes,
  consultationType: initialType,
  consultationCategory: initialCategory,
  previousConsultations,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [consultType, setConsultType] = useState(initialType ?? "STUDENT");
  const [consultCategory, setConsultCategory] = useState(initialCategory ?? "ENROLLED");

  const saved = typeof window !== "undefined" ? loadDraft(consultationId) : null;
  const defaultDatetime = saved
    ? null
    : initialActualDate?.toISOString().slice(0, 16) ?? "";

  const [actualDatePart, setActualDatePart] = useState(
    saved?.actualDatePart ?? (defaultDatetime?.slice(0, 10) ?? "")
  );
  const [actualTimePart, setActualTimePart] = useState(
    saved?.actualTimePart ?? (defaultDatetime?.slice(11, 16) ?? "")
  );
  const [agenda, setAgenda] = useState(saved?.agenda ?? initialAgenda ?? "");
  const [outcome, setOutcome] = useState(saved?.outcome ?? initialOutcome ?? "");
  const [followUp, setFollowUp] = useState(saved?.followUp ?? initialFollowUp ?? "");
  const [notes, setNotes] = useState(saved?.notes ?? initialNotes ?? "");

  const actualDateCombined = actualDatePart
    ? `${actualDatePart}T${actualTimePart || "00:00"}`
    : "";

  function currentDraft(): Draft {
    return { actualDatePart, actualTimePart, agenda, outcome, followUp, notes };
  }

  function handleNowDate() {
    const now = new Date();
    setActualDatePart(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    setActualTimePart(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  }

  function buildFd(status?: string) {
    const fd = new FormData();
    if (actualDateCombined) fd.set("actualDate", actualDateCombined);
    fd.set("type", consultType);
    fd.set("category", consultCategory);
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
        await updateConsultation(consultationId, buildFd());
        clearDraftStorage(consultationId);
        toast.success("저장되었습니다");
        router.refresh();
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      try {
        // 1) 내용 먼저 저장
        await updateConsultation(consultationId, buildFd());
        // 2) 상태만 완료로 변경
        const statusFd = new FormData();
        statusFd.set("status", "COMPLETED");
        await updateConsultation(consultationId, statusFd);
        clearDraftStorage(consultationId);
        toast.success("면담이 완료 처리되었습니다");
        window.location.href = "/consultations";
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x6">
      {/* Previous consultations */}
      {previousConsultations.length > 0 && (
        <div className="flex flex-col gap-x2">
          <p className="t4-bold text-fg-neutral">
            이전 면담 기록
            <span className="ml-x1_5 tabular-nums text-fg-brand">{previousConsultations.length}</span>
          </p>
          <div className="flex flex-col gap-x1_5">
            {previousConsultations.map((c) => <PastConsultationCard key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="flex flex-col gap-x5">
        {/* 유형 / 분류 선택 */}
        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
          <FormField label="상담 유형">
            <Segmented
              aria-label="상담 유형"
              value={consultType}
              onChange={setConsultType}
              options={TYPE_OPTIONS}
            />
          </FormField>
          <FormField label="상담 분류">
            <Segmented
              aria-label="상담 분류"
              value={consultCategory}
              onChange={setConsultCategory}
              options={CATEGORY_OPTIONS}
            />
          </FormField>
        </div>

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
          {scheduledAt && (
            <p className="flex items-center gap-x1_5 t3-regular tabular-nums text-fg-neutral-subtle">
              <CalendarDays className="size-3.5" aria-hidden />
              예정 {formatKST(scheduledAt)}
            </p>
          )}
        </div>

        <FormField label="면담 주제">
          <div className="min-h-[200px] overflow-hidden rounded-r2 border border-stroke-neutral-weak">
            <MarkdownEditor value={agenda} onChange={setAgenda} placeholder="면담 주제를 입력하세요..." />
          </div>
        </FormField>

        <FormField label="결과">
          <div className="min-h-[200px] overflow-hidden rounded-r2 border border-stroke-neutral-weak">
            <MarkdownEditor value={outcome} onChange={setOutcome} placeholder="면담 결과를 입력하세요..." />
          </div>
        </FormField>

        <FormField label="사후조치">
          <div className="min-h-[150px] overflow-hidden rounded-r2 border border-stroke-neutral-weak">
            <MarkdownEditor value={followUp} onChange={setFollowUp} placeholder="사후조치 사항을 입력하세요..." />
          </div>
        </FormField>

        <FormField label="메모">
          <div className="min-h-[150px] overflow-hidden rounded-r2 border border-stroke-neutral-weak">
            <MarkdownEditor value={notes} onChange={setNotes} placeholder="기타 메모..." />
          </div>
        </FormField>
      </div>

      <FormActions className="border-t border-stroke-neutral-muted pt-x5 [&>button]:max-sm:flex-1">
        <Button type="button" variant="outline" onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중…" : "저장"}
        </Button>
        <Button type="button" onClick={handleComplete} disabled={isPending}>
          {isPending ? "처리 중…" : "완료 처리"}
        </Button>
      </FormActions>
    </div>
  );
}
