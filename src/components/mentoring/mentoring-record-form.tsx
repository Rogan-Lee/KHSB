"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TimePickerInput } from "@/components/ui/time-picker";
import {
  updateMentoring,
  sendFeedbackEmail,
  updateMentoringStatus,
} from "@/actions/mentoring";
import { toast } from "sonner";
import type { Mentoring, Photo } from "@/generated/prisma";
import { useRouter } from "next/navigation";
import { Mail, CheckCircle2, ChevronDown, History, Link2 } from "lucide-react";
import { ParentReportDialog } from "./parent-report-dialog";
import { MentoringPhotoUploader } from "./mentoring-photo-uploader";
import { useDraft } from "@/hooks/use-draft";
import { FormField } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

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
  photos?: Photo[];
  backUrl?: string;
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

function NowButton({ onSet, label }: { onSet: (t: string) => void; label: string }) {
  function handleClick() {
    const now = new Date();
    onSet(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  }
  return (
    <Button type="button" variant="link" onClick={handleClick} aria-label={`${label}을 지금 시각으로`} className="t3-medium">
      지금
    </Button>
  );
}

/** 이전 기록 한 칸 — 라벨 + 본문 */
function PrevBlock({ label, children, highlight = false }: { label: string; children: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-x1 t3-medium text-fg-neutral-subtle">{label}</p>
      <p
        className={cn(
          "whitespace-pre-wrap rounded-r2 px-x3 py-x2_5 t4-regular text-fg-neutral",
          highlight ? "bg-bg-brand-weak" : "bg-bg-layer-default"
        )}
      >
        {children}
      </p>
    </div>
  );
}

function PreviousMentoringCard({ prev }: { prev: PreviousMentoring }) {
  const [open, setOpen] = useState(true);
  const dateStr = (prev.actualDate ?? prev.scheduledAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="overflow-hidden rounded-r3 bg-bg-layer-fill">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-x3 px-x4 py-x3 text-left transition-colors hover:bg-bg-neutral-weak"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x2">
          <History className="size-4 text-fg-neutral-subtle" aria-hidden />
          <span className="t4-bold text-fg-neutral">이전 멘토링 기록</span>
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
            {dateStr}
            {prev.actualStartTime && prev.actualEndTime && ` · ${prev.actualStartTime}~${prev.actualEndTime}`}
          </span>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-fg-neutral-subtle transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="flex flex-col gap-x3 px-x4 pb-x4">
          {prev.content && <PrevBlock label="멘토링 내용">{prev.content}</PrevBlock>}
          {(prev.improvements || prev.weaknesses) && (
            <div className="grid grid-cols-1 gap-x3 sm:grid-cols-2">
              {prev.improvements && <PrevBlock label="개선된 점">{prev.improvements}</PrevBlock>}
              {prev.weaknesses && <PrevBlock label="부족한 점">{prev.weaknesses}</PrevBlock>}
            </div>
          )}
          {prev.nextGoals && (
            <PrevBlock label="다음 멘토링 목표 · 이번 멘토링에서 이어서 확인해요" highlight>
              {prev.nextGoals}
            </PrevBlock>
          )}
          {prev.notes && <PrevBlock label="메모">{prev.notes}</PrevBlock>}
          {!prev.content && !prev.improvements && !prev.weaknesses && !prev.nextGoals && !prev.notes && (
            <p className="t3-regular text-fg-neutral-subtle">기록된 내용이 없어요</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 폼 소제목 */
function FormGroup({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-x4 border-t border-stroke-neutral-muted pt-x6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="t5-bold text-fg-neutral">{title}</h3>
        {description && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function MentoringRecordForm({ mentoring, studentName, parentEmail, previousMentoring, photos = [], backUrl }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
        router.refresh();
        router.push(backUrl || "/mentoring");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      try {
        // 1. 폼 내용 먼저 저장 (내용 유실 방지)
        if (formRef.current) {
          const formData = new FormData(formRef.current);
          await updateMentoring(mentoring.id, formData);
        }
        // 2. 상태를 COMPLETED로 변경
        await updateMentoringStatus(mentoring.id, "COMPLETED");
        clearDraft();
        toast.success("완료 처리되었습니다");
        router.refresh();
        router.push(backUrl || "/mentoring");
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  // 리포트는 DB 에 저장된 기록으로 만들어지므로, 작성 중인 내용을 먼저 저장(화면 이동 없이)한 뒤 연다.
  // 초안(sessionStorage)은 저장된 내용과 같으므로 지우지 않는다 — clearDraft 는 편집기를 초기 props 로 되돌림.
  function handleOpenReport() {
    startTransition(async () => {
      try {
        if (formRef.current) {
          await updateMentoring(mentoring.id, new FormData(formRef.current));
        }
        router.refresh();
        setReportDialogOpen(true);
      } catch {
        toast.error("저장에 실패했습니다");
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

  const editorFields: { key: "content" | "improvements" | "weaknesses" | "nextGoals" | "notes"; label: string; placeholder: string; hint?: string }[] = [
    { key: "content", label: "오늘 멘토링 내용", placeholder: "오늘 다룬 주제, 내용, 진행 상황..." },
    { key: "improvements", label: "개선된 점", placeholder: "지난 번보다 나아진 부분..." },
    { key: "weaknesses", label: "부족한 점", placeholder: "여전히 부족하거나 보완이 필요한 부분..." },
    { key: "nextGoals", label: "다음 멘토링 목표", placeholder: "다음 멘토링까지 달성해야 할 목표와 과제..." },
    { key: "notes", label: "학부모 안내 메시지", placeholder: "학부모 리포트에 포함될 안내 메시지를 입력하세요...", hint: "학부모 리포트에 함께 실려요" },
  ];

  return (
    <div className="flex flex-col gap-x6">
      {/* 이전 멘토링 기록 (읽기 전용) */}
      {previousMentoring ? (
        <PreviousMentoringCard prev={previousMentoring} />
      ) : (
        <div className="flex items-center gap-x2 rounded-r3 bg-bg-layer-fill px-x4 py-x3 t3-regular text-fg-neutral-subtle">
          <History className="size-4" aria-hidden />
          이전 멘토링 기록이 없어요 (첫 멘토링)
        </div>
      )}

      <form ref={formRef} action={handleSubmit} className="flex flex-col gap-x6">
        {/* 진행 정보 */}
        <FormGroup title="진행 정보">
          <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
            <FormField label="상태">
              <Select name="status" defaultValue={mentoring.status}>
                <SelectTrigger aria-label="상태"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">예정</SelectItem>
                  <SelectItem value="COMPLETED">완료</SelectItem>
                  <SelectItem value="CANCELLED">취소</SelectItem>
                  <SelectItem value="RESCHEDULED">일정변경</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="실제 진행일">
              <DatePicker name="actualDate" defaultValue={defaultActualDate} placeholder="날짜 선택" className="h-10 px-x3 t4-medium" />
            </FormField>

            <div className="flex flex-col gap-x2">
              <div className="flex items-center justify-between">
                <span className="t4-medium text-fg-neutral">실제 시작 시각</span>
                <NowButton label="시작 시각" onSet={(v) => setDraft((d) => ({ ...d, actualStartTime: v }))} />
              </div>
              <input type="hidden" name="actualStartTime" value={draft.actualStartTime} />
              <TimePickerInput
                value={draft.actualStartTime}
                onChange={(v) => setDraft((d) => ({ ...d, actualStartTime: v }))}
                minHour={7}
              />
            </div>
            <div className="flex flex-col gap-x2">
              <div className="flex items-center justify-between">
                <span className="t4-medium text-fg-neutral">실제 종료 시각</span>
                <NowButton label="종료 시각" onSet={(v) => setDraft((d) => ({ ...d, actualEndTime: v }))} />
              </div>
              <input type="hidden" name="actualEndTime" value={draft.actualEndTime} />
              <TimePickerInput
                value={draft.actualEndTime}
                onChange={(v) => setDraft((d) => ({ ...d, actualEndTime: v }))}
                minHour={7}
              />
            </div>
          </div>
        </FormGroup>

        {/* 피드백 내용 */}
        <FormGroup title="멘토링 내용" description="저장하기 전까지 작성 중인 내용은 이 탭에 임시로 보관돼요">
          {/* hidden inputs for MarkdownEditor fields */}
          <input type="hidden" name="content" value={draft.content} />
          <input type="hidden" name="improvements" value={draft.improvements} />
          <input type="hidden" name="weaknesses" value={draft.weaknesses} />
          <input type="hidden" name="nextGoals" value={draft.nextGoals} />
          <input type="hidden" name="notes" value={draft.notes} />

          {editorFields.map((f) => (
            <FormField key={f.key} label={f.label} hint={f.hint}>
              <MarkdownEditor
                value={draft[f.key]}
                onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                placeholder={f.placeholder}
              />
            </FormField>
          ))}
        </FormGroup>

        {/* 첨부 사진 (KDA / 추가 / 자유) — Sprint 5 PR 5.1 이식 */}
        <FormGroup title="첨부 사진">
          <MentoringPhotoUploader mentoringId={mentoring.id} existing={photos} />
        </FormGroup>

        {/* 하단 버튼 — 스크롤해도 보이도록 고정 */}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-col-reverse gap-x3 rounded-b-r4 border-t border-stroke-neutral-muted bg-bg-layer-default px-x5 py-x3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSendFeedback}
              disabled={isPending || !parentEmail}
              title={!parentEmail ? "학부모 이메일이 등록되지 않았습니다" : ""}
            >
              <Mail />
              피드백 발송
            </Button>
            {mentoring.feedbackSentAt && (
              <span className="inline-flex items-center gap-x1 t3-medium text-fg-positive">
                <CheckCircle2 className="size-4" aria-hidden />
                {new Date(mentoring.feedbackSentAt).toLocaleDateString("ko-KR")} 발송됨
              </span>
            )}
            {!parentEmail && (
              <span className="t3-regular text-fg-neutral-subtle">이메일 미등록</span>
            )}
          </div>

          <div className="flex items-center gap-x2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? "저장 중…" : "저장"}
            </Button>
            {/* 예정 상태에선 완료 처리가, 그 외엔 리포트 생성이 이 바의 주 버튼 */}
            <Button
              type="button"
              variant={mentoring.status === "SCHEDULED" ? "outline" : "default"}
              disabled={isPending}
              onClick={handleOpenReport}
              title="작성한 내용을 저장한 뒤 학부모 리포트를 만들어요"
            >
              <Link2 />
              리포트 생성
            </Button>
            {mentoring.status === "SCHEDULED" && (
              <Button
                type="button"
                disabled={isPending}
                onClick={handleComplete}
              >
                <CheckCircle2 />
                완료 처리
              </Button>
            )}
          </div>
        </div>
      </form>

      <ParentReportDialog
        mentoringId={mentoring.id}
        studentName={studentName}
        mentoringDate={new Date(mentoring.actualDate ?? mentoring.scheduledAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
      />

    </div>
  );
}
