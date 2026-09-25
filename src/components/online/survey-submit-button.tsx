"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitSurvey } from "@/actions/online/onboarding-survey";
import { Button } from "@/components/portal/ui";
import { BottomSheet } from "@/components/portal/bottom-sheet";

// 학생 포털 전용 — 제출 확인은 바텀시트로.
export function SurveySubmitButton({
  studentToken,
  allAnswered,
}: {
  studentToken: string;
  allAnswered: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const submit = () => {
    startTransition(async () => {
      try {
        await submitSurvey({ studentToken });
        toast.success("설문을 제출했어요");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "제출 실패");
      }
    });
  };

  return (
    <>
      <Button
        variant="primary"
        size="xl"
        block
        loading={isPending}
        onClick={() => setOpen(true)}
      >
        설문 제출하기
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={(o) => {
          if (!isPending) setOpen(o);
        }}
        title="설문을 제출할까요?"
        description={
          allAnswered
            ? "제출 후에는 수정이 제한돼요."
            : "아직 작성하지 않은 질문이 있어요. 제출 후에는 수정이 제한돼요."
        }
        footer={
          <>
            <Button
              variant="gray"
              size="xl"
              className="flex-1"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size="xl"
              className="flex-1"
              loading={isPending}
              onClick={submit}
            >
              제출하기
            </Button>
          </>
        }
      />
    </>
  );
}
