import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getHandoverById } from "@/actions/handover";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import {
  ArrowLeft,
  AlertTriangle,
  Pin,
  CheckCircle2,
  User,
  Pencil,
  CheckSquare,
  Square,
  Clock,
} from "lucide-react";
import { ConfirmButton } from "./confirm-button";
import { TaskToggleButton } from "./task-toggle-button";

export default async function HandoverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { id } = await params;
  const handover = await getHandoverById(id);
  if (!handover) notFound();

  const isRead = handover.reads.some((r) => r.userId === session.user.id);
  const isAuthor = handover.authorId === session.user.id;
  const isUrgent = handover.priority === "URGENT";

  const recipientIds: string[] = handover.recipientId
    ? (() => { try { const p = JSON.parse(handover.recipientId); return Array.isArray(p) ? p : [handover.recipientId]; } catch { return [handover.recipientId]; } })()
    : [];
  const recipientNames: string[] = handover.recipientName
    ? (() => { try { const p = JSON.parse(handover.recipientName); return Array.isArray(p) ? p : [handover.recipientName]; } catch { return [handover.recipientName]; } })()
    : [];

  const checkedCount = handover.checklist.filter((c) => c.isChecked).length;
  const completedTasks = handover.tasks.filter((t) => t.isCompleted).length;
  const initial = handover.authorName.slice(0, 1);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 뒤로가기 */}
      <Link
        href="/handover"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        목록으로
      </Link>

      {/* 헤더: 아바타 + 작성자 + 시간 */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isUrgent ? "bg-red-100 text-red-700" : "bg-[#eaf2fe] text-[#005eeb]"}`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold">{handover.authorName}</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(handover.date)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {isUrgent && (
              <Badge variant="destructive" className="text-[10px] gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />긴급
              </Badge>
            )}
            {handover.isPinned && (
              <Badge variant="outline" className="text-[10px] gap-0.5 bg-amber-50 text-amber-700 border-amber-200">
                <Pin className="h-2.5 w-2.5" />고정
              </Badge>
            )}
            {handover.category && (
              <Badge variant="secondary" className="text-[10px]">{handover.category}</Badge>
            )}
          </div>
        </div>
        {isAuthor && (
          <Link href={`/handover/${handover.id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <Pencil className="h-3.5 w-3.5" />수정
            </Button>
          </Link>
        )}
      </div>

      {/* 수신자 확인 현황 */}
      {recipientNames.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {recipientNames.map((name, idx) => {
            const rid = recipientIds[idx];
            const rRead = rid ? handover.reads.find((r) => r.userId === rid) : null;
            return (
              <span key={idx} className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 ${rRead ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
                <User className="h-3 w-3" />
                {name}
                {rRead ? <CheckCircle2 className="h-3 w-3" /> : <span className="opacity-60">미확인</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* 본문 */}
      {handover.content && (
        <div className="rounded-lg border bg-card p-5">
          <MarkdownViewer source={handover.content} />
        </div>
      )}

      {/* 할 일 */}
      {handover.tasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">할 일</h3>
            <span className="text-xs text-muted-foreground">{completedTasks}/{handover.tasks.length} 완료</span>
          </div>
          <div className="rounded-lg border bg-card divide-y">
            {handover.tasks.map((task) => (
              <div key={task.id} className="px-4 py-2.5">
                <TaskToggleButton
                  taskId={task.id}
                  title={task.title}
                  content={task.content}
                  assigneeName={task.assigneeName}
                  isCompleted={task.isCompleted}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 루틴 체크리스트 */}
      {handover.checklist.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">루틴</h3>
            <span className={`text-xs ${checkedCount === handover.checklist.length ? "text-green-600" : "text-orange-600"}`}>
              {checkedCount}/{handover.checklist.length}
            </span>
          </div>
          <div className="rounded-lg border bg-card overflow-hidden">
            {/* 진행률 바 */}
            <div className="w-full bg-muted h-1.5">
              <div
                className={`h-1.5 transition-all ${checkedCount === handover.checklist.length ? "bg-green-500" : "bg-orange-500"}`}
                style={{ width: `${handover.checklist.length > 0 ? (checkedCount / handover.checklist.length) * 100 : 0}%` }}
              />
            </div>
            <div className="divide-y">
              {handover.checklist.map((c) => (
                <div key={c.id} className={`flex items-center gap-2.5 px-4 py-2 text-sm ${c.isChecked ? "text-green-700" : "text-muted-foreground"}`}>
                  {c.isChecked ? <CheckSquare className="h-4 w-4 text-green-500 shrink-0" /> : <Square className="h-4 w-4 opacity-30 shrink-0" />}
                  <span className={c.isChecked ? "line-through" : ""}>{c.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 확인 영역 */}
      <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          {handover.reads.length}명 확인
        </div>
        {isAuthor ? null : isRead ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
            <CheckCircle2 className="h-4 w-4" />확인 완료
          </span>
        ) : (
          <ConfirmButton handoverId={handover.id} />
        )}
      </div>
    </div>
  );
}
