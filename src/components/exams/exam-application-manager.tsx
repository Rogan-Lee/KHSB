"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Share2, ChevronRight } from "lucide-react";
import { toggleExamApplicationOpen } from "@/actions/exam-application";
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
      <div className="py-12 text-center text-sm text-muted-foreground">
        신청 대상 시험(모의고사·학력평가)이 없습니다.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {sessions.map((s) => (
        <li key={s.id} className="space-y-2 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Link href={`/exams/${s.id}`} className="text-sm font-medium hover:underline">
                {s.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {EXAM_TYPE_LABELS[s.examType]} · {s.examDate.slice(0, 10)} ·{" "}
                <span className={s.applicationOpen ? "font-medium text-ok-ink" : ""}>
                  신청 {s.applicationOpen ? "열림" : "닫힘"}
                </span>{" "}
                · 신청자 {s.applicationsCount}명
              </p>
            </div>
            <Button
              size="sm"
              variant={s.applicationOpen ? "outline" : "default"}
              disabled={busy}
              onClick={() => toggle(s)}
            >
              {s.applicationOpen ? "신청 닫기" : "신청 열기"}
            </Button>
            {s.applicationOpen && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareId((cur) => (cur === s.id ? null : s.id))}
                aria-label="신청 링크 공유"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            <Link href={`/exams/${s.id}`} aria-label="상세">
              <Button size="sm" variant="ghost">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          {s.applicationOpen && shareId === s.id && <ExamApplyLinkShare sessionId={s.id} />}
        </li>
      ))}
    </ul>
  );
}
