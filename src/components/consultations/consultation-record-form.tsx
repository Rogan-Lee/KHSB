"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimePickerInput } from "@/components/ui/time-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { updateConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { History, ChevronDown, ChevronUp, CalendarDays, ClipboardList, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{c.agenda}</span>
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
    <div className="space-y-5">
      {/* Previous consultations */}
      {previousConsultations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">이전 면담 기록</p>
          <div className="space-y-1.5">
            {previousConsultations.map((c) => <PastConsultationCard key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="space-y-4">
        {/* 유형 / 분류 선택 */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">상담 유형</p>
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 border">
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setConsultType(opt.value)}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    consultType === opt.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">상담 분류</p>
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 border">
              {CATEGORY_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setConsultCategory(opt.value)}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    consultCategory === opt.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {scheduledAt && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span>예정: {formatKST(scheduledAt)}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">실제 면담 일시</Label>
            <button
              type="button"
              onClick={handleNowDate}
              className="text-xs text-primary hover:underline underline-offset-2"
            >
              지금
            </button>
          </div>
          <div className="flex gap-2">
            <DatePicker value={actualDatePart || null} onChange={(d) => setActualDatePart(d ?? "")} placeholder="날짜 선택" />
            <TimePickerInput value={actualTimePart} onChange={setActualTimePart} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">면담 주제</Label>
          <div className="min-h-[200px] border rounded-lg overflow-hidden">
            <MarkdownEditor value={agenda} onChange={setAgenda} placeholder="면담 주제를 입력하세요..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">결과</Label>
          <div className="min-h-[200px] border rounded-lg overflow-hidden">
            <MarkdownEditor value={outcome} onChange={setOutcome} placeholder="면담 결과를 입력하세요..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">사후조치</Label>
          <div className="min-h-[150px] border rounded-lg overflow-hidden">
            <MarkdownEditor value={followUp} onChange={setFollowUp} placeholder="사후조치 사항을 입력하세요..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">메모</Label>
          <div className="min-h-[150px] border rounded-lg overflow-hidden">
            <MarkdownEditor value={notes} onChange={setNotes} placeholder="기타 메모..." />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="button" variant="outline" onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중..." : "저장"}
        </Button>
        <Button
          type="button"
          onClick={handleComplete}
          disabled={isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          완료처리
        </Button>
      </div>
    </div>
  );
}
