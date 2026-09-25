import { redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { IconPlusFill } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon } from "@seed-design/react";
import { validateMagicLink } from "@/lib/student-auth";
import { listStudentQuestions } from "@/actions/student-questions";
import {
  Badge,
  ButtonLink,
  CountBadge,
  EmptyState,
  IconTile,
  ListRow,
  Section,
} from "@/components/portal/ui";
import { QUESTION_STATUS } from "@/components/portal/status";
import { cn } from "@/lib/utils";

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** 오늘이면 시각, 올해면 월·일, 그 외 연도까지 */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const k = new Date(d.getTime() + KST_OFFSET);
  const now = new Date(Date.now() + KST_OFFSET);
  if (
    k.getUTCFullYear() === now.getUTCFullYear() &&
    k.getUTCMonth() === now.getUTCMonth() &&
    k.getUTCDate() === now.getUTCDate()
  ) {
    const h = k.getUTCHours();
    const m = k.getUTCMinutes().toString().padStart(2, "0");
    return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
  }
  if (k.getUTCFullYear() === now.getUTCFullYear()) {
    return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
  }
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

export default async function StudentQnaListPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const questions = await listStudentQuestions({ studentToken: token });
  const newHref = `/s/${token}/qna/new`;

  if (questions.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Camera}
          tone="brand"
          title="모르는 문제, 사진 찍어 물어보세요"
          description={"문제 사진을 올리면\n당일 근무 멘토가 풀이를 답해드려요."}
          action={
            <ButtonLink href={newHref} variant="primary" size="lg">
              첫 질문 올리기
            </ButtonLink>
          }
        />
      </Section>
    );
  }

  const unreadTotal = questions.reduce((sum, q) => sum + q.unread, 0);

  return (
    <div className="flex flex-col gap-x3">
      <Section>
        <div className="flex items-center gap-x3_5">
          <IconTile icon={Camera} tone="brand" solid size={48} />
          <div className="min-w-0 flex-1">
            <p className="t6-bold text-fg-neutral">
              모르는 문제, 사진 찍어 물어보세요
            </p>
            <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
              당일 근무 멘토가 풀이를 답해드려요
            </p>
          </div>
        </div>
        <ButtonLink href={newHref} variant="primary" size="lg" block className="mt-x4">
          <PrefixIcon svg={<IconPlusFill />} />
          질문하기
        </ButtonLink>
      </Section>

      <Section
        flush
        title="내 질문"
        description={unreadTotal > 0 ? `새 답변 ${unreadTotal}개가 도착했어요` : undefined}
        action={
          <span className="t4-medium tabular-nums text-fg-neutral-subtle">
            {questions.length}개
          </span>
        }
      >
        {questions.map((q) => {
          const status = QUESTION_STATUS[q.status];
          const last = q.lastMessage;
          const previewText = last ? last.content || (last.hasAttachments ? "사진" : "") : "";
          const preview = last && previewText
            ? `${last.senderType === "STAFF" ? "멘토: " : ""}${previewText}`
            : null;
          const hasNew = q.unread > 0;
          return (
            <ListRow
              key={q.id}
              href={`/s/${token}/qna/${q.id}`}
              chevron={false}
              className="items-start"
              meta={
                <>
                  {q.subject && <Badge>{q.subject}</Badge>}
                  <Badge tone={status.tone}>{status.label}</Badge>
                </>
              }
              title={<span className="line-clamp-2">{q.title}</span>}
              description={
                preview ? (
                  <span className={cn("line-clamp-1", hasNew && "t4-medium text-fg-neutral-muted")}>
                    {preview}
                  </span>
                ) : undefined
              }
              trailing={
                <div className="flex flex-col items-end gap-x1_5 pt-x0_5">
                  <span className="t3-regular tabular-nums text-fg-placeholder">
                    {fmtWhen(q.lastMessageAt)}
                  </span>
                  <CountBadge count={q.unread} />
                </div>
              }
            />
          );
        })}
      </Section>
    </div>
  );
}
