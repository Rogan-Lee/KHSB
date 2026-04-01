"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import {
  updateRequestStatus, deleteFeatureRequest,
  createFeatureRequestComment, deleteFeatureRequestComment,
} from "@/actions/feature-requests";
import {
  CATEGORY_OPTIONS, PRIORITY_OPTIONS, RELATED_PAGE_OPTIONS, ROLE_LABEL,
} from "@/lib/feature-request-constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, MoreHorizontal, Clock, Loader2, CheckCircle2, Pause,
  Trash2, Send, MessageSquare,
} from "lucide-react";
import Link from "next/link";
import type { RequestStatus, FeatureRequestComment } from "@/generated/prisma";

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
  const router = useRouter();

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
    startTransition(async () => {
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
    c.authorId === currentUserId || currentUserRole === "ADMIN" || currentUserRole === "DIRECTOR";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          댓글 {comments.length > 0 && <span className="text-muted-foreground text-sm font-normal">{comments.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">아직 댓글이 없습니다</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3 group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{c.authorName}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {ROLE_LABEL[c.authorRole] ?? c.authorRole}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                {canDelete(c) && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={isPending}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 ml-auto"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.content}</p>
            </div>
          </div>
        ))}

        <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요..."
            rows={2}
            className="resize-none text-sm"
          />
          <Button type="submit" size="icon" disabled={isPending || !content.trim()} className="shrink-0 self-end">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
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
  const StatusIcon = statusCfg.icon;
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
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/requests" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold flex-1">{request.title}</h1>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={isPending}>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={statusCfg.badgeVariant} className={cn("gap-1", statusCfg.style)}>
          <StatusIcon className={cn("h-3 w-3", request.status === "IN_PROGRESS" && "animate-spin")} />
          {statusCfg.label}
        </Badge>
        {categoryCfg && (
          <Badge variant="outline" className={cn("border", categoryCfg.bg, categoryCfg.color)}>
            {categoryCfg.label}
          </Badge>
        )}
        {priorityCfg && request.priority === "URGENT" && (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
            {priorityCfg.label}
          </Badge>
        )}
        {relatedPageCfg && (
          <Badge variant="secondary">{relatedPageCfg.label}</Badge>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{request.authorName}</span>
        <span>{formatDate(request.createdAt)}</span>
        {request.requester && <span>요청자: {request.requester}</span>}
      </div>

      {/* Description */}
      <Card>
        <CardContent className="pt-4">
          {request.description ? (
            <MarkdownViewer source={request.description} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">상세 설명이 없습니다</p>
          )}
        </CardContent>
      </Card>

      {/* Comments */}
      <CommentSection
        comments={request.comments}
        requestId={request.id}
        currentUserId={currentUser.id}
        currentUserRole={currentUser.role}
      />

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>요청 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            이 요청을 삭제하시겠습니까? 댓글도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>취소</Button>
            <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
              {isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
