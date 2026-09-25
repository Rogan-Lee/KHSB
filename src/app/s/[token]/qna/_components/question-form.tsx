"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createStudentQuestion, type QuestionAttachment } from "@/actions/student-questions";
import { Fieldset } from "@seed-design/react";
import { Chip } from "seed-design/ui/chip";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";
import { PhotoUploader } from "@/components/questions/photo-uploader";
import { BottomCTA, Button } from "@/components/portal/ui";

const SUBJECTS = ["수학", "영어", "국어", "과학탐구", "사회탐구", "한국사", "기타"];

export function QuestionForm({ token }: { token: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<QuestionAttachment[]>([]);
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    title.trim().length > 0 && (content.trim().length > 0 || attachments.length > 0) && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const { id } = await createStudentQuestion({
          studentToken: token,
          title: title.trim(),
          subject: subject || null,
          content: content.trim(),
          attachments,
        });
        toast.success("질문을 등록했어요");
        router.replace(`/s/${token}/qna/${id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "등록에 실패했어요");
      }
    });
  };

  return (
    <div className="flex flex-col gap-x7">
      <Fieldset.Root>
        <Fieldset.Header>
          <Fieldset.Label>문제 사진</Fieldset.Label>
        </Fieldset.Header>
        <PhotoUploader
          attachments={attachments}
          onChange={setAttachments}
          studentToken={token}
          disabled={isPending}
          label="사진 추가"
          variant="portal"
        />
        <Fieldset.Footer>
          <Fieldset.Description>
            카메라로 찍거나 앨범에서 골라주세요. 영상·PDF도 올릴 수 있어요.
          </Fieldset.Description>
        </Fieldset.Footer>
      </Fieldset.Root>

      <TextField
        label="제목"
        value={title}
        onValueChange={({ value }) => setTitle(value)}
        maxGraphemeCount={120}
      >
        <TextFieldInput maxLength={120} placeholder="예) 미적분 28번 모르겠어요" />
      </TextField>

      <Fieldset.Root>
        <Fieldset.Header>
          <Fieldset.Label>
            과목
            <Fieldset.IndicatorText>선택</Fieldset.IndicatorText>
          </Fieldset.Label>
        </Fieldset.Header>
        <Chip.RadioRoot
          value={subject}
          onValueChange={setSubject}
          aria-label="과목"
          className="flex flex-wrap gap-x2"
        >
          {SUBJECTS.map((s) => (
            <Chip.RadioItem
              key={s}
              value={s}
              variant="outlineStrong"
              size="medium"
              // 선택된 과목을 다시 누르면 해제 (과목은 선택 항목)
              inputProps={{
                onClick: () => {
                  if (subject === s) setSubject("");
                },
              }}
            >
              <Chip.Label>{s}</Chip.Label>
            </Chip.RadioItem>
          ))}
        </Chip.RadioRoot>
      </Fieldset.Root>

      <TextField
        label="설명"
        description="사진이나 설명 중 하나는 꼭 있어야 해요."
        value={content}
        onValueChange={({ value }) => setContent(value)}
      >
        {/* 기존 rows={5} 높이 — SEED textarea 는 rows 대신 minHeight 로 지정(자동 높이 조절 유지) */}
        <TextFieldTextarea
          maxLength={4000}
          placeholder="어디까지 풀었는지, 어느 부분에서 막혔는지 적어주면 더 정확하게 답해드릴 수 있어요"
          style={{ minHeight: 138 }}
        />
      </TextField>

      <BottomCTA note="등록하면 당일 근무 멘토가 풀이를 답해드려요">
        <Button
          variant="primary"
          size="xl"
          block
          onClick={submit}
          disabled={!canSubmit}
          loading={isPending}
        >
          질문 등록하기
        </Button>
      </BottomCTA>
    </div>
  );
}
