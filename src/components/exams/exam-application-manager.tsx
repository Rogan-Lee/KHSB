"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronRight, Inbox, Share2 } from "lucide-react";
import { toggleExamApplicationOpen } from "@/actions/exam-application";
import { EmptyState, StatusBadge, TableCard } from "@/components/backoffice/ui";
import { ExamApplyLinkShare } from "@/components/exams/exam-apply-link-share";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";
import type { ExamType } from "@/generated/prisma";

export type ManagerSession = {
  id: string;
  title: string;
  examDate: string; // ISO
  examType: ExamType;
  applicationOpen: boolean;
  applicationsCount: number;
};

/** 시험관리 '신청 관리' 탭 — 상세로 들어가지 않고 여기서 신청 열기/닫기 + 링크 공유. */
export function ExamApplicationManager({ sessions }: { sessions: ManagerSession[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [shareId, setShareId] = useState<string | null>(null);

  function toggle(s: ManagerSession) {
    startTransition(async () => {
      try {
        await toggleExamApplicationOpen(s.id, !s.applicationOpen);
        toast.success(s.applicationOpen ? "신청을 닫았습니다" : "신청을 열었습니다");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <TableCard>
        <EmptyState
          icon={Inbox}
          title="신청을 받을 시험이 없어요"
          description="모의고사·학력평가 세션을 만들면 여기서 학생 신청을 열고 닫을 수 있어요."
        />
      </TableCard>
    );
  }

  return (
    <TableCard>
      <ul className="divide-y divide-stroke-neutral-muted">
        {sessions.map((s) => {
          const sharing = s.applicationOpen && shareId === s.id;
          return (
            <li key={s.id} className="px-x5 py-x4">
              <div className="flex flex-wrap items-center gap-x3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x2">
                    <Link href={`/exams/${s.id}`} className="t5-bold text-fg-neutral hover:underline">
                      {s.title}
                    </Link>
                    <StatusBadge tone={s.applicationOpen ? "ok" : "gray"}>
                      {s.applicationOpen ? "신청 열림" : "신청 닫힘"}
                    </StatusBadge>
                  </div>
                  <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                    {EXAM_TYPE_LABELS[s.examType]} · {s.examDate.slice(0, 10).replaceAll("-", ".")} · 신청자{" "}
                    <span className="t3-medium text-fg-neutral-muted">{s.applicationsCount}명</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-x1_5">
                  {s.applicationOpen && (
                    <Button
                      size="sm"
                      variant={sharing ? "secondary" : "outline"}
                      onClick={() => setShareId((cur) => (cur === s.id ? null : s.id))}
                      aria-expanded={sharing}
                    >
                      <Share2 />
                      링크 공유
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={s.applicationOpen ? "secondary" : "default"}
                    disabled={busy}
                    onClick={() => toggle(s)}
                  >
                    {s.applicationOpen ? "신청 닫기" : "신청 열기"}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-x9" asChild>
                    <Link href={`/exams/${s.id}`} aria-label={`${s.title} 상세`}>
                      <ChevronRight />
                    </Link>
                  </Button>
                </div>
              </div>
              {sharing && (
                <div className="mt-x3">
                  <ExamApplyLinkShare sessionId={s.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </TableCard>
  );
}
