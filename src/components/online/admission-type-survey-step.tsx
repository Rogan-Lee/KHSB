"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, History, Lock } from "lucide-react";
import { IconTrashcanLine } from "@karrotmarket/react-monochrome-icon";
import { PrefixIcon, TextField as SeedTextField } from "@seed-design/react";
import { ActionButton } from "seed-design/ui/action-button";
import { Checkbox } from "seed-design/ui/checkbox";
import { Chip } from "seed-design/ui/chip";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import {
  RadioSelectBoxItem,
  RadioSelectBoxRadiomark,
  RadioSelectBoxRoot,
} from "seed-design/ui/select-box";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import { Badge, Notice } from "@/components/portal/ui";
import {
  ADMISSION_PRIMARY_TRACK_OPTIONS,
  ADMISSION_CSAT_OPTIONS,
  ADMISSION_CARD_TRACK_OPTIONS,
  ADMISSION_CARD_FIT_OPTIONS,
  ALL_INTERNAL_SEMESTERS,
  INTERNAL_SUBJECT_KEYS,
  MOCK_SUBJECT_KEYS,
  classifyInternalSemesters,
  isAdmissionTypeComplete,
  type AdmissionTypeAnswer,
  type AdmissionCard,
  type AdmissionCardFit,
  type AdmissionCardTrack,
  type AdmissionCsat,
  type AdmissionPrimaryTrack,
  type InternalSubjectKey,
  type MockSubjectKey,
  type InternalSemesterKey,
} from "@/lib/online/survey-template";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

function semesterLabel(sem: InternalSemesterKey) {
  const [y, t] = sem.split("-");
  return `${y}학년 ${t}학기`;
}

export function AdmissionTypeSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  gradeNumber,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: AdmissionTypeAnswer;
  isSubmitted: boolean;
  gradeNumber: 1 | 2 | 3 | null;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<AdmissionTypeAnswer>(initial);
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
    onValidityChange?.(isAdmissionTypeComplete(value, gradeNumber));
  }, [value, gradeNumber, onValidityChange]);

  const semesterClassification = useMemo(
    () => classifyInternalSemesters(gradeNumber),
    [gradeNumber],
  );

  const visibleSemesters = semesterClassification.filter((c) => c.status !== "future");
  const semesterStatus = new Map(semesterClassification.map((c) => [c.semester, c.status]));

  function setSemesterGrade(sem: InternalSemesterKey, subject: InternalSubjectKey, val: string) {
    setValue((v) => ({
      ...v,
      internalGrades: v.internalGrades.map((g) =>
        g.semester === sem ? { ...g, grades: { ...g.grades, [subject]: val } } : g,
      ),
    }));
  }
  function toggleSemesterUnregistered(sem: InternalSemesterKey) {
    setValue((v) => ({
      ...v,
      internalGrades: v.internalGrades.map((g) =>
        g.semester === sem ? { ...g, unregistered: !g.unregistered } : g,
      ),
    }));
  }

  function setMock(idx: number, patch: Partial<{ label: string; unregistered: boolean }>) {
    setValue((v) => ({
      ...v,
      mockGrades: v.mockGrades.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  }
  function setMockGrade(idx: number, subject: MockSubjectKey, val: string) {
    setValue((v) => ({
      ...v,
      mockGrades: v.mockGrades.map((m, i) =>
        i === idx ? { ...m, grades: { ...m.grades, [subject]: val } } : m,
      ),
    }));
  }
  function setMockPercentile(idx: number, subject: MockSubjectKey, val: string) {
    setValue((v) => ({
      ...v,
      mockGrades: v.mockGrades.map((m, i) =>
        i === idx ? { ...m, percentiles: { ...m.percentiles, [subject]: val } } : m,
      ),
    }));
  }

  function setCard(idx: number, patch: Partial<AdmissionCard>) {
    setValue((v) => ({
      ...v,
      cardStrategy: v.cardStrategy.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  const isJeongsiOnly = value.primaryTrack === "정시 단일";

  return (
    <div className="relative">
      <SaveStatus status={status} locked={isSubmitted} />

      <div className="flex flex-col gap-x10">
        {value.legacyText && (
          <Notice tone="warn" icon={History} title="이전에 적은 답변">
            <p className="whitespace-pre-wrap">{value.legacyText}</p>
            <p className="mt-x2 t3-regular">참고용으로만 보여요. 아래 항목에 맞춰 다시 적어 주세요.</p>
          </Notice>
        )}

        {/* 1. 주력 전형 */}
        <Group title="주력 전형">
          <RadioSelectBoxRoot
            aria-label="주력 전형"
            name="primaryTrack"
            value={value.primaryTrack}
            onValueChange={(next) =>
              setValue((v) => ({ ...v, primaryTrack: next as AdmissionPrimaryTrack }))
            }
            disabled={isSubmitted}
          >
            {ADMISSION_PRIMARY_TRACK_OPTIONS.map((opt) => (
              <RadioSelectBoxItem
                key={opt.value}
                value={opt.value}
                label={opt.label}
                suffix={<RadioSelectBoxRadiomark />}
              />
            ))}
          </RadioSelectBoxRoot>
        </Group>

        {/* 2. 내신 등급 */}
        <Group
          title="내신 등급"
          description={
            <>
              {gradeNumber
                ? `고${gradeNumber} 기준으로 지금까지 진행한 학기만 보여요.`
                : "학년 정보가 없어서 5개 학기를 모두 보여요."}{" "}
              성적이 없는 학기는 ‘미등록’을 눌러 주세요.
            </>
          }
        >
          <div className="flex flex-col gap-x2_5">
            {visibleSemesters.map(({ semester, status: semStatus }) => {
              const row = value.internalGrades.find((g) => g.semester === semester);
              if (!row) return null;
              return (
                <div key={semester} className="rounded-r4 bg-bg-layer-fill p-x4">
                  <div className="flex items-center justify-between gap-x2">
                    <div className="flex min-w-0 items-center gap-x2">
                      <span className="t5-bold text-fg-neutral">{semesterLabel(semester)}</span>
                      {semStatus === "ongoing" && (
                        <Badge tone="warn" size="xs">
                          진행 중
                        </Badge>
                      )}
                    </div>
                    <Checkbox
                      label="미등록"
                      size="medium"
                      tone="neutral"
                      checked={row.unregistered}
                      onCheckedChange={() => toggleSemesterUnregistered(semester)}
                      disabled={isSubmitted}
                      className="shrink-0"
                    />
                  </div>
                  <div className="mt-x3 grid grid-cols-6 gap-x1_5">
                    {INTERNAL_SUBJECT_KEYS.map((k) => (
                      <div key={k} className="min-w-0">
                        <span className="mb-x1_5 block text-center t3-medium text-fg-neutral-subtle">
                          {k}
                        </span>
                        <GradeCell
                          value={row.grades[k]}
                          onValueChange={(val) => setSemesterGrade(semester, k, val)}
                          disabled={isSubmitted || row.unregistered}
                          aria-label={`${semesterLabel(semester)} ${k} 등급`}
                          inputMode="decimal"
                          step={0.1}
                          min={1}
                          max={9}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {ALL_INTERNAL_SEMESTERS.filter((s) => semesterStatus.get(s) === "future").length > 0 && (
            <p className="mt-x2_5 px-x1 t3-regular text-fg-neutral-subtle">
              아직 시작하지 않은 학기는 보이지 않아요.
            </p>
          )}
        </Group>

        {/* 3. 모의고사 등급 (최근 3회) */}
        <Group
          title="모의고사 등급"
          description="최근 3회 기준이에요. 회차 이름은 자유롭게 적고, 응시하지 않았다면 ‘미등록’을 눌러 주세요."
        >
          <div className="flex flex-col gap-x2_5">
            {value.mockGrades.map((m, i) => (
              <div key={i} className="rounded-r4 bg-bg-layer-fill p-x4">
                <div className="flex items-center justify-between gap-x2">
                  <span className="t5-bold text-fg-neutral">{i + 1}회차</span>
                  <Checkbox
                    label="미등록"
                    size="medium"
                    tone="neutral"
                    checked={m.unregistered}
                    onCheckedChange={() => setMock(i, { unregistered: !m.unregistered })}
                    disabled={isSubmitted}
                    className="shrink-0"
                  />
                </div>
                <div className="mt-x3">
                  <TextField
                    value={m.label}
                    onValueChange={({ value: label }) => setMock(i, { label })}
                    disabled={isSubmitted || m.unregistered}
                    className="bg-bg-layer-default"
                  >
                    <TextFieldInput
                      placeholder="회차 이름 (예: 9월 모평)"
                      aria-label={`${i + 1}회차 이름`}
                    />
                  </TextField>
                </div>
                {!m.unregistered && (
                  <div className="mt-x4 grid grid-cols-[auto_repeat(5,minmax(0,1fr))] items-center gap-x-x1_5 gap-y-x2">
                    <span aria-hidden />
                    {MOCK_SUBJECT_KEYS.map((k) => (
                      <span key={k} className="text-center t3-medium text-fg-neutral-subtle">
                        {k}
                      </span>
                    ))}

                    <span className="pr-x1 t3-bold text-fg-neutral-muted">등급</span>
                    {MOCK_SUBJECT_KEYS.map((k) => (
                      <GradeCell
                        key={k}
                        value={m.grades[k]}
                        onValueChange={(val) => setMockGrade(i, k, val)}
                        disabled={isSubmitted}
                        aria-label={`${i + 1}회차 ${k} 등급`}
                        inputMode="numeric"
                        step={1}
                        min={1}
                        max={9}
                      />
                    ))}

                    <span className="pr-x1 t3-bold text-fg-neutral-muted">백분위</span>
                    {MOCK_SUBJECT_KEYS.map((k) => (
                      <GradeCell
                        key={k}
                        value={m.percentiles[k]}
                        onValueChange={(val) => setMockPercentile(i, k, val)}
                        disabled={isSubmitted}
                        aria-label={`${i + 1}회차 ${k} 백분위`}
                        inputMode="numeric"
                        step={1}
                        min={0}
                        max={100}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Group>

        {/* 4. 수능 최저 */}
        <Group title="수능 최저 충족 자신감">
          <RadioSelectBoxRoot
            aria-label="수능 최저 충족 자신감"
            name="csatMinimum"
            value={value.csatMinimum}
            onValueChange={(next) =>
              setValue((v) => ({ ...v, csatMinimum: next as AdmissionCsat }))
            }
            disabled={isSubmitted}
          >
            {ADMISSION_CSAT_OPTIONS.map((opt) => (
              <RadioSelectBoxItem
                key={opt.value}
                value={opt.value}
                label={opt.label}
                suffix={<RadioSelectBoxRadiomark />}
              />
            ))}
          </RadioSelectBoxRoot>
        </Group>

        {/* 5. 수시 카드 6장 */}
        {!isJeongsiOnly && (
          <Group
            title="수시 카드 전략"
            description="6장까지 적을 수 있어요. 아직 정하지 못한 칸은 비워 둬도 괜찮아요."
          >
            <div className="flex flex-col gap-x2_5">
              {value.cardStrategy.map((c, i) => (
                <div key={i} className="rounded-r4 bg-bg-layer-fill p-x4">
                  <div className="flex h-x9 items-center justify-between gap-x2">
                    <span className="t5-bold text-fg-neutral">카드 {i + 1}</span>
                    {(c.university || c.department || c.track || c.fit) && !isSubmitted && (
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="small"
                        color="fg.neutralSubtle"
                        onClick={() => setCard(i, { university: "", department: "", track: "", fit: "" })}
                        className="-mr-2"
                        aria-label={`카드 ${i + 1} 비우기`}
                      >
                        <PrefixIcon svg={<IconTrashcanLine />} />
                        비우기
                      </ActionButton>
                    )}
                  </div>
                  <div className="mt-x3 grid grid-cols-2 gap-x2">
                    <TextField
                      value={c.university}
                      onValueChange={({ value: university }) => setCard(i, { university })}
                      disabled={isSubmitted}
                      className="bg-bg-layer-default"
                    >
                      <TextFieldInput placeholder="대학" aria-label={`카드 ${i + 1} 대학`} />
                    </TextField>
                    <TextField
                      value={c.department}
                      onValueChange={({ value: department }) => setCard(i, { department })}
                      disabled={isSubmitted}
                      className="bg-bg-layer-default"
                    >
                      <TextFieldInput placeholder="학과" aria-label={`카드 ${i + 1} 학과`} />
                    </TextField>
                  </div>
                  <ChoiceLine
                    label="전형"
                    name={`card-track-${i}`}
                    value={c.track}
                    options={ADMISSION_CARD_TRACK_OPTIONS}
                    onChange={(track) => setCard(i, { track: track as AdmissionCardTrack })}
                    disabled={isSubmitted}
                  />
                  <ChoiceLine
                    label="성향"
                    name={`card-fit-${i}`}
                    value={c.fit}
                    options={ADMISSION_CARD_FIT_OPTIONS}
                    onChange={(fit) => setCard(i, { fit: fit as AdmissionCardFit })}
                    disabled={isSubmitted}
                  />
                </div>
              ))}
            </div>
          </Group>
        )}

        {/* 6. 판단 근거 */}
        <Group
          title="판단 근거"
          description="내신·모의고사 등급, 생기부 강점·약점, 수능 최저 등을 종합해 2~3줄로 적어 주세요."
        >
          <TextField
            value={value.rationale}
            onValueChange={({ value: rationale }) => setValue((v) => ({ ...v, rationale }))}
            disabled={isSubmitted}
          >
            {/* SEED Textarea 는 내용에 맞춰 자동으로 늘어남(autoresize, 최소 높이 94px) */}
            <TextFieldTextarea placeholder="자유롭게 적어 주세요" aria-label="판단 근거" />
          </TextField>
        </Group>
      </div>
    </div>
  );
}

// ─── Local UI ────────────────────────────────────────────────────────

/** 답변 영역 위 우측의 작은 자동저장 상태 (부모의 질문 설명 아래 여백에 겹쳐 표시) */
function SaveStatus({ status, locked }: { status: SaveState; locked: boolean }) {
  let content: ReactNode = null;
  if (locked) {
    content = (
      <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
        <Lock className="h-3.5 w-3.5" strokeWidth={2.4} />
        제출 후 잠김
      </span>
    );
  } else if (status === "saving") {
    content = (
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
  } else if (status === "saved") {
    content = (
      <span className="inline-flex items-center gap-x1 text-fg-positive">
        <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
        저장됨
      </span>
    );
  } else if (status === "error") {
    content = <span className="text-fg-critical">저장 실패</span>;
  }
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute -top-6 right-0 flex h-x5 items-center t3-bold"
    >
      {content}
    </div>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="t6-bold text-fg-neutral">{title}</h3>
      {description != null && (
        <p className="mt-x1 t4-regular text-fg-neutral-subtle">{description}</p>
      )}
      <div className="mt-x4">{children}</div>
    </section>
  );
}

/**
 * 등급·백분위 숫자 칸 — SEED TextField(outline, large).
 * 좁은 그리드(6·5열)라 SEED 기본 좌우 패딩(x4)을 x1 로 줄이고 가운데 정렬한다.
 * 칸마다 보이는 라벨이 없으므로 Field 래퍼(ui/text-field 의 TextField) 대신 루트를 직접 쓴다.
 */
function GradeCell({
  value,
  onValueChange,
  disabled,
  "aria-label": ariaLabel,
  inputMode,
  step,
  min,
  max,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
  "aria-label": string;
  inputMode: "decimal" | "numeric";
  step: number;
  min: number;
  max: number;
}) {
  return (
    <SeedTextField.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className="bg-bg-layer-default"
    >
      <TextFieldInput
        type="number"
        inputMode={inputMode}
        step={step}
        min={min}
        max={max}
        placeholder="-"
        aria-label={ariaLabel}
        className="px-x1! text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </SeedTextField.Root>
  );
}

/** 수시 카드 안의 단일 선택 줄 — SEED Chip.RadioRoot / Chip.RadioItem */
function ChoiceLine({
  label,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-x3 flex items-center gap-x3">
      <span className="w-x8 shrink-0 t3-bold text-fg-neutral-muted">{label}</span>
      <Chip.RadioRoot
        aria-label={label}
        name={name}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        className="flex min-w-0 flex-1 flex-wrap gap-x1_5"
      >
        {options.map((o) => (
          <Chip.RadioItem
            key={o.value}
            value={o.value}
            variant="outlineStrong"
            size="large"
            className="flex-1"
          >
            <Chip.Label>{o.label}</Chip.Label>
          </Chip.RadioItem>
        ))}
      </Chip.RadioRoot>
    </div>
  );
}
