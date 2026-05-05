"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ListChecks,
  Loader2,
} from "lucide-react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  type SurveySection,
  type PerformanceAnswer,
  type HistoryAnswer,
  type GoalsAnswer,
  type AdmissionTypeAnswer,
  type StrengthsWeaknessesAnswer,
  normalizePerformanceAnswer,
  normalizeHistoryAnswer,
  normalizeGoalsAnswer,
  normalizeAdmissionTypeAnswer,
  normalizeStrengthsWeaknessesAnswer,
} from "@/lib/online/survey-template";
import { PerformanceSurveyStep } from "./performance-survey-step";
import { HistorySurveyStep } from "./history-survey-step";
import { GoalsSurveyStep } from "./goals-survey-step";
import { AdmissionTypeSurveyStep } from "./admission-type-survey-step";
import { StrengthsWeaknessesSurveyStep } from "./strengths-weaknesses-survey-step";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

export function SurveyWizardStep({
  studentToken,
  section,
  initialValue,
  stepIndex, // 0-based
  totalSteps,
  isSubmitted,
  gradeNumber = null,
}: {
  studentToken: string;
  section: SurveySection;
  initialValue:
    | string
    | PerformanceAnswer
    | HistoryAnswer
    | GoalsAnswer
    | AdmissionTypeAnswer
    | StrengthsWeaknessesAnswer;
  stepIndex: number;
  totalSteps: number;
  isSubmitted: boolean;
  gradeNumber?: 1 | 2 | 3 | null;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  // ───── text 섹션용 state (performance 섹션은 자체 컴포넌트에서 관리) ─────
  const initialText = typeof initialValue === "string" ? initialValue : "";
  const [textValue, setTextValue] = useState(initialText);
  const [textStatus, setTextStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initialText);

  // text 섹션 — 자동 저장
  useEffect(() => {
    if (section.kind !== "text") return;
    if (isSubmitted) return;
    if (textValue === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setTextStatus("saving");
      try {
        await upsertSurveySection({
          studentToken,
          sectionKey: section.key,
          answer: textValue,
        });
        lastSaved.current = textValue;
        setTextStatus("saved");
        setTimeout(() => setTextStatus("idle"), 1500);
      } catch (err) {
        setTextStatus("error");
        toast.error(err instanceof Error ? err.message : "자동저장 실패");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [textValue, studentToken, section, isSubmitted]);

  const flushAndGo = (nextHref: string) => {
    if (timer.current) clearTimeout(timer.current);
    startNav(async () => {
      // text 섹션만 명시 flush. performance/history 는 자체 디바운스 마쳐 있을 가능성 높음.
      if (section.kind === "text" && !isSubmitted && textValue !== lastSaved.current) {
        try {
          setTextStatus("saving");
          await upsertSurveySection({
            studentToken,
            sectionKey: section.key,
            answer: textValue,
          });
          lastSaved.current = textValue;
          setTextStatus("saved");
        } catch (err) {
          setTextStatus("error");
          toast.error(err instanceof Error ? err.message : "저장 실패");
          return;
        }
      }
      router.push(nextHref);
    });
  };

  const isLast = stepIndex === totalSteps - 1;
  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const reviewHref = `/s/${studentToken}/survey`;
  const prevHref =
    stepIndex === 0
      ? `/s/${studentToken}/survey`
      : `/s/${studentToken}/survey/${stepIndex}`;
  const nextHref = isLast
    ? reviewHref
    : `/s/${studentToken}/survey/${stepIndex + 2}`;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11.5px] font-semibold tabular-nums">
          <span className="text-ink-3">
            <span className="text-brand">{stepIndex + 1}</span>
            <span className="text-ink-5"> / {totalSteps}</span>
          </span>
          {section.kind === "text" && <SaveBadge status={textStatus} disabled={isSubmitted} />}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-2">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="space-y-2.5">
        <h2 className="text-[20px] font-bold leading-snug tracking-[-0.02em] text-ink">
          {section.title}
        </h2>
        <p className="text-[13px] leading-relaxed text-ink-3">
          {section.description}
        </p>
      </div>

      {/* Answer — kind 별 분기 */}
      {section.kind === "text" ? (
        <>
          <textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            disabled={isSubmitted}
            placeholder={section.placeholder}
            rows={10}
            className="w-full resize-none rounded-[14px] border border-line bg-panel px-4 py-3.5 text-[14.5px] leading-relaxed text-ink placeholder:text-ink-5 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
          />
          {!isSubmitted && (
            <p className="text-[11.5px] text-ink-4">
              입력하면 자동으로 저장돼요. 자유롭게 적고, 부족하면 나중에 돌아와도 괜찮아요.
            </p>
          )}
        </>
      ) : section.kind === "performance" ? (
        <PerformanceSurveyStep
          studentToken={studentToken}
          sectionKey={section.key}
          initial={typeof initialValue === "string" ? normalizePerformanceAnswer(initialValue) : (initialValue as PerformanceAnswer)}
          isSubmitted={isSubmitted}
        />
      ) : section.kind === "history" ? (
        <HistorySurveyStep
          studentToken={studentToken}
          sectionKey={section.key}
          initial={typeof initialValue === "string" ? normalizeHistoryAnswer(initialValue) : (initialValue as HistoryAnswer)}
          isSubmitted={isSubmitted}
        />
      ) : section.kind === "goals" ? (
        <GoalsSurveyStep
          studentToken={studentToken}
          sectionKey={section.key}
          initial={typeof initialValue === "string" ? normalizeGoalsAnswer(initialValue) : (initialValue as GoalsAnswer)}
          isSubmitted={isSubmitted}
        />
      ) : section.kind === "admissionType" ? (
        <AdmissionTypeSurveyStep
          studentToken={studentToken}
          sectionKey={section.key}
          initial={typeof initialValue === "string" ? normalizeAdmissionTypeAnswer(initialValue) : (initialValue as AdmissionTypeAnswer)}
          isSubmitted={isSubmitted}
          gradeNumber={gradeNumber}
        />
      ) : (
        <StrengthsWeaknessesSurveyStep
          studentToken={studentToken}
          sectionKey={section.key}
          initial={typeof initialValue === "string" ? normalizeStrengthsWeaknessesAnswer(initialValue) : (initialValue as StrengthsWeaknessesAnswer)}
          isSubmitted={isSubmitted}
        />
      )}

      {/* Sticky bottom nav */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+64px)] -mx-4 mt-6 border-t border-line bg-canvas/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link
            href={prevHref}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[12px] border border-line bg-panel px-4 text-[13.5px] font-semibold text-ink-2 active:bg-canvas-2"
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </Link>
          <button
            type="button"
            onClick={() => flushAndGo(nextHref)}
            disabled={navPending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-ink px-4 py-3 text-[14px] font-semibold text-white shadow-sm active:scale-[0.98] disabled:opacity-60 transition-transform"
          >
            {navPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLast ? (
              <>
                <ListChecks className="h-4 w-4" />
                검토하고 제출하기
              </>
            ) : (
              <>
                다음
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({
  status,
  disabled,
}: {
  status: SaveState;
  disabled: boolean;
}) {
  if (disabled)
    return <span className="text-[11px] text-ink-5">제출 후 잠김</span>;
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-ink-4">
        <Loader2 className="h-3 w-3 animate-spin" />
        저장 중
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-ok-ink">
        <Check className="h-3 w-3" />
        저장됨
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-bad-ink">저장 실패</span>;
  }
  return null;
}
