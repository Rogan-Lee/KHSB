"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateRequestStatus } from "@/actions/feature-requests";
import {
  CATEGORY_OPTIONS, PRIORITY_OPTIONS, RELATED_PAGE_OPTIONS,
} from "@/lib/feature-request-constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, MoreHorizontal, Clock, Loader2, CheckCircle2, Pause, MessageSquare,
} from "lucide-react";
import Link from "next/link";
import type { FeatureRequest, RequestStatus } from "@/generated/prisma";

type FeatureRequestWithCount = FeatureRequest & {
  _count: { comments: number };
};

const STATUS_CONFIG: Record<RequestStatus, {
  label: string; icon: React.ElementType; style: string;
  badgeVariant: "default" | "secondary" | "outline" | "destructive";
}> = {
  PENDING: { label: "대기", icon: Clock, style: "text-amber-600", badgeVariant: "outline" },
  IN_PROGRESS: { label: "진행중", icon: Loader2, style: "text-blue-600", badgeVariant: "default" },
  DONE: { label: "완료", icon: CheckCircle2, style: "text-green-600", badgeVariant: "secondary" },
  ON_HOLD: { label: "보류", icon: Pause, style: "text-gray-500", badgeVariant: "outline" },
};

const STATUS_ORDER: RequestStatus[] = ["PENDING", "IN_PROGRESS", "DONE", "ON_HOLD"];

function StatusBadge({ status }: { status: RequestStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.badgeVariant} className={cn("gap-1 text-xs", cfg.style)}>
      <Icon className={cn("h-3 w-3", status === "IN_PROGRESS" && "animate-spin")} />
      {cfg.label}
    </Badge>
  );
}

function RequestCard({
  request,
  onRefresh,
}: {
  request: FeatureRequestWithCount;
  onRefresh: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const categoryCfg = CATEGORY_OPTIONS.find((c) => c.value === request.category);
  const relatedPageCfg = RELATED_PAGE_OPTIONS.find((p) => p.value === request.relatedPage);

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

  return (
    <Card className={cn(
      "transition-colors hover:border-primary/30",
      request.status === "DONE" && "opacity-60",
      request.status === "ON_HOLD" && "opacity-50",
    )}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/requests/${request.id}`} className="flex-1 min-w-0 space-y-1.5">
            {/* Title + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn(
                "font-medium text-sm",
                request.status === "DONE" && "line-through text-muted-foreground",
              )}>
                {request.title}
              </h3>
              <StatusBadge status={request.status} />
              {categoryCfg && (
                <Badge variant="outline" className={cn("text-[10px] border", categoryCfg.bg, categoryCfg.color)}>
                  {categoryCfg.label}
                </Badge>
              )}
              {request.priority === "URGENT" && (
                <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-600">
                  긴급
                </Badge>
              )}
            </div>

            {/* Description preview */}
            {request.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{request.description}</p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {relatedPageCfg && <span>{relatedPageCfg.label}</span>}
              {request.requester && <span>{request.requester}</span>}
              <span>{new Date(request.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
              <span>{request.authorName}</span>
              {request._count.comments > 0 && (
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" />
                  {request._count.comments}
                </span>
              )}
            </div>
          </Link>

          {/* Quick status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={isPending}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUS_ORDER.filter((s) => s !== request.status).map((s) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                return (
                  <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)}>
                    <Icon className={cn("h-3.5 w-3.5 mr-2", cfg.style)} />
                    {cfg.label}로 변경
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
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

  const counts = {
    ALL: requests.length,
    PENDING: requests.filter((r) => r.status === "PENDING").length,
    IN_PROGRESS: requests.filter((r) => r.status === "IN_PROGRESS").length,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 ({counts.ALL})</SelectItem>
            <SelectItem value="PENDING">대기 ({counts.PENDING})</SelectItem>
            <SelectItem value="IN_PROGRESS">진행중 ({counts.IN_PROGRESS})</SelectItem>
            <SelectItem value="DONE">완료</SelectItem>
            <SelectItem value="ON_HOLD">보류</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 카테고리</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">{filtered.length}건</span>

        <Link href="/requests/new" className="ml-auto">
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            요청 등록
          </Button>
        </Link>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {requests.length === 0 ? "등록된 요청이 없습니다" : "해당 조건의 요청이 없습니다"}
          </div>
        ) : (
          filtered.map((r) => (
            <RequestCard key={r.id} request={r} onRefresh={() => router.refresh()} />
          ))
        )}
      </div>
    </div>
  );
}
