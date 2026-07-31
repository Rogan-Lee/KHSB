"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, X, Shuffle, RotateCcw } from "lucide-react";
import {
  toggleExamApplicationOpen,
  setExamApplicationStatus,
  assignSeatsFromConfirmedApplications,
} from "@/actions/exam-application";
import type { ExamApplicationStatus } from "@/generated/prisma";

export type ApplicationRow = {
  id: string;
  studentName: string;
  grade: string;
  status: ExamApplicationStatus;
  memo: string | null;
};

const STATUS_META: Record<ExamApplicationStatus, { label: string; tone: string }> = {
  PENDING: { label: "대기", tone: "bg-warn-soft text-warn-ink" },
  CONFIRMED: { label: "확정", tone: "bg-ok-soft text-ok-ink" },
  CANCELLED: { label: "반려", tone: "bg-bad-soft text-bad-ink" },
};

export function ExamApplicationAdmin({
  sessionId,
  applicationOpen,
  applications,
}: {
  sessionId: string;
  applicationOpen: boolean;
  applications: ApplicationRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  const confirmedCount = applications.filter((a) => a.status === "CONFIRMED").length;

  function run(fn: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">신청자 ({applications.length}명)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            신청 접수: {applicationOpen ? "열림" : "닫힘"} · 확정 {confirmedCount}명
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={applicationOpen ? "outline" : "default"}
            disabled={busy}
            onClick={() =>
              run(
                () => toggleExamApplicationOpen(sessionId, !applicationOpen),
                applicationOpen ? "신청을 닫았습니다" : "신청을 열었습니다"
              )
            }
          >
            {applicationOpen ? "신청 닫기" : "신청 열기"}
          </Button>
          <Button
            size="sm"
            disabled={busy || confirmedCount === 0}
            onClick={() =>
              run(async () => {
                const r = await assignSeatsFromConfirmedApplications(sessionId);
                return r;
              }, "확정 신청자를 좌석배정했습니다")
            }
          >
            <Shuffle className="h-4 w-4 mr-1" />
            신청자 → 좌석배정
          </Button>
        </div>
      </div>

      {applications.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">아직 신청자가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {applications.map((a) => {
            const meta = STATUS_META[a.status];
            return (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{a.studentName}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{a.grade}</span>
                  {a.memo && <p className="mt-0.5 text-xs text-muted-foreground">{a.memo}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                  {meta.label}
                </span>
                {a.status !== "CONFIRMED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => setExamApplicationStatus(a.id, "CONFIRMED"), "확정했습니다")}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => setExamApplicationStatus(a.id, "PENDING"), "확정을 취소했습니다")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                {a.status !== "CANCELLED" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => run(() => setExamApplicationStatus(a.id, "CANCELLED"), "반려했습니다")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
