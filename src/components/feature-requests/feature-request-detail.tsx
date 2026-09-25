"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import {
  Avatar, DescriptionList, EmptyState, PageHeader, Section, StatusBadge, type Tone,
} from "@/components/backoffice/ui";
import {
  updateRequestStatus, deleteFeatureRequest,
  createFeatureRequestComment, deleteFeatureRequestComment,
} from "@/actions/feature-requests";
import {
  CATEGORY_OPTIONS, PRIORITY_OPTIONS, RELATED_PAGE_OPTIONS, ROLE_LABEL,
} from "@/lib/feature-request-constants";
import { toast } from "sonner";
import {
  CheckCircle2, ChevronDown, CirclePause, CirclePlay, Clock, FileText, MessageSquare, Trash2,
  type LucideIcon,
} from "lucide-react";
import type { RequestStatus, FeatureRequestComment } from "@/generated/prisma";

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

type Request = {
  id: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  category: string;
  priority: string;
  relatedPage: string | null;
  requester: string | null;
  authorId: string;
  authorName: string;
  comments: FeatureRequestComment[];
  createdAt: Date;
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function CommentSection({
  comments,
  requestId,
  currentUserId,
  currentUserRole,
}: {
  comments: FeatureRequestComment[];
  requestId: string;
  currentUserId: string;
  currentUserRole: string;
}) {
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();
  const busy = isPending || isDeleting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      try {
        await createFeatureRequestComment(requestId, content);
        setContent("");
        toast.success("댓글이 등록되었습니다");
        router.refresh();
      } catch {
        toast.error("댓글 등록에 실패했습니다");
      }
    });
  }

  function handleDelete(commentId: string) {
    startDeleteTransition(async () => {
      try {
        await deleteFeatureRequestComment(commentId);
        toast.success("댓글이 삭제되었습니다");
        router.refresh();
      } catch {
        toast.error("삭제에 실패했습니다");
      }
    });
  }

  const canDelete = (c: FeatureRequestComment) =>
    c.authorId === currentUserId || currentUserRole === "SUPER_ADMIN" || currentUserRole === "DIRECTOR";

  return (
    <Section title="댓글" count={comments.length} flush>
      {comments.length === 0 ? (
        <EmptyState compact icon={MessageSquare} title="아직 댓글이 없어요" description="진행 상황이나 확인할 점을 남겨 주세요." />
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted">
          {comments.map((c) => (
            <li key={c.id} className="group flex gap-x3 px-x5 py-x4">
              <Avatar name={c.authorName} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex min-h-8 flex-wrap items-center gap-x-x2 gap-y-x0_5">
                  <span className="t4-bold text-fg-neutral">{c.authorName}</span>
                  <StatusBadge tone="gray">{ROLE_LABEL[c.authorRole] ?? c.authorRole}</StatusBadge>
                  <span className="t3-regular text-fg-neutral-subtle tabular-nums">{formatDate(c.createdAt)}</span>
                  {canDelete(c) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={busy}
                      aria-label="댓글 삭제"
                      className="ml-auto grid size-x8 place-items-center rounded-full text-fg-neutral-subtle outline-none transition-[opacity,color,background-color] hover:bg-bg-transparent-pressed hover:text-fg-critical focus-visible:ring-2 focus-visible:ring-stroke-focus-ring disabled:pointer-events-none disabled:text-fg-disabled sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <p className="mt-x0_5 whitespace-pre-wrap break-words t4-regular text-fg-neutral">{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-x2 border-t border-stroke-neutral-muted p-x5 sm:flex-row sm:items-end"
      >
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="댓글을 입력하세요..."
          aria-label="댓글 입력"
          rows={2}
          className="flex-1 resize-none"
        />
        <Button type="submit" disabled={busy || !content.trim()} className="w-full sm:w-auto">
          {isPending ? "등록 중…" : "등록"}
        </Button>
      </form>
    </Section>
  );
}

export function FeatureRequestDetail({
  request,
  currentUser,
}: {
  request: Request;
  currentUser: { id: string; role: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const statusCfg = STATUS_CONFIG[request.status];
  const categoryCfg = CATEGORY_OPTIONS.find((c) => c.value === request.category);
  const priorityCfg = PRIORITY_OPTIONS.find((p) => p.value === request.priority);
  const relatedPageCfg = RELATED_PAGE_OPTIONS.find((p) => p.value === request.relatedPage);

  function handleStatusChange(status: RequestStatus) {
    startTransition(async () => {
      try {
        await updateRequestStatus(request.id, status);
        toast.success(`${STATUS_CONFIG[status].label}(으)로 변경되었습니다`);
        router.refresh();
      } catch {
        toast.error("상태 변경에 실패했습니다");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteFeatureRequest(request.id);
        toast.success("삭제되었습니다");
        router.push("/requests");
      } catch {
        toast.error("삭제에 실패했습니다");
      }
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/requests", label: "요청 목록" }}
        title={<span className="break-words">{request.title}</span>}
        meta={
          <span className="flex flex-wrap items-center gap-x1">
            <StatusBadge tone={statusCfg.tone} size="large">{statusCfg.label}</StatusBadge>
            {categoryCfg && (
              <StatusBadge
                tone={CATEGORY_TONE[categoryCfg.value] ?? "gray"}
                className={CATEGORY_TONE[categoryCfg.value] === "violet" ? VIOLET_BADGE : undefined}
                size="large"
              >
                {categoryCfg.label}
              </StatusBadge>
            )}
            {priorityCfg && request.priority === "URGENT" && (
              <StatusBadge tone="bad" size="large">{priorityCfg.label}</StatusBadge>
            )}
          </span>
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isPending}>
                  상태 변경
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
            <Button
              variant="ghost"
              className="text-fg-critical"
              disabled={isPending}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden />
              삭제
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-x4">
        {/* 요청 정보 */}
        <Section>
          <DescriptionList
            items={[
              { label: "작성자", value: request.authorName },
              { label: "등록일", value: <span className="tabular-nums">{formatDate(request.createdAt)}</span> },
              { label: "요청자", value: request.requester || "—" },
              { label: "관련 페이지", value: relatedPageCfg?.label ?? "—" },
            ]}
          />
        </Section>

        {/* 상세 설명 */}
        <Section title="상세 설명">
          {request.description ? (
            <MarkdownViewer source={request.description} />
          ) : (
            <EmptyState compact icon={FileText} title="상세 설명이 없어요" />
          )}
        </Section>

        {/* 댓글 */}
        <CommentSection
          comments={request.comments}
          requestId={request.id}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
        />
      </div>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>요청 삭제</DialogTitle>
            <DialogDescription>
              이 요청을 삭제하시겠습니까? 댓글도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>취소</Button>
            <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
              {isPending ? "삭제 중…" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
