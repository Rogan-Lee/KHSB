"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Section, StatusBadge, type Tone } from "@/components/backoffice/ui";
import {
  Check,
  X,
  Shuffle,
  RotateCcw,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
} from "lucide-react";
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

const STATUS_META: Record<ExamApplicationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "대기", tone: "warn" },
  CONFIRMED: { label: "확정", tone: "ok" },
  CANCELLED: { label: "반려", tone: "bad" },
};

const STATUS_TABS: ExamApplicationStatus[] = ["PENDING", "CONFIRMED", "CANCELLED"];

const PAGE_SIZE = 5;

/** 5개 단위 페이징 목록 (탭마다 독립 페이지 상태). 페이저 스타일은 멘토링 목록과 동일. */
function PaginatedRows({
  rows,
  renderRow,
}: {
  rows: ApplicationRow[];
  renderRow: (a: ApplicationRow) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const start = current * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const pagerButton = "size-x8";
  return (
    <div className="flex flex-col gap-x3">
      <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
        {visible.map(renderRow)}
      </ul>
      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-x2">
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
            {current + 1} / {totalPages} 페이지
          </span>
          <div className="flex items-center gap-x1">
            <Button
              variant="ghost"
              size="icon"
              className={pagerButton}
              onClick={() => setPage(0)}
              disabled={current === 0}
              aria-label="첫 페이지"
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={pagerButton}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              aria-label="이전 페이지"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={pagerButton}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={current >= totalPages - 1}
              aria-label="다음 페이지"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={pagerButton}
              onClick={() => setPage(totalPages - 1)}
              disabled={current >= totalPages - 1}
              aria-label="마지막 페이지"
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      )}
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
    const iconButton = "size-x9";
    return (
      <li key={a.id} className="flex items-center gap-x3 px-x4 py-x3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x1_5">
            <span className="t4-medium text-fg-neutral">{a.studentName}</span>
            <span className="t3-regular text-fg-neutral-subtle">{a.grade}</span>
          </div>
          {a.memo && <p className="mt-x0_5 t3-regular text-fg-neutral-muted">{a.memo}</p>}
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        <div className="flex shrink-0 items-center gap-x0_5">
          {a.status !== "CONFIRMED" ? (
            <Button
              size="icon"
              variant="ghost"
              className={cn(iconButton, "text-fg-positive")}
              disabled={busy}
              aria-label={`${a.studentName} 확정`}
              title="확정"
              onClick={() => run(() => setExamApplicationStatus(a.id, "CONFIRMED"), "확정했습니다")}
            >
              <Check />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className={iconButton}
              disabled={busy}
              aria-label={`${a.studentName} 확정 취소`}
              title="확정 취소"
              onClick={() => run(() => setExamApplicationStatus(a.id, "PENDING"), "확정을 취소했습니다")}
            >
              <RotateCcw />
            </Button>
          )}
          {a.status !== "CANCELLED" ? (
            <Button
              size="icon"
              variant="ghost"
              className={cn(iconButton, "text-fg-critical")}
              disabled={busy}
              aria-label={`${a.studentName} 반려`}
              title="반려"
              onClick={() => run(() => setExamApplicationStatus(a.id, "CANCELLED"), "반려했습니다")}
            >
              <X />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className={iconButton}
              disabled={busy}
              aria-label={`${a.studentName} 대기로 되돌리기`}
              title="대기로 되돌리기"
              onClick={() => run(() => setExamApplicationStatus(a.id, "PENDING"), "대기로 되돌렸습니다")}
            >
              <RotateCcw />
            </Button>
          )}
        </div>
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
    <Section
      title="응시 신청"
      count={applications.length}
      description={
        <span className="inline-flex flex-wrap items-center gap-x1_5">
          <StatusBadge tone={applicationOpen ? "ok" : "gray"}>
            {applicationOpen ? "신청 접수 중" : "신청 닫힘"}
          </StatusBadge>
          <span className="tabular-nums">확정 {confirmedCount}명</span>
        </span>
      }
      actions={
        <>
          {applicationOpen && (
            <Button size="sm" variant="outline" disabled={busy} onClick={copyApplyLink}>
              <Copy />
              신청 링크 복사
            </Button>
          )}
          <Button
            size="sm"
            variant={applicationOpen ? "secondary" : confirmedCount === 0 ? "default" : "outline"}
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
            variant={confirmedCount > 0 ? "default" : "secondary"}
            disabled={busy || confirmedCount === 0}
            onClick={() =>
              run(async () => {
                const r = await assignSeatsFromConfirmedApplications(sessionId);
                return r;
              }, "확정 신청자를 좌석배정했습니다")
            }
          >
            <Shuffle />
            신청자 → 좌석배정
          </Button>
        </>
      }
    >
      {applications.length === 0 ? (
        <EmptyState
          compact
          icon={Inbox}
          title="아직 신청자가 없어요"
          description={
            applicationOpen
              ? "신청 링크를 복사해 학생들에게 보내 보세요."
              : "신청을 열면 학생들이 링크로 응시 신청을 할 수 있어요."
          }
        />
      ) : (
        <Tabs defaultValue="PENDING" className="w-full">
          <TabsList variant="segment">
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {STATUS_META[s].label}
                <span className="tabular-nums text-fg-neutral-subtle">{countOf(s)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {STATUS_TABS.map((s) => {
            const rows = applications.filter((a) => a.status === s);
            return (
              <TabsContent key={s} value={s} className="mt-x4">
                {rows.length === 0 ? (
                  <EmptyState compact title={`${STATUS_META[s].label} 상태의 신청자가 없어요`} />
                ) : (
                  <PaginatedRows rows={rows} renderRow={renderRow} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </Section>
  );
}
