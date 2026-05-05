"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, GraduationCap, PieChart, MapPin, Lightbulb } from "lucide-react";
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

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

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

  const inputBase =
    "w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:border-line-strong disabled:opacity-60";

  return (
    <div className="space-y-5">
      {/* 자동 저장 상태 */}
      <div className="text-[11px] text-ink-5 text-right h-3">
        {status === "saving" && "저장 중…"}
        {status === "saved" && "저장됨"}
        {status === "error" && <span className="text-red-600">저장 실패</span>}
      </div>

      {/* 레거시 답변 */}
      {value.legacyText && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-900 mb-1">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
          <p className="text-[10.5px] text-amber-800 mt-2">
            참고용으로만 보입니다. 아래 항목별로 다시 작성해 주세요.
          </p>
        </div>
      )}

      {/* 1. 이전 학습 경험 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">이전 학습 경험</h3>
          <span className="text-[10.5px] text-ink-5">(학원·과외·인강·관리형 등)</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { value: "yes", label: "있음" },
            { value: "no", label: "없음" },
          ].map((opt) => {
            const checked = value.hasPriorEducation === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="hasPriorEducation"
                  checked={checked}
                  onChange={() =>
                    setValue((v) => ({ ...v, hasPriorEducation: opt.value as "yes" | "no" }))
                  }
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>

        {value.hasPriorEducation === "yes" && (
          <>
            {value.priorEducation.map((p, i) => (
              <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-4">기관 {i + 1}</span>
                  {value.priorEducation.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePrior(i)}
                      disabled={isSubmitted}
                      className="text-ink-5 hover:text-red-600 disabled:opacity-40"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={p.institution}
                  onChange={(e) => updatePrior(i, { institution: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="기관명 (예: 메가스터디 / 김선생 과외)"
                  className={inputBase}
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10.5px] text-ink-4">시작 (년월)</span>
                    <input
                      type="month"
                      value={p.periodFrom}
                      onChange={(e) => updatePrior(i, { periodFrom: e.target.value })}
                      disabled={isSubmitted}
                      className={inputBase}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10.5px] text-ink-4">종료 (년월)</span>
                    <input
                      type="month"
                      value={p.periodTo}
                      onChange={(e) => updatePrior(i, { periodTo: e.target.value })}
                      disabled={isSubmitted}
                      className={inputBase}
                    />
                  </label>
                </div>
                <div>
                  <p className="text-[11px] text-ink-4 mb-1.5">과목 (해당 항목 모두 체크)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {HISTORY_SUBJECT_OPTIONS.map((s) => {
                      const checked = p.subjects.includes(s);
                      return (
                        <label
                          key={s}
                          className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                            checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                          } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePriorSubject(i, s)}
                            disabled={isSubmitted}
                            className="sr-only"
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                  {p.subjects.includes("기타") && (
                    <input
                      type="text"
                      value={p.subjectOther ?? ""}
                      onChange={(e) => updatePrior(i, { subjectOther: e.target.value })}
                      disabled={isSubmitted}
                      placeholder="기타 과목 직접 입력"
                      className={`${inputBase} mt-2`}
                    />
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-ink-4 mb-1.5">형태</p>
                  <div className="flex flex-wrap gap-1.5">
                    {HISTORY_FORMAT_OPTIONS.map((f) => {
                      const checked = p.format === f.value;
                      return (
                        <label
                          key={f.value}
                          className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                            checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                          } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`format-${i}`}
                            checked={checked}
                            onChange={() => updatePrior(i, { format: f.value })}
                            disabled={isSubmitted}
                            className="sr-only"
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="text"
                  value={p.quitReason}
                  onChange={(e) => updatePrior(i, { quitReason: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="그만둔 이유 (1줄 — 예: 효율 낮음 / 시간 안 맞음)"
                  className={inputBase}
                />
              </div>
            ))}
            {!isSubmitted && (
              <button
                type="button"
                onClick={addPrior}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-3 py-1.5 text-[11.5px] text-ink-3 hover:border-line-strong hover:text-ink"
              >
                <Plus className="h-3 w-3" />
                기관 추가
              </button>
            )}
          </>
        )}
      </section>

      {/* 2. 현재 학습 시간 분배 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PieChart className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">현재 학습 시간 분배</h3>
          <span className={`ml-auto text-[11px] font-semibold tabular-nums ${mixSum === 100 ? "text-emerald-600" : "text-amber-600"}`}>
            합계 {mixSum} / 100%
          </span>
        </div>
        {mixSum !== 100 && (
          <p className="text-[10.5px] text-amber-700">
            네 영역의 합이 정확히 100% 가 되어야 다음 단계로 넘어갈 수 있어요.
          </p>
        )}
        <div className="space-y-2">
          {HISTORY_MIX_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-16 text-[12px] text-ink-3">{HISTORY_MIX_LABELS[k]}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={value.currentMix[k]}
                onChange={(e) => updateMix(k, Number(e.target.value))}
                disabled={isSubmitted}
                className="flex-1"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={value.currentMix[k]}
                onChange={(e) => updateMix(k, Number(e.target.value))}
                disabled={isSubmitted}
                className="w-16 rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-right tabular-nums disabled:opacity-60"
              />
              <span className="text-[11px] text-ink-5">%</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 주 학습 장소 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">주 학습 장소</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HISTORY_PLACE_OPTIONS.map((opt) => {
            const checked = value.studyPlace === opt;
            return (
              <label
                key={opt}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="studyPlace"
                  checked={checked}
                  onChange={() => setValue((v) => ({ ...v, studyPlace: opt }))}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt}
              </label>
            );
          })}
        </div>
        {value.studyPlace === "기타" && (
          <input
            type="text"
            value={value.studyPlaceOther ?? ""}
            onChange={(e) => setValue((v) => ({ ...v, studyPlaceOther: e.target.value }))}
            disabled={isSubmitted}
            placeholder="기타 장소 직접 입력"
            className={inputBase}
          />
        )}
      </section>

      {/* 4. 입시 컨설팅 경험 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">이전 입시 컨설팅 경험</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: "yes", label: "있음" },
            { value: "no", label: "없음" },
          ].map((opt) => {
            const checked = value.priorConsulting.had === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="priorConsulting"
                  checked={checked}
                  onChange={() => setConsultingHad(opt.value as "yes" | "no")}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        {value.priorConsulting.had === "yes" && (
          <div className="space-y-2 rounded-[10px] border border-line bg-panel p-3">
            <input
              type="text"
              value={value.priorConsulting.institution}
              onChange={(e) => updateConsulting({ institution: e.target.value })}
              disabled={isSubmitted}
              placeholder="컨설팅 기관 / 컨설턴트 이름"
              className={inputBase}
            />
            <input
              type="text"
              value={value.priorConsulting.period}
              onChange={(e) => updateConsulting({ period: e.target.value })}
              disabled={isSubmitted}
              placeholder="이용 시기 (예: 2025년 6월~9월)"
              className={inputBase}
            />
            <div>
              <p className="text-[11px] text-ink-4 mb-1.5">만족도 (1=낮음, 5=높음)</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = value.priorConsulting.had === "yes" && value.priorConsulting.satisfaction === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateConsulting({ satisfaction: n })}
                      disabled={isSubmitted}
                      className={`h-9 w-9 rounded-md border text-[13px] font-semibold tabular-nums ${
                        active ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } disabled:opacity-50`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
