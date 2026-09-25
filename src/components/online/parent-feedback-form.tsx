"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";
import { submitParentFeedback } from "@/actions/online/parent-reports";
import { Button, EmptyState, Section } from "@/components/portal/ui";

const MAX_LENGTH = 2000;

export function ParentFeedbackForm({ token }: { token: string }) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!content.trim()) {
      toast.error("내용을 입력해 주세요");
      return;
    }
    setSubmitting(true);
    startTransition(async () => {
      try {
        await submitParentFeedback({
          token,
          name: name.trim() || null,
          content,
        });
        setSubmitted(true);
        setContent("");
        setName("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "보내지 못했어요. 다시 시도해 주세요");
      } finally {
        setSubmitting(false);
      }
    });
  };

  if (submitted) {
    return (
      <Section>
        <EmptyState
          icon={CircleCheck}
          tone="ok"
          title="의견을 전달했어요"
          description={"원장님이 확인하고 따로 답변드릴게요.\n더 남기실 말씀이 있으면 한 번 더 적어 주세요."}
          action={
            <Button variant="weak" size="md" onClick={() => setSubmitted(false)}>
              한 번 더 작성하기
            </Button>
          }
          className="px-x2 py-x6"
        />
      </Section>
    );
  }

  return (
    <Section
      title="원장님께 의견 남기기"
      description="원장님이 바로 확인하고 따로 답변드려요. 학생에게는 보이지 않아요."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-x6 pt-x2">
        <TextField
          label="질문·의견"
          value={content}
          onValueChange={({ value }) => setContent(value)}
          maxGraphemeCount={MAX_LENGTH}
        >
          {/* 서버 검증(2000자)과 같은 기준으로 입력 자체를 막는다 */}
          <TextFieldTextarea
            maxLength={MAX_LENGTH}
            placeholder="궁금한 점이나 전하고 싶은 말씀을 편하게 적어 주세요"
            style={{ minHeight: 132 }}
          />
        </TextField>

        <TextField
          label="성함"
          indicator="선택"
          value={name}
          onValueChange={({ value }) => setName(value)}
        >
          <TextFieldInput placeholder="예) 홍길동 어머니" autoComplete="name" />
        </TextField>

        <Button
          type="submit"
          variant="primary"
          size="xl"
          block
          loading={submitting}
          disabled={!content.trim()}
        >
          의견 보내기
        </Button>
      </form>
    </Section>
  );
}
