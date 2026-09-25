"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCheckmarkLine,
  IconExclamationmarkCircleLine,
  IconLockLine,
  IconPlusLine,
  IconTrashcanLine,
} from "@karrotmarket/react-monochrome-icon";
import { Fieldset, PrefixIcon, RadioGroupField, Slider } from "@seed-design/react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  HISTORY_SUBJECT_OPTIONS,
  HISTORY_FORMAT_OPTIONS,
  HISTORY_PLACE_OPTIONS,
  HISTORY_MIX_KEYS,
  HISTORY_MIX_LABELS,
  emptyPriorEducation,
  isHistoryComplete,
  type HistoryAnswer,
  type PriorEducation,
  type StudyMix,
  type PriorConsulting,
} from "@/lib/online/survey-template";
import { Badge, Button, Chip, Notice, Segmented } from "@/components/portal/ui";
import { Chip as SeedChip } from "seed-design/ui/chip";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

const YES_NO_OPTIONS: { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "있어요" },
  { value: "no", label: "없어요" },
];

const SATISFACTION_SCALE = [1, 2, 3, 4, 5] as const;

// 회색 블록(bg-layer-fill) 안의 입력칸은 흰 채움으로 띄운다 (SEED text-input 은 기본 투명)
const ON_FILL = "bg-bg-layer-default";
// iOS 월 선택 입력의 가운데 정렬·고유 스타일 제거
const MONTH_INPUT = "min-w-0 appearance-none text-left [&::-webkit-date-and-time-value]:text-left";
// 숫자 입력의 스핀 버튼 제거
const NUMBER_INPUT =
  "text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function HistorySurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: HistoryAnswer;
  isSubmitted: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<HistoryAnswer>(initial);
  const [status, setStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(initial));

  useEffect(() => {
    if (isSubmitted) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await upsertSurveySection({
          studentToken,
          sectionKey,
          answer: value as unknown as Record<string, unknown>,
        });
        lastSaved.current = serialized;
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, studentToken, sectionKey, isSubmitted]);

  useEffect(() => {
    onValidityChange?.(isHistoryComplete(value));
  }, [value, onValidityChange]);

  // ─── priorEducation ───
  function updatePrior(idx: number, patch: Partial<PriorEducation>) {
    setValue((v) => ({
      ...v,
      priorEducation: v.priorEducation.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }
  function togglePriorSubject(idx: number, subject: string) {
    setValue((v) => ({
      ...v,
      priorEducation: v.priorEducation.map((p, i) => {
        if (i !== idx) return p;
        const next = p.subjects.includes(subject)
          ? p.subjects.filter((s) => s !== subject)
          : [...p.subjects, subject];
        return { ...p, subjects: next };
      }),
    }));
  }
  function addPrior() {
    setValue((v) => ({ ...v, priorEducation: [...v.priorEducation, emptyPriorEducation()] }));
  }
  function removePrior(idx: number) {
    setValue((v) => ({ ...v, priorEducation: v.priorEducation.filter((_, i) => i !== idx) }));
  }

  // ─── currentMix ───
  function updateMix(key: keyof StudyMix, n: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    setValue((v) => ({ ...v, currentMix: { ...v.currentMix, [key]: clamped } }));
  }
  const mixSum = value.currentMix.school + value.currentMix.academy + value.currentMix.online + value.currentMix.selfStudy;

  // ─── priorConsulting ───
  function setConsultingHad(had: "" | "yes" | "no") {
    setValue((v) => ({
      ...v,
      priorConsulting:
        had === "yes"
          ? v.priorConsulting.had === "yes"
            ? v.priorConsulting
            : { had: "yes", institution: "", period: "", satisfaction: 0 }
          : had === "no"
            ? { had: "no" }
            : { had: "" },
    }));
  }
  function updateConsulting(patch: Partial<Extract<PriorConsulting, { had: "yes" }>>) {
    setValue((v) =>
      v.priorConsulting.had === "yes"
        ? { ...v, priorConsulting: { ...v.priorConsulting, ...patch } }
        : v,
    );
  }

  return (
    // disabled fieldset — 제출 후에는 모든 입력이 함께 잠긴다 (SEED 컨트롤엔 disabled 도 직접 전달)
    <fieldset disabled={isSubmitted} className="-mt-3 min-w-0">
      <SaveStatus status={status} locked={isSubmitted} />

      <div className="flex flex-col gap-x10">
        {/* 레거시 답변 */}
        {value.legacyText && (
          <Notice tone="warn" title="이전에 적은 답변">
            <p className="whitespace-pre-wrap">{value.legacyText}</p>
            <p className="mt-x2 t3-regular">참고용으로만 보여요. 아래 항목에 맞춰 다시 적어 주세요.</p>
          </Notice>
        )}

        {/* 1. 이전 학습 경험 */}
        <FormSection
          title="이전 학습 경험"
          description="학원·과외·인강·관리형 등 다녀 본 곳이 있나요?"
        >
          <Segmented<HistoryAnswer["hasPriorEducation"]>
            aria-label="이전 학습 경험"
            options={YES_NO_OPTIONS}
            value={value.hasPriorEducation}
            onChange={(had) =>
              setValue((v) => ({ ...v, hasPriorEducation: had as "yes" | "no" }))
            }
            disabled={isSubmitted}
          />

          {value.hasPriorEducation === "yes" && (
            <div className="flex flex-col gap-x3 pt-x3">
              {value.priorEducation.map((p, i) => (
                <EntryBlock
                  key={i}
                  title={`기관 ${i + 1}`}
                  onRemove={value.priorEducation.length > 1 ? () => removePrior(i) : undefined}
                  removeDisabled={isSubmitted}
                >
                  <TextField
                    label="기관명"
                    value={p.institution}
                    onValueChange={({ value: text }) => updatePrior(i, { institution: text })}
                    disabled={isSubmitted}
                    className={ON_FILL}
                  >
                    <TextFieldInput placeholder="예: 메가스터디, 김선생 과외" />
                  </TextField>
                  <div className="grid grid-cols-2 gap-x2">
                    <div className="min-w-0">
                      <TextField
                        label="시작 월"
                        value={p.periodFrom}
                        onValueChange={({ value: text }) => updatePrior(i, { periodFrom: text })}
                        disabled={isSubmitted}
                        className={ON_FILL}
                      >
                        <TextFieldInput type="month" className={MONTH_INPUT} />
                      </TextField>
                    </div>
                    <div className="min-w-0">
                      <TextField
                        label="종료 월"
                        value={p.periodTo}
                        onValueChange={({ value: text }) => updatePrior(i, { periodTo: text })}
                        disabled={isSubmitted}
                        className={ON_FILL}
                      >
                        <TextFieldInput type="month" className={MONTH_INPUT} />
                      </TextField>
                    </div>
                  </div>
                  <MultiChoiceField label="과목">
                    <div className="flex flex-wrap gap-x2">
                      {HISTORY_SUBJECT_OPTIONS.map((s) => (
                        <Chip
                          key={s}
                          selected={p.subjects.includes(s)}
                          onClick={() => togglePriorSubject(i, s)}
                          disabled={isSubmitted}
                        >
                          {s}
                        </Chip>
                      ))}
                    </div>
                    {p.subjects.includes("기타") && (
                      <TextField
                        value={p.subjectOther ?? ""}
                        onValueChange={({ value: text }) => updatePrior(i, { subjectOther: text })}
                        disabled={isSubmitted}
                        className={ON_FILL}
                      >
                        <TextFieldInput placeholder="기타 과목을 적어 주세요" aria-label="기타 과목" />
                      </TextField>
                    )}
                  </MultiChoiceField>
                  <RadioChipField<PriorEducation["format"]>
                    label="형태"
                    options={HISTORY_FORMAT_OPTIONS}
                    value={p.format}
                    onValueChange={(format) => updatePrior(i, { format })}
                    disabled={isSubmitted}
                  />
                  <TextField
                    label="그만둔 이유"
                    value={p.quitReason}
                    onValueChange={({ value: text }) => updatePrior(i, { quitReason: text })}
                    disabled={isSubmitted}
                    className={ON_FILL}
                  >
                    <TextFieldInput placeholder="한 줄로 적어 주세요 (예: 효율이 낮았어요)" />
                  </TextField>
                </EntryBlock>
              ))}
              {!isSubmitted && (
                <Button variant="weak" size="md" block onClick={addPrior}>
                  <PrefixIcon svg={<IconPlusLine />} />
                  기관 추가
                </Button>
              )}
            </div>
          )}
        </FormSection>

        {/* 2. 현재 학습 시간 분배 */}
        <FormSection
          title="현재 학습 시간 분배"
          description="전체 공부 시간을 100%로 보고 나눠 주세요."
          aside={
            <Badge size="md" tone={mixSum === 100 ? "ok" : "warn"}>
              합계 {mixSum}%
            </Badge>
          }
        >
          <div className="flex flex-col gap-x2">
            {HISTORY_MIX_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-x3">
                <span className="w-x16 shrink-0 t4-medium text-fg-neutral-muted">
                  {HISTORY_MIX_LABELS[k]}
                </span>
                <Slider.Root
                  min={0}
                  max={100}
                  step={5}
                  values={[value.currentMix[k]]}
                  onValuesChange={([n]) => updateMix(k, n)}
                  disabled={isSubmitted}
                  getAriaLabel={() => `${HISTORY_MIX_LABELS[k]} 비율`}
                  className="min-w-0 flex-1"
                >
                  <Slider.Control>
                    <Slider.Track>
                      <Slider.Range />
                    </Slider.Track>
                    <Slider.Thumb thumbIndex={0} />
                    <Slider.HiddenInput thumbIndex={0} />
                  </Slider.Control>
                </Slider.Root>
                <div className="w-[92px] shrink-0">
                  <TextField
                    value={String(value.currentMix[k])}
                    onValueChange={({ value: text }) => updateMix(k, Number(text))}
                    disabled={isSubmitted}
                    suffix="%"
                  >
                    <TextFieldInput
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      aria-label={`${HISTORY_MIX_LABELS[k]} 비율 (%)`}
                      className={NUMBER_INPUT}
                    />
                  </TextField>
                </div>
              </div>
            ))}
          </div>
          {mixSum !== 100 && (
            <p className="t3-regular text-fg-warning-contrast">
              네 영역의 합이 정확히 100%가 되어야 다음 단계로 넘어갈 수 있어요.
            </p>
          )}
        </FormSection>

        {/* 3. 주 학습 장소 */}
        <FormSection title="주로 공부하는 곳">
          <SeedChip.RadioRoot
            aria-label="주로 공부하는 곳"
            value={value.studyPlace}
            onValueChange={(place) =>
              setValue((v) => ({ ...v, studyPlace: place as HistoryAnswer["studyPlace"] }))
            }
            disabled={isSubmitted}
            className="flex flex-wrap gap-x2"
          >
            {HISTORY_PLACE_OPTIONS.map((opt) => (
              <SeedChip.RadioItem key={opt} value={opt} variant="outlineStrong" size="medium">
                <SeedChip.Label>{opt}</SeedChip.Label>
              </SeedChip.RadioItem>
            ))}
          </SeedChip.RadioRoot>
          {value.studyPlace === "기타" && (
            <TextField
              value={value.studyPlaceOther ?? ""}
              onValueChange={({ value: text }) => setValue((v) => ({ ...v, studyPlaceOther: text }))}
              disabled={isSubmitted}
            >
              <TextFieldInput placeholder="기타 장소를 적어 주세요" aria-label="기타 학습 장소" />
            </TextField>
          )}
        </FormSection>

        {/* 4. 입시 컨설팅 경험 */}
        <FormSection
          title="이전 입시 컨설팅 경험"
          description="입시 컨설팅을 받아 본 적이 있나요?"
        >
          <Segmented<PriorConsulting["had"]>
            aria-label="이전 입시 컨설팅 경험"
            options={YES_NO_OPTIONS}
            value={value.priorConsulting.had}
            onChange={(had) => setConsultingHad(had)}
            disabled={isSubmitted}
          />
          {value.priorConsulting.had === "yes" && (
            <div className="pt-x3">
              <div className="flex flex-col gap-x5 rounded-r4 bg-bg-layer-fill px-x4 py-x5">
                <TextField
                  label="기관 · 컨설턴트"
                  value={value.priorConsulting.institution}
                  onValueChange={({ value: text }) => updateConsulting({ institution: text })}
                  disabled={isSubmitted}
                  className={ON_FILL}
                >
                  <TextFieldInput placeholder="컨설팅 기관이나 컨설턴트 이름" />
                </TextField>
                <TextField
                  label="이용 시기"
                  value={value.priorConsulting.period}
                  onValueChange={({ value: text }) => updateConsulting({ period: text })}
                  disabled={isSubmitted}
                  className={ON_FILL}
                >
                  <TextFieldInput placeholder="예: 2025년 6월~9월" />
                </TextField>
                <RadioGroupField.Root
                  value={
                    value.priorConsulting.had === "yes"
                      ? String(value.priorConsulting.satisfaction)
                      : ""
                  }
                  onValueChange={(n) => updateConsulting({ satisfaction: Number(n) })}
                  disabled={isSubmitted}
                >
                  <RadioGroupField.Header>
                    <RadioGroupField.Label>만족도</RadioGroupField.Label>
                  </RadioGroupField.Header>
                  <div className="grid grid-cols-5 gap-x2">
                    {SATISFACTION_SCALE.map((n) => (
                      <SeedChip.RadioItem
                        key={n}
                        value={String(n)}
                        variant="outlineStrong"
                        size="large"
                        className="w-full"
                        inputProps={{ "aria-label": `만족도 ${n}점` }}
                      >
                        <SeedChip.Label className="tabular-nums">{n}</SeedChip.Label>
                      </SeedChip.RadioItem>
                    ))}
                  </div>
                  <div className="flex justify-between px-x1 t2-regular text-fg-neutral-subtle">
                    <span>낮음</span>
                    <span>높음</span>
                  </div>
                </RadioGroupField.Root>
              </div>
            </div>
          )}
        </FormSection>
      </div>
    </fieldset>
  );
}

// ─── 로컬 폼 조각 ─────────────────────────────────────────────────────

function SaveStatus({ status, locked }: { status: SaveState; locked: boolean }) {
  return (
    <div aria-live="polite" className="mb-x3 flex h-x5 items-center justify-end t3-medium">
      {locked ? (
        <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
          <IconLockLine size={14} aria-hidden />
          제출 후 잠김
        </span>
      ) : status === "saving" ? (
        <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
          <ProgressCircle
            size="inherit"
            tone="neutral"
            aria-hidden
            className="[--size:var(--seed-dimension-x3_5)] [--thickness:2px]"
          />
          저장 중
        </span>
      ) : status === "saved" ? (
        <span className="inline-flex items-center gap-x1 text-fg-positive">
          <IconCheckmarkLine size={14} aria-hidden />
          저장됨
        </span>
      ) : status === "error" ? (
        <span className="inline-flex items-center gap-x1 text-fg-critical">
          <IconExclamationmarkCircleLine size={14} aria-hidden />
          저장 실패
        </span>
      ) : null}
    </div>
  );
}

function FormSection({
  title,
  description,
  aside,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-x3">
        <div className="min-w-0">
          <h3 className="t6-bold text-fg-neutral">{title}</h3>
          {description != null && (
            <p className="mt-x1 t4-regular text-fg-neutral-subtle">{description}</p>
          )}
        </div>
        {aside != null && <div className="shrink-0 pt-x0_5">{aside}</div>}
      </div>
      <div className="mt-x4 flex flex-col gap-x3">{children}</div>
    </section>
  );
}

/** 반복 입력 묶음 (기관) — 흰 화면 위 회색(bg-layer-fill) 블록 */
function EntryBlock({
  title,
  onRemove,
  removeDisabled,
  children,
}: {
  title: ReactNode;
  onRemove?: () => void;
  removeDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-r4 bg-bg-layer-fill px-x4 pb-x5 pt-x3">
      <div className="mb-x3 flex min-h-9 items-center justify-between gap-x2">
        <p className="t5-bold text-fg-neutral">{title}</p>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={removeDisabled}
            className="-mr-2"
          >
            <PrefixIcon svg={<IconTrashcanLine />} />
            삭제
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-x5">{children}</div>
    </div>
  );
}

/** 여러 개 고르는 칩 묶음 — SEED Fieldset 라벨 + 보조 표시 */
function MultiChoiceField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Fieldset.Root>
      <Fieldset.Header>
        <Fieldset.Label>
          {label}
          <Fieldset.IndicatorText>여러 개 고를 수 있어요</Fieldset.IndicatorText>
        </Fieldset.Label>
      </Fieldset.Header>
      {children}
    </Fieldset.Root>
  );
}

/** 하나만 고르는 칩 묶음 — SEED RadioGroupField 라벨 + Chip.RadioItem */
function RadioChipField<T extends string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
}: {
  label: ReactNode;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroupField.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
    >
      <RadioGroupField.Header>
        <RadioGroupField.Label>{label}</RadioGroupField.Label>
      </RadioGroupField.Header>
      <div className="flex flex-wrap gap-x2">
        {options.map((o) => (
          <SeedChip.RadioItem key={o.value} value={o.value} variant="outlineStrong" size="medium">
            <SeedChip.Label>{o.label}</SeedChip.Label>
          </SeedChip.RadioItem>
        ))}
      </div>
    </RadioGroupField.Root>
  );
}
