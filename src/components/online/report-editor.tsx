"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, Copy, Eye, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  updateReportContent,
  approveReport,
  markReportSent,
  regenerateReportDraft,
} from "@/actions/online/parent-reports";
import type { OnlineReportStatus } from "@/generated/prisma";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Notice, Section } from "@/components/backoffice/ui";
import { SentLockBar } from "@/components/online/report-status";
import { useConfirm } from "@/components/online/use-confirm";

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
  const [confirm, confirmDialog] = useConfirm();

  const isFailed = status === "DRAFT_FAILED";
  const isSent = status === "SENT";
  const editingLocked = isSent && !sentUnlocked;
  const canEdit = !editingLocked;
  const canApprove =
    status === "DRAFT" || status === "REVIEW";
  const canSend = status === "APPROVED" || status === "SENT";

  const hasEdits = markdown !== initialMarkdown;

  const unlockSent = async () => {
    if (
      await confirm({
        title: "발송한 보고서를 수정할까요?",
        description: "저장하면 학부모 공개 페이지에 바로 반영돼요.",
        confirmLabel: "재편집",
      })
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

  const doRegenerate = async () => {
    if (
      !(await confirm({
        title: "AI 초안을 다시 만들까요?",
        description: "지금 편집한 내용은 새 초안으로 덮어써져요.",
        confirmLabel: "다시 만들기",
        destructive: true,
      }))
    )
      return;
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

  const doApprove = async () => {
    if (hasEdits) {
      if (
        !(await confirm({
          title: "저장하지 않은 편집 내용이 있어요",
          description: "편집 내용을 저장한 뒤 승인할까요?",
          confirmLabel: "저장 후 승인",
        }))
      )
        return;
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

  const statusHint = isSent
    ? "발송 완료 — 학부모에게 링크를 전달한 뒤에도 같은 링크로 볼 수 있어요."
    : canSend
      ? "승인됐어요. 공개 링크를 복사해 학부모에게 보내면 발송 처리돼요."
      : "초안을 검토하고 저장한 뒤 승인해 주세요.";

  return (
    <div className="flex flex-col gap-x6">
      {isFailed && (
        <Notice tone="bad" title="초안 생성 실패">
          {errorMessage ? `${errorMessage} · ` : ""}
          ‘AI 재생성’으로 다시 시도하거나, 내용을 직접 작성하고 저장해 주세요.
        </Notice>
      )}

      <Section
        title="보고서 내용"
        description="마크다운으로 쓰면 학부모 공개 페이지에 그대로 보여요."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={doRegenerate}
            disabled={isPending || editingLocked}
          >
            <Sparkles />
            AI 재생성
          </Button>
        }
      >
        {isSent && (
          <SentLockBar
            className="mb-x3"
            unlocked={sentUnlocked}
            onUnlock={unlockSent}
            onCancel={cancelUnlock}
          />
        )}
        <Textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          disabled={!canEdit}
          rows={16}
          placeholder="**이번 주 학습 개요**..."
          aria-label="보고서 내용 (마크다운)"
          className="resize-y"
        />
      </Section>

      <Section title="미리 보기">
        <div className="rounded-r3 bg-bg-layer-fill p-x5">
          <MarkdownViewer source={markdown || "*(내용 없음)*"} />
        </div>
      </Section>

      {/* 하단 작업 줄 — 창 아래에 붙어 긴 보고서에서도 저장·승인이 보인다 */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-x3 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default px-x5 py-x3 shadow-[var(--seed-shadow-s2)] sm:flex-row sm:items-center sm:justify-between">
        <p className="t3-regular text-fg-neutral-subtle">
          {hasEdits && canEdit ? (
            <span className="t3-medium text-fg-warning">저장하지 않은 변경 사항이 있어요</span>
          ) : (
            statusHint
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x2 sm:justify-end">
          {isSent && (
            <Button asChild variant="ghost" size="sm">
              <Link href={publicUrl} target="_blank" rel="noopener">
                <Eye />
                공개 페이지 열기
              </Link>
            </Button>
          )}
          {canEdit && (
            <Button
              type="button"
              variant={canApprove || canSend ? "secondary" : "default"}
              size="sm"
              onClick={doSave}
              disabled={isPending || !hasEdits}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Check />}
              저장
            </Button>
          )}
          {canApprove && (
            <Button type="button" size="sm" onClick={doApprove} disabled={isPending}>
              <CheckCircle2 />
              승인
            </Button>
          )}
          {canSend && (
            <Button
              type="button"
              size="sm"
              variant={isSent ? "outline" : "default"}
              onClick={doCopy}
              disabled={isPending}
            >
              <Copy />
              공개 링크 복사 (발송 처리)
            </Button>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
