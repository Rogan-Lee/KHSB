import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getHandoverById, recordHandoverView } from "@/actions/handover";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Pin, CheckCircle2, Pencil } from "lucide-react";
import { PageHeader, ProgressBar, Section, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmButton } from "./confirm-button";
import { ChecklistToggleButton } from "./checklist-toggle-button";
import { TaskToggleButton } from "./task-toggle-button";
import { HandoverComments } from "./handover-comments";
import { isFullAccess } from "@/lib/roles";

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
  // 존재하는 인수인계에만 열람 기록 (없는/삭제된 id 로 FK 위반 500 방지). "봤음"만 남기고 confirmedAt 은 건드리지 않음.
  await recordHandoverView(id);

  // isRead = "확인함" (명시적 확인 클릭). 단순 열람은 확인으로 치지 않는다.
  const isRead = handover.reads.some((r) => r.userId === session.user.id && r.confirmedAt != null);
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
  const confirmedTotal = handover.reads.filter((r) => r.confirmedAt != null).length;
  const routineAllDone = checkedCount === handover.checklist.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/handover", label: "인수인계" }}
        title={`${handover.authorName}님의 인수인계`}
        meta={
          <>
            {isUrgent && <StatusBadge tone="bad">긴급</StatusBadge>}
            {handover.isPinned && <StatusBadge tone="warn"><Pin />고정</StatusBadge>}
            {handover.category && <StatusBadge>{handover.category}</StatusBadge>}
          </>
        }
        description={formatDate(handover.date)}
        actions={
          isAuthor ? (
            <Button asChild variant="outline">
              <Link href={`/handover/${handover.id}/edit`}>
                <Pencil />수정
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-x4">
        {/* 본문 + 수신자 확인 현황 */}
        {(handover.content || recipientNames.length > 0) && (
          <Section>
            {recipientNames.length > 0 && (
              <div className={handover.content ? "mb-x4 border-b border-stroke-neutral-muted pb-x4" : undefined}>
                <p className="mb-x2 t3-medium text-fg-neutral-subtle">받는 사람</p>
                <div className="flex flex-wrap items-center gap-x1_5">
                  {recipientNames.map((name, idx) => {
                    const rid = recipientIds[idx];
                    const rRead = rid ? handover.reads.find((r) => r.userId === rid && r.confirmedAt != null) : null;
                    return (
                      <StatusBadge key={idx} tone={rRead ? "ok" : "gray"} size="large">
                        {name}
                        {rRead ? <CheckCircle2 /> : <span className="opacity-70">미확인</span>}
                      </StatusBadge>
                    );
                  })}
                </div>
              </div>
            )}
            {handover.content && (
              <div className="t5-regular text-fg-neutral">
                <MarkdownViewer source={handover.content} />
              </div>
            )}
          </Section>
        )}

        {/* 할 일 */}
        {handover.tasks.length > 0 && (
          <Section
            title="할 일"
            actions={
              <span className="t4-medium tabular-nums text-fg-neutral-subtle">
                {completedTasks}/{handover.tasks.length} 완료
              </span>
            }
            flush
          >
            <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-b-r4 border-t border-stroke-neutral-muted">
              {handover.tasks.map((task) => (
                <li key={task.id}>
                  <TaskToggleButton
                    taskId={task.id}
                    title={task.title}
                    content={task.content}
                    assigneeName={task.assigneeName}
                    isCompleted={task.isCompleted}
                  />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 루틴 체크리스트 */}
        {handover.checklist.length > 0 && (
          <Section
            title="루틴"
            actions={
              <span className={`t4-bold tabular-nums ${routineAllDone ? "text-fg-positive" : "text-fg-warning"}`}>
                {checkedCount}/{handover.checklist.length}
              </span>
            }
            flush
          >
            {/* 진행률 바 */}
            <div className="px-x5 pb-x4">
              <ProgressBar
                value={handover.checklist.length > 0 ? checkedCount / handover.checklist.length : 0}
                tone={routineAllDone ? "ok" : "brand"}
              />
            </div>
            <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-b-r4 border-t border-stroke-neutral-muted">
              {handover.checklist.map((c) => (
                <li key={c.id}>
                  <ChecklistToggleButton
                    itemId={c.id}
                    title={c.title}
                    isChecked={c.isChecked}
                    checkedAt={c.checkedAt}
                    checkedByName={c.checkedByName}
                  />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 확인 영역 */}
        <section className="flex flex-col gap-x3 rounded-r4 bg-bg-layer-fill px-x5 py-x4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="t5-bold text-fg-neutral">
              {isAuthor ? "내가 남긴 인수인계예요" : isRead ? "확인을 마쳤어요" : "내용을 확인했다면 눌러 주세요"}
            </p>
            <p className="mt-x0_5 t4-regular tabular-nums text-fg-neutral-subtle">{confirmedTotal}명 확인</p>
          </div>
          {isAuthor ? null : isRead ? (
            <span className="inline-flex items-center gap-x1_5 t4-bold text-fg-positive">
              <CheckCircle2 className="size-5" aria-hidden />확인 완료
            </span>
          ) : (
            <ConfirmButton handoverId={handover.id} />
          )}
        </section>

        {/* 열람/확인 현황 (원장 전용) — 누가·언제 봤고 확인했는지 (3상태) */}
        {isFullAccess(session.user.role) && (() => {
          // 지정 수신자가 있으면 수신자를 기준 명단으로, 없으면 열람한 사람 전체를 대상으로 표시
          type Row = { userId: string; name: string; read?: ReadItem };
          const rows: Row[] = recipientNames.length > 0
            ? recipientNames.map((name, i) => {
                const uid = recipientIds[i] ?? name;
                return { userId: uid, name, read: recipientIds[i] ? handover.reads.find((r) => r.userId === recipientIds[i]) : undefined };
              })
            : [...handover.reads]
                .sort((a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime())
                .map((r) => ({ userId: r.userId, name: r.userName, read: r }));
          // 수신자 외 열람자(기타)
          const extraReaders = recipientNames.length > 0
            ? handover.reads.filter((r) => !recipientIds.includes(r.userId))
            : [];

          return (
            <Section
              title="열람 · 확인 현황"
              actions={<StatusBadge tone="violet">원장 전용</StatusBadge>}
              flush
            >
              {rows.length === 0 ? (
                <p className="border-t border-stroke-neutral-muted px-x5 py-x4 t4-regular text-fg-neutral-subtle">아직 열람한 사람이 없어요</p>
              ) : (
                <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                  {rows.map((row) => (
                    <ReaderRow key={row.userId} name={row.name} read={row.read} />
                  ))}
                </ul>
              )}
              {extraReaders.length > 0 && (
                <>
                  <p className="border-t border-stroke-neutral-muted bg-bg-layer-fill px-x5 py-x2 t3-medium text-fg-neutral-subtle">기타 열람자</p>
                  <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                    {extraReaders.map((r) => (
                      <ReaderRow key={r.userId} name={r.userName} read={r} />
                    ))}
                  </ul>
                </>
              )}
            </Section>
          );
        })()}

        {/* 댓글 */}
        <HandoverComments
          handoverId={handover.id}
          comments={handover.comments}
          currentUserId={session.user.id}
          canModerate={isFullAccess(session.user.role)}
        />
      </div>
    </div>
  );
}

// ── 열람 · 확인 현황 행 ────────────────────────────────────────────────────
type ReadItem = { userId: string; userName: string; readAt: Date; confirmedAt: Date | null };

const fmtReadTime = (d: Date | string) =>
  new Date(d).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function ReadStatusBadge({ read }: { read?: ReadItem }) {
  if (!read) return <StatusBadge>미열람</StatusBadge>;
  if (read.confirmedAt) return <StatusBadge tone="ok">확인완료</StatusBadge>;
  return <StatusBadge tone="warn">열람</StatusBadge>;
}

function ReaderRow({ name, read }: { name: string; read?: ReadItem }) {
  return (
    <li className="flex items-center justify-between gap-x2 px-x5 py-x3">
      <span className="flex min-w-0 items-center gap-x2">
        <span className="truncate t4-medium text-fg-neutral">{name}</span>
        <ReadStatusBadge read={read} />
      </span>
      <span className="shrink-0 text-right t3-regular tabular-nums text-fg-neutral-subtle">
        {read
          ? read.confirmedAt
            ? `확인 ${fmtReadTime(read.confirmedAt)}`
            : `열람 ${fmtReadTime(read.readAt)}`
          : "—"}
      </span>
    </li>
  );
}
