"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Lock } from "lucide-react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import { BottomCTA, Button, ButtonLink, ProgressBar } from "@/components/portal/ui";
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field";
import { ProgressCircle } from "seed-design/ui/progress-circle";
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
    <div>
      {/* Progress */}
      <div className="pt-x2">
        {/* ProgressBar 기본 h-x2 를 덮어쓰려면 important 필요 (SEED 유틸은 tailwind-merge 가 병합 못 함) */}
        <ProgressBar value={progressPct / 100} className="h-x1" />
        <div className="mt-x2_5 flex h-x5 items-center justify-between t3-bold tabular-nums">
          <span>
            <span className="text-fg-brand">{stepIndex + 1}</span>
            <span className="text-fg-placeholder"> / {totalSteps}</span>
          </span>
          {section.kind === "text" && <SaveBadge status={textStatus} disabled={isSubmitted} />}
        </div>
      </div>

      {/* Question */}
      <div className="mt-x6">
        <h2 className="t9-bold text-fg-neutral">{section.title}</h2>
        <p className="mt-x2 t5-regular text-fg-neutral-muted">{section.description}</p>
      </div>

      {/* Answer — kind 별 분기 */}
      <div className="mt-x7">
        {section.kind === "text" ? (
          <TextField
            value={textValue}
            onValueChange={({ value }) => setTextValue(value)}
            disabled={isSubmitted}
            description={
              isSubmitted
                ? undefined
                : "입력하면 자동으로 저장돼요. 자유롭게 적고, 부족하면 나중에 돌아와도 괜찮아요."
            }
          >
            {/* 기존 rows={8} 높이 — SEED textarea 는 rows 대신 minHeight 로 지정(자동 높이 조절 유지) */}
            <TextFieldTextarea
              aria-label={section.title}
              placeholder={section.placeholder}
              style={{ minHeight: 204 }}
            />
          </TextField>
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
      </div>

      {/* 하단 고정 이동 버튼 */}
      <BottomCTA>
        <ButtonLink href={prevHref} variant="gray" size="xl" className="w-[30%] shrink-0">
          이전
        </ButtonLink>
        <Button
          variant="primary"
          size="xl"
          className="min-w-0 flex-1"
          loading={navPending}
          onClick={() => flushAndGo(nextHref)}
        >
          {isLast ? "검토하고 제출하기" : "다음"}
        </Button>
      </BottomCTA>
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
    return (
      <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
        <Lock className="h-3.5 w-3.5" strokeWidth={2.4} />
        제출 후 잠김
      </span>
    );
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-x1_5 text-fg-neutral-subtle">
        {/* SEED ProgressCircle — 글자 높이에 맞춰 size="inherit" + 14px */}
        <ProgressCircle
          tone="neutral"
          size="inherit"
          aria-label="저장 중"
          className="[--size:14px] [--thickness:2px]"
        />
        저장 중
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-x1 text-fg-positive">
        <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
        저장됨
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-fg-critical">저장 실패</span>;
  }
  return null;
}
