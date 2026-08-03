"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/ui/pager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Shuffle, RotateCcw, Copy } from "lucide-react";
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

const STATUS_TABS: ExamApplicationStatus[] = ["PENDING", "CONFIRMED", "CANCELLED"];

const PAGE_SIZE = 5;

/** 5개 단위 페이징 목록 (탭마다 독립 페이지 상태). */
function PaginatedRows({
  rows,
  renderRow,
}: {
  rows: ApplicationRow[];
  renderRow: (a: ApplicationRow) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.slice(start, start + PAGE_SIZE).map(renderRow)}
      </ul>
      <Pager page={current} pageCount={pageCount} onPage={setPage} className="pt-1" />
    </div>
  );
}

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
  const countOf = (s: ExamApplicationStatus) => applications.filter((a) => a.status === s).length;

  function renderRow(a: ApplicationRow) {
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
        {a.status !== "CANCELLED" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => run(() => setExamApplicationStatus(a.id, "CANCELLED"), "반려했습니다")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => run(() => setExamApplicationStatus(a.id, "PENDING"), "대기로 되돌렸습니다")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </li>
    );
  }

  async function copyApplyLink() {
    const link = `${window.location.origin}/exam-apply/${sessionId}`;
    const msg = `📢 모의고사 신청 안내\n아래 링크에서 휴대폰 본인인증 후 신청해주세요 👇\n${link}`;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("신청 링크가 복사되었습니다 (카톡·문자로 전달하세요)");
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

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
          {applicationOpen && (
            <Button size="sm" variant="outline" disabled={busy} onClick={copyApplyLink}>
              <Copy className="h-4 w-4 mr-1" />
              신청 링크 복사
            </Button>
          )}
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
        <Tabs defaultValue="PENDING" className="w-full">
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {STATUS_META[s].label}
                <span className="ml-1.5 text-[10px] text-muted-foreground">({countOf(s)})</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {STATUS_TABS.map((s) => {
            const rows = applications.filter((a) => a.status === s);
            return (
              <TabsContent key={s} value={s} className="mt-3">
                {rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {STATUS_META[s].label} 상태의 신청자가 없습니다.
                  </p>
                ) : (
                  <PaginatedRows rows={rows} renderRow={renderRow} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
