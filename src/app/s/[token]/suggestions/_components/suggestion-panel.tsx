"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Megaphone, MessageSquareReply, Trash2 } from "lucide-react";
import { IconPlusFill } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon, RadioGroupField } from "@seed-design/react";
import { Chip } from "seed-design/ui/chip";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";
import {
  createStudentSuggestion,
  markStudentSuggestionsRead,
  type SuggestionView,
} from "@/actions/student-suggestions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/suggestions";
import type { SuggestionCategory } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { Badge, BottomCTA, Button, EmptyState, Notice, Section } from "@/components/portal/ui";
import { BottomSheet } from "@/components/portal/bottom-sheet";
import { SUGGESTION_STATUS } from "@/components/portal/status";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** SEED TextFieldTextarea(large) 기준 n줄 높이 — t5 줄높이 × n + 상하 패딩 */
const textareaRows = (n: number) =>
  `calc(var(--seed-line-height-t5) * ${n} + var(--seed-dimension-x3_5) * 2)`;

export function SuggestionPanel({ token, initial }: { token: string; initial: SuggestionView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SuggestionCategory>("FACILITY");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  // 진입 시 미확인 배지 클리어
  useEffect(() => {
    markStudentSuggestionsRead({ studentToken: token }).catch(() => {});
  }, [token]);

  function submit() {
    if (!title.trim()) return toast.error("제목을 입력해 주세요");
    if (!content.trim()) return toast.error("건의 내용을 입력해 주세요");
    startTransition(async () => {
      try {
        await createStudentSuggestion({ studentToken: token, category, title, content });
        toast.success("건의사항이 접수되었어요");
        setTitle("");
        setContent("");
        setCategory("FACILITY");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "제출 실패");
      }
    });
  }

  return (
    <>
      {initial.length === 0 ? (
        <Section>
          <EmptyState
            icon={Megaphone}
            tone="brand"
            title="아직 건의사항이 없어요"
            description={"불편한 점이나 바라는 점을 알려주세요.\n검토 후 결과를 여기서 안내해 드려요."}
            className="py-x10"
          />
        </Section>
      ) : (
        <div className="flex flex-col gap-x3">
          <p className="px-x1 pt-x2 t4-regular text-fg-neutral-subtle">
            불편한 점이나 바라는 점을 알려주세요. 검토 후 결과를 여기서 안내해 드려요.
          </p>

          {initial.map((s) => {
            const deleted = !!s.deletedAt;
            const st = SUGGESTION_STATUS[s.status];
            return (
              <Section key={s.id}>
                <div className="flex items-center gap-x1_5">
                  <Badge tone="gray">{CATEGORY_LABELS[s.category]}</Badge>
                  {deleted ? <Badge tone="bad">삭제됨</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
                  {s.hasUnseenUpdate && (
                    <span className="ml-auto inline-flex items-center gap-x1_5 t3-bold text-fg-brand">
                      <span className="size-x2 rounded-full bg-bg-brand-solid" aria-hidden />
                      업데이트
                    </span>
                  )}
                </div>

                {deleted && (
                  <Notice tone="bad" icon={Trash2} className="mt-x3">
                    관리자가 이 건의사항을 삭제했어요.
                  </Notice>
                )}

                <p
                  className={cn(
                    "mt-x3 t5-bold",
                    deleted ? "text-fg-neutral-muted" : "text-fg-neutral"
                  )}
                >
                  {s.title}
                </p>
                <p
                  className={cn(
                    "mt-x1 whitespace-pre-wrap t4-regular",
                    deleted ? "text-fg-neutral-subtle" : "text-fg-neutral-muted"
                  )}
                >
                  {s.content}
                </p>

                {s.staffReply && (
                  <div className="mt-x4 rounded-r3_5 bg-bg-layer-fill px-x4 py-x3_5">
                    <p className="flex items-center gap-x1_5 t3-bold text-fg-neutral-muted">
                      <MessageSquareReply className="size-x4 text-fg-brand" strokeWidth={2.2} />
                      원장 답변{s.handledByName ? ` · ${s.handledByName}` : ""}
                    </p>
                    <p className="mt-x1_5 whitespace-pre-wrap t4-regular text-fg-neutral-muted">
                      {s.staffReply}
                    </p>
                  </div>
                )}

                <p className="mt-x3 t3-regular text-fg-neutral-subtle tabular-nums">{fmtDate(s.createdAt)}</p>
              </Section>
            );
          })}
        </div>
      )}

      <BottomCTA>
        <Button variant="primary" size="xl" block onClick={() => setOpen(true)}>
          <PrefixIcon svg={<IconPlusFill />} />
          건의하기
        </Button>
      </BottomCTA>

      {/* 작성 시트 */}
      <BottomSheet
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o);
        }}
        title="어떤 점을 건의할까요?"
        description="원장님이 확인하고 답변을 남겨 드려요."
        footer={
          <Button variant="primary" size="xl" block loading={pending} onClick={submit}>
            건의 보내기
          </Button>
        }
      >
        <div className="flex flex-col gap-x5 pb-x1">
          {/* RadioGroupField.Root = Chip.RadioRoot 와 같은 라디오 그룹 + SEED 필드 라벨 */}
          <RadioGroupField.Root
            value={category}
            onValueChange={(v) => setCategory(v as SuggestionCategory)}
          >
            <RadioGroupField.Header>
              <RadioGroupField.Label>분류</RadioGroupField.Label>
            </RadioGroupField.Header>
            <div className="flex flex-wrap gap-x2">
              {CATEGORY_ORDER.map((c) => (
                <Chip.RadioItem key={c} value={c} variant="outlineStrong" size="medium">
                  <Chip.Label>{CATEGORY_LABELS[c]}</Chip.Label>
                </Chip.RadioItem>
              ))}
            </div>
          </RadioGroupField.Root>

          <TextField
            label="제목"
            maxGraphemeCount={120}
            value={title}
            onValueChange={({ value }) => setTitle(value)}
          >
            <TextFieldInput placeholder="예: 3층 정수기 온수가 안 나와요" maxLength={120} />
          </TextField>

          <TextField
            label="내용"
            maxGraphemeCount={2000}
            value={content}
            onValueChange={({ value }) => setContent(value)}
          >
            {/* SEED Textarea 는 rows 를 받지 않아 높이로 지정: 최소 5줄 ~ 최대 10줄 (그 이상은 스크롤) */}
            <TextFieldTextarea
              maxLength={2000}
              placeholder="건의 내용을 자세히 적어 주세요"
              style={{ minHeight: textareaRows(5), maxHeight: textareaRows(10) }}
            />
          </TextField>
        </div>
      </BottomSheet>
    </>
  );
}
