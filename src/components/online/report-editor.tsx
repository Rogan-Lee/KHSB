"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, Copy, Eye, Lock, Unlock } from "lucide-react";
import Link from "next/link";
import {
  updateReportContent,
  approveReport,
  markReportSent,
  regenerateReportDraft,
} from "@/actions/online/parent-reports";
import type { OnlineReportStatus } from "@/generated/prisma";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";

export function ReportEditor({
  reportId,
  initialMarkdown,
  initialStatus,
  publicUrl,
  errorMessage,
}: {
  reportId: string;
  initialMarkdown: string;
  initialStatus: OnlineReportStatus;
  publicUrl: string;
  errorMessage: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [status, setStatus] = useState<OnlineReportStatus>(initialStatus);
  const [sentUnlocked, setSentUnlocked] = useState(false);

  const isFailed = status === "DRAFT_FAILED";
  const isSent = status === "SENT";
  const editingLocked = isSent && !sentUnlocked;
  const canEdit = !editingLocked;
  const canApprove =
    status === "DRAFT" || status === "REVIEW";
  const canSend = status === "APPROVED" || status === "SENT";

  const hasEdits = markdown !== initialMarkdown;

  const unlockSent = () => {
    if (
      confirm(
        "발송 완료된 보고서를 수정합니다.\n저장 시 학부모 공개 페이지에 즉시 반영됩니다.\n진행할까요?"
      )
    ) {
      setSentUnlocked(true);
    }
  };

  const cancelUnlock = () => {
    setSentUnlocked(false);
    setMarkdown(initialMarkdown);
  };

  const doSave = () => {
    if (!markdown.trim()) {
      toast.error("내용을 입력하세요");
      return;
    }
    startTransition(async () => {
      try {
        await updateReportContent({ reportId, markdown });
        toast.success("저장되었습니다");
        // SENT 보고서는 SENT 유지, 그 외엔 REVIEW 로 전환 (서버 동작과 일치)
        if (status !== "SENT") setStatus("REVIEW");
        setSentUnlocked(false); // 저장 후 SENT 잠금 자동 복귀
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  };

  const doRegenerate = () => {
    if (!confirm("AI 초안을 재생성합니다. 기존 편집 내용은 덮어쓰여집니다.")) return;
    startTransition(async () => {
      try {
        const result = await regenerateReportDraft(reportId);
        if (result.status === "DRAFT_FAILED") {
          toast.error("재생성 실패 — 데이터 부족 또는 AI 오류");
        } else {
          toast.success("재생성 완료");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "재생성 실패");
      }
    });
  };

  const doApprove = () => {
    if (hasEdits) {
      if (!confirm("편집 내용이 저장되지 않았습니다. 저장 후 승인하시겠어요?")) return;
    }
    startTransition(async () => {
      try {
        if (hasEdits) {
          await updateReportContent({ reportId, markdown });
        }
        await approveReport(reportId);
        toast.success("승인 완료 — 이제 발송할 수 있습니다");
        setStatus("APPROVED");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "승인 실패");
      }
    });
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("링크가 복사되었습니다");
      startTransition(async () => {
        try {
          await markReportSent({ reportId, channel: "MANUAL_COPY" });
          setStatus("SENT");
          router.refresh();
        } catch {
          // 이미 SENT 여도 무해
        }
      });
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  };

  return (
    <div className="space-y-4">
      {isFailed && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-900">
          <p className="font-semibold">초안 생성 실패</p>
          {errorMessage && <p className="mt-1 text-[11.5px] text-red-800">{errorMessage}</p>}
          <p className="mt-2 text-[11.5px]">재생성 버튼을 눌러 다시 시도하거나, 직접 내용을 작성하고 저장해 주세요.</p>
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13px] font-semibold text-ink">내용 편집 (Markdown)</h2>
          <button
            type="button"
            onClick={doRegenerate}
            disabled={isPending || editingLocked}
            className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-3 hover:text-ink hover:border-line-strong disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            AI 재생성
          </button>
        </div>
        {isSent && (
          <div
            className={`mb-2 flex items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-[12px] ${
              sentUnlocked
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {sentUnlocked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  재편집 모드 — 저장 시 학부모 페이지에 즉시 반영됩니다
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  발송 완료된 보고서입니다 (편집 잠김)
                </>
              )}
            </span>
            {sentUnlocked ? (
              <button
                type="button"
                onClick={cancelUnlock}
                className="rounded-[6px] border border-line bg-panel px-2 py-0.5 text-[11px] hover:border-line-strong"
              >
                취소
              </button>
            ) : (
              <button
                type="button"
                onClick={unlockSent}
                className="inline-flex items-center gap-1 rounded-[6px] bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-600"
              >
                <Unlock className="h-3 w-3" />
                재편집
              </button>
            )}
          </div>
        )}
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          disabled={!canEdit}
          rows={16}
          placeholder="**이번 주 학습 개요**..."
          className="w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] font-mono leading-relaxed resize-y focus:outline-none focus:border-line-strong disabled:opacity-60"
        />
      </section>

      <section className="rounded-[12px] border border-line bg-panel p-4">
        <h2 className="text-[13px] font-semibold text-ink mb-2">미리 보기</h2>
        <MarkdownViewer source={markdown || "*(내용 없음)*"} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-panel p-3">
        <div className="flex items-center gap-2 text-[12px]">
          {canEdit && (
            <button
              type="button"
              onClick={doSave}
              disabled={isPending || !hasEdits}
              className="rounded-[8px] border border-line bg-panel px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              저장
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              onClick={doApprove}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-[8px] bg-blue-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              승인
            </button>
          )}
          {canSend && (
            <button
              type="button"
              onClick={doCopy}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-[8px] bg-emerald-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" />
              공개 링크 복사 (발송 처리)
            </button>
          )}
          {isSent && (
            <Link
              href={publicUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-3 py-1.5 font-semibold text-ink-3 hover:text-ink"
            >
              <Eye className="h-3.5 w-3.5" />
              공개 페이지 열기
            </Link>
          )}
        </div>
        <p className="text-[11px] text-ink-5">
          {isSent
            ? "발송 완료 — 학부모에게 URL 전달 후 상태가 유지됩니다."
            : canSend
              ? "승인됨 · 이제 URL 복사로 발송하세요."
              : "초안 편집 중"}
        </p>
      </div>
    </div>
  );
}
