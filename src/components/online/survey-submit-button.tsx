"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { submitSurvey } from "@/actions/online/onboarding-survey";

export function SurveySubmitButton({
  studentToken,
  allAnswered,
}: {
  studentToken: string;
  allAnswered: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !allAnswered &&
      !confirm("아직 작성하지 않은 질문이 있습니다. 그래도 제출하시겠어요?")
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await submitSurvey({ studentToken });
        toast.success("설문이 제출되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "제출 실패");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-brand px-4 py-3.5 text-[14.5px] font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-60 transition-transform"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Send className="h-4 w-4" />
          설문 제출
        </>
      )}
    </button>
  );
}
