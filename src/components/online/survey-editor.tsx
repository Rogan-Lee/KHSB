"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import {
  SURVEY_SECTIONS,
  type SurveySection,
} from "@/lib/online/survey-template";
import {
  upsertSurveySection,
  submitSurvey,
} from "@/actions/online/onboarding-survey";

type InitialSections = Record<string, { answer?: string } | undefined>;

type SectionState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 800;

export function SurveyEditor({
  studentToken,
  initialSections,
  isSubmitted,
}: {
  studentToken: string;
  initialSections: InitialSections;
  isSubmitted: boolean;
}) {
  const router = useRouter();

  const allAnswered = SURVEY_SECTIONS.every(
    (s) => (initialSections?.[s.key]?.answer ?? "").trim().length > 0
  );

  return (
    <div className="space-y-5">
      {isSubmitted && (
        <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-900">
          ✅ 제출 완료. 수정이 필요하면 원장님께 재개방을 요청하세요.
        </div>
      )}

      {SURVEY_SECTIONS.map((section) => (
        <SectionField
          key={section.key}
          section={section}
          studentToken={studentToken}
          initialValue={initialSections?.[section.key]?.answer ?? ""}
          disabled={isSubmitted}
        />
      ))}

      {!isSubmitted && (
        <SubmitBar
          studentToken={studentToken}
          allAnswered={allAnswered}
          onSubmitted={() => router.refresh()}
        />
      )}
    </div>
  );
}

function SectionField({
  section,
  studentToken,
  initialValue,
  disabled,
}: {
  section: SurveySection;
  studentToken: string;
  initialValue: string;
  disabled: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<SectionState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initialValue);

  // 입력 멈춘 후 AUTOSAVE_DELAY_MS 지나면 저장
  useEffect(() => {
    if (disabled) return;
    if (value === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await upsertSurveySection({
          studentToken,
          sectionKey: section.key,
          answer: value,
        });
        lastSaved.current = value;
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch (err) {
        setStatus("error");
        toast.error(err instanceof Error ? err.message : "자동저장 실패");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, studentToken, section.key, disabled]);

  return (
    <section className="rounded-[12px] border border-line bg-panel p-4">
      <header className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">{section.title}</h3>
          <p className="mt-0.5 text-[11.5px] text-ink-4 leading-relaxed">
            {section.description}
          </p>
        </div>
        <StatusBadge state={status} />
      </header>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={section.placeholder}
        rows={5}
        className="mt-2 w-full resize-y rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] leading-relaxed text-ink placeholder:text-ink-5 focus:outline-none focus:ring-2 focus:ring-ink/10 focus:border-line-strong disabled:opacity-60"
      />
    </section>
  );
}

function StatusBadge({ state }: { state: SectionState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">
        <Loader2 className="h-3 w-3 animate-spin" />
        저장 중
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
        <Check className="h-3 w-3" />
        저장됨
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-[11px] text-red-600">저장 실패</span>;
  }
  return null;
}

function SubmitBar({
  studentToken,
  allAnswered,
  onSubmitted,
}: {
  studentToken: string;
  allAnswered: boolean;
  onSubmitted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (!allAnswered) {
      if (
        !confirm(
          "아직 작성하지 않은 섹션이 있습니다. 그래도 제출하시겠어요?"
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      try {
        await submitSurvey({ studentToken });
        toast.success("설문이 제출되었습니다. 컨설턴트가 확인 후 연락드립니다.");
        onSubmitted();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "제출 실패");
      }
    });
  };

  return (
    <div className="flex items-center justify-between rounded-[12px] border border-line bg-panel p-4">
      <p className="text-[12px] text-ink-4">
        {allAnswered
          ? "모든 섹션이 작성되었습니다. 제출 후에는 수정이 제한됩니다."
          : "아직 비어 있는 섹션이 있습니다."}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-[8px] bg-ink text-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
      >
        {isPending ? "제출 중..." : "설문 제출"}
      </button>
    </div>
  );
}
