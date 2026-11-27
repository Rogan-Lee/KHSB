"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Loader2, RefreshCw, Search, Send, SendHorizontal } from "lucide-react";
import {
  discardInstructionDraftAction,
  regenerateInstructionDraftAction,
  sendInstructionAction,
} from "@/actions/student-instructions";
import { checkCommunication } from "@/actions/communications";
import type { InstructionInbox } from "@/lib/student-instructions";
import { useStickyState } from "@/hooks/use-sticky-state";
import { matchesSearch } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, SearchField, Section, StatusBadge, Toolbar } from "@/components/backoffice/ui";
import {
  DirectInstructionForm,
  fmt,
  InstructionField,
  RequestText,
  runAction,
  SentInstruction,
  type InstructionStudentOption,
} from "./instruction-panel";

type PendingRequest = InstructionInbox["pending"][number];

export function InstructionBoard({
  inbox,
  students,
}: {
  inbox: InstructionInbox;
  students: InstructionStudentOption[];
}) {
  const [query, setQuery] = useStickyState("instructions:query", "");
  const pendingMatch = (item: PendingRequest) => matchesSearch(query, item.student.name, item.content);
  const shownPendingCount = inbox.pending.filter(pendingMatch).length;
  const shownSent = inbox.sent.filter((item) => matchesSearch(query, item.student.name, item.content));

  return (
    <div className="flex flex-col gap-x8">
      <Toolbar className="mb-0">
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="이름·내용 검색"
          aria-label="학생 검색"
        />
      </Toolbar>

      <Section
        variant="plain"
        title="처리할 학부모 요청"
        count={shownPendingCount}
        description="AI 초안을 고쳐 학생에게 보내요. 학생에게 시킬 일이 없으면 확인만 눌러요."
      >
        {inbox.pending.length === 0 ? (
          <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
            <EmptyState
              compact
              icon={Inbox}
              title="처리할 학부모 요청이 없어요"
              description="학부모가 앱에서 요청을 남기면 AI 초안과 함께 여기에 모여요."
            />
          </div>
        ) : (
          <>
            {shownPendingCount === 0 && (
              <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
                <EmptyState compact icon={Search} title="검색 결과가 없어요" description="이름이나 내용을 다시 확인해 주세요." />
              </div>
            )}
            {/* 고치던 지시 문장이 검색으로 지워지지 않게 안 맞는 카드는 숨기기만 한다 */}
            <ul className="flex flex-col gap-x3">
              {inbox.pending.map((item) => (
                <PendingCard key={item.id} item={item} hidden={!pendingMatch(item)} />
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="바로 지시하기" description="학부모 요청 없이 학생에게 바로 지시를 보내요.">
        <DirectInstructionForm students={students} />
      </Section>

      <Section title="보낸 지시" count={shownSent.length} description="최근 100건이에요. 학생이 확인하면 시각이 남아요.">
        {inbox.sent.length === 0 ? (
          <EmptyState compact icon={SendHorizontal} title="아직 보낸 지시가 없어요" />
        ) : shownSent.length === 0 ? (
          <EmptyState compact icon={Search} title="검색 결과가 없어요" />
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted">
            {shownSent.map((item) => (
              <SentInstruction key={item.id} item={item} showStudent />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function PendingCard({ item, hidden }: { item: PendingRequest; hidden?: boolean }) {
  const router = useRouter();
  const [content, setContent] = useState(item.draft?.content ?? "");
  // 다시 만들기·버리기 뒤 새로고침 전에 보내도 지운 초안 id 가 넘어가지 않게 따로 든다
  const [draftId, setDraftId] = useState<string | undefined>(item.draft?.id);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const sent = await runAction(() =>
        sendInstructionAction({ studentId: item.student.id, content, requestId: item.id, draftId }),
      );
      if (!sent) return;
      toast.success(`${item.student.name} 학생에게 보냈어요`);
      router.refresh();
    });
  }

  function regenerate() {
    startTransition(async () => {
      const draft = await runAction(() => regenerateInstructionDraftAction(item.id));
      if (!draft) return;
      setContent(draft.content);
      setDraftId(draft.id);
      toast.success("AI 초안을 새로 만들었어요");
    });
  }

  function discard() {
    if (!draftId) return;
    startTransition(async () => {
      // 성공이면 undefined(data 없음), 실패면 null
      if ((await runAction(() => discardInstructionDraftAction(draftId))) === null) return;
      setContent("");
      setDraftId(undefined);
      toast.success("초안을 버렸어요");
    });
  }

  function checkOnly() {
    startTransition(async () => {
      try {
        await checkCommunication(item.id, item.student.id);
        toast.success("확인 처리했어요");
        router.refresh();
      } catch {
        toast.error("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요");
      }
    });
  }

  return (
    <li hidden={hidden} className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      <div className="px-x5 pt-x5">
        <div className="flex flex-wrap items-center gap-x1_5">
          <Link
            href={`/students/${item.student.id}`}
            className="t4-medium text-fg-neutral underline-offset-4 hover:underline"
          >
            {item.student.name}
          </Link>
          <span className="t3-regular text-fg-neutral-subtle">{item.student.grade}</span>
          <span className="t3-regular text-fg-neutral-subtle">· 요청 {item.createdByName}</span>
          <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">{fmt(item.createdAt)}</span>
        </div>

        <div className="mt-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
          <RequestText text={item.content} />
        </div>

        <div className="mt-x4 flex items-center gap-x1_5">
          <span className="t4-medium text-fg-neutral">학생에게 보낼 지시</span>
          {draftId && <StatusBadge tone="violet">AI 초안</StatusBadge>}
        </div>
        <div className="mt-x2">
          <InstructionField
            value={content}
            onChange={setContent}
            disabled={pending}
            placeholder={
              draftId ? undefined : "AI 초안이 없어요. 직접 적거나 AI 초안 다시 만들기를 눌러 주세요"
            }
          />
        </div>
      </div>

      <div className="mt-x4 flex flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted px-x5 py-x3">
        <Button type="button" variant="ghost" size="sm" onClick={checkOnly} disabled={pending}>
          확인만
        </Button>
        {draftId && (
          <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={pending}>
            초안 버리기
          </Button>
        )}
        <div className="ml-auto flex items-center gap-x2">
          {pending && <Loader2 className="size-4 animate-spin text-fg-neutral-subtle" aria-label="처리 중" />}
          <Button type="button" variant="secondary" size="sm" onClick={regenerate} disabled={pending}>
            <RefreshCw aria-hidden />
            AI 초안 다시 만들기
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={pending || !content.trim()}>
            <Send aria-hidden />
            학생에게 보내기
          </Button>
        </div>
      </div>
    </li>
  );
}
