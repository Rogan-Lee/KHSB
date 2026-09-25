"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2, CirclePause, CirclePlay, Clock, Inbox, MessageSquare, MoreHorizontal, Plus, SearchX,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmptyState, FilterChip, Section, StatusBadge, Toolbar, type Tone,
} from "@/components/backoffice/ui";
import { updateRequestStatus } from "@/actions/feature-requests";
import {
  CATEGORY_OPTIONS, RELATED_PAGE_OPTIONS,
} from "@/lib/feature-request-constants";
import { cn } from "@/lib/utils";
import type { FeatureRequest, RequestStatus } from "@/generated/prisma";

type FeatureRequestWithCount = FeatureRequest & {
  _count: { comments: number };
};

const STATUS_CONFIG: Record<RequestStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  PENDING: { label: "대기", tone: "warn", icon: Clock },
  IN_PROGRESS: { label: "진행중", tone: "info", icon: CirclePlay },
  DONE: { label: "완료", tone: "ok", icon: CheckCircle2 },
  ON_HOLD: { label: "보류", tone: "gray", icon: CirclePause },
};

const STATUS_ORDER: RequestStatus[] = ["PENDING", "IN_PROGRESS", "DONE", "ON_HOLD"];

/** 분류 배지 색 — 버그만 위험색, 나머지는 정보 계열 */
const CATEGORY_TONE: Record<string, Tone> = {
  BUG: "bad",
  FEATURE: "violet",
  IMPROVEMENT: "info",
};
// kit StatusBadge 는 violet 을 informative(파랑)로 그려 '개선'과 겹친다 → SEED 보라 팔레트로 구분
const VIOLET_BADGE = "bg-palette-purple-100 text-palette-purple-700";

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>;
}

/** 목록 미리보기 — 마크다운 이미지·제목 기호를 걷어낸 한 줄 */
function previewText(md: string | null) {
  if (!md) return "";
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function RequestRow({
  request,
  onRefresh,
}: {
  request: FeatureRequestWithCount;
  onRefresh: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const categoryCfg = CATEGORY_OPTIONS.find((c) => c.value === request.category);
  const relatedPageCfg = RELATED_PAGE_OPTIONS.find((p) => p.value === request.relatedPage);
  const subdued = request.status === "DONE" || request.status === "ON_HOLD";
  const preview = previewText(request.description);

  function handleStatusChange(status: RequestStatus) {
    startTransition(async () => {
      try {
        await updateRequestStatus(request.id, status);
        onRefresh();
      } catch {
        toast.error("상태 변경 실패");
      }
    });
  }

  const meta: ReactNode[] = [
    new Date(request.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    request.authorName,
    request.requester ? `요청자 ${request.requester}` : null,
    relatedPageCfg?.label ?? null,
    request._count.comments > 0 ? (
      <span className="inline-flex items-center gap-x0_5">
        <MessageSquare className="size-3.5" aria-hidden />
        <span className="sr-only">댓글</span>
        {request._count.comments}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <li className="relative flex items-start transition-colors hover:bg-bg-layer-default-pressed">
      <Link
        href={`/requests/${request.id}`}
        className="flex min-w-0 flex-1 flex-col gap-x1 py-x4 pl-x5 pr-x2 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-stroke-focus-ring"
      >
        <div className="flex flex-wrap items-center gap-x-x2 gap-y-x1">
          <span
            className={cn(
              "min-w-0 break-words t5-medium",
              subdued ? "text-fg-neutral-subtle" : "text-fg-neutral",
            )}
          >
            {request.title}
          </span>
          <span className="flex flex-wrap items-center gap-x1">
            <RequestStatusBadge status={request.status} />
            {categoryCfg && (
              <StatusBadge
                tone={CATEGORY_TONE[categoryCfg.value] ?? "gray"}
                className={CATEGORY_TONE[categoryCfg.value] === "violet" ? VIOLET_BADGE : undefined}
              >
                {categoryCfg.label}
              </StatusBadge>
            )}
            {request.priority === "URGENT" && <StatusBadge tone="bad">긴급</StatusBadge>}
          </span>
        </div>

        {preview && (
          <p className="line-clamp-1 t4-regular text-fg-neutral-muted">{preview}</p>
        )}

        <div className="mt-x0_5 flex flex-wrap items-center gap-x-x1_5 gap-y-x0_5 t3-regular text-fg-neutral-subtle tabular-nums">
          {meta.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-x1_5">
              {i > 0 && <span aria-hidden>·</span>}
              {m}
            </span>
          ))}
        </div>
      </Link>

      {/* Quick status */}
      <div className="relative z-10 shrink-0 py-x3 pr-x3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isPending} aria-label="상태 변경">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>상태 변경</DropdownMenuLabel>
            {STATUS_ORDER.filter((s) => s !== request.status).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              return (
                <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)}>
                  <Icon className="text-fg-neutral-subtle" aria-hidden />
                  {cfg.label}로 변경
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function FeatureRequestBoard({ requests }: { requests: FeatureRequestWithCount[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const filtered = requests.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    return true;
  });

  const counts: Record<string, number> = {
    ALL: requests.length,
    PENDING: requests.filter((r) => r.status === "PENDING").length,
    IN_PROGRESS: requests.filter((r) => r.status === "IN_PROGRESS").length,
    DONE: requests.filter((r) => r.status === "DONE").length,
    ON_HOLD: requests.filter((r) => r.status === "ON_HOLD").length,
  };

  const statusChips: { value: string; label: string }[] = [
    { value: "ALL", label: "전체" },
    ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_CONFIG[s].label })),
  ];

  function resetFilters() {
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
  }

  if (requests.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Inbox}
          title="아직 등록된 요청이 없어요"
          description="불편한 점이나 필요한 기능을 요청으로 남겨 주세요."
          action={
            <Button asChild>
              <Link href="/requests/new">
                <Plus aria-hidden />
                요청 등록
              </Link>
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <Toolbar>
        <div className="flex flex-wrap items-center gap-x1_5" role="group" aria-label="상태 필터">
          {statusChips.map((c) => (
            <FilterChip
              key={c.value}
              selected={statusFilter === c.value}
              count={counts[c.value]}
              onClick={() => setStatusFilter(c.value)}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>

        <div className="flex w-full items-center gap-x2 sm:ml-auto sm:w-auto">
          <span className="t3-regular text-fg-neutral-subtle tabular-nums">{filtered.length}건</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="ml-auto h-9 w-36 sm:ml-0" aria-label="분류 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체 분류</SelectItem>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      {/* List */}
      <Section flush className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title="조건에 맞는 요청이 없어요"
            description="다른 상태나 분류를 골라 보세요."
            action={
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                필터 초기화
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted">
            {filtered.map((r) => (
              <RequestRow key={r.id} request={r} onRefresh={() => router.refresh()} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
