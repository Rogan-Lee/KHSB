"use client";

import { useState } from "react";
import { AlertTriangle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/backoffice/ui";

type Props = {
  mentoringNotes?: string | null;
  internalScoreRange?: string | null;
  mockScoreRange?: string | null;
  targetUniversity?: string | null;
  studentInfo?: string | null;
  selectedSubjects?: string | null;
  admissionType?: string | null;
  onlineLectures?: string | null;
};

const DETAIL_FIELDS: { key: keyof Props; label: string }[] = [
  { key: "selectedSubjects", label: "선택과목" },
  { key: "admissionType",    label: "입시 전형" },
  { key: "onlineLectures",   label: "수강중인 인강" },
  { key: "studentInfo",      label: "학생정보 메모" },
];

export function StudentInfoReveal(props: Props) {
  const [revealed, setRevealed] = useState(false);

  const hasScores = !!(props.internalScoreRange || props.mockScoreRange || props.targetUniversity);
  const hasDetail = DETAIL_FIELDS.some(({ key }) => !!props[key]);
  const hasSensitive = hasScores || hasDetail;

  if (!props.mentoringNotes && !hasSensitive) return null;

  return (
    <div className="flex flex-col gap-x3">
      {/* 멘토링 주의사항 — 항상 표시 */}
      {props.mentoringNotes && (
        <Notice tone="warn" icon={AlertTriangle} title="멘토링 주의사항">
          {props.mentoringNotes}
        </Notice>
      )}

      {/* 성적대 + 상세 — 처음에는 블러 */}
      {hasSensitive && (
        <div className="relative overflow-hidden rounded-r3">
          {/* 내용 영역 — revealed 상태에서 클릭하면 다시 가려짐 */}
          <div
            className={cn(
              "flex flex-col gap-x4 rounded-r3 bg-bg-layer-fill px-x4 py-x4 transition-all duration-200",
              !revealed && "pointer-events-none select-none blur-sm"
            )}
            onClick={() => revealed && setRevealed(false)}
            style={revealed ? { cursor: "pointer" } : undefined}
            title={revealed ? "클릭해서 숨기기" : undefined}
          >
            {/* 성적대 / 희망대학 */}
            {hasScores && (
              <div className="flex flex-wrap gap-x-x8 gap-y-x3">
                {props.internalScoreRange && (
                  <div>
                    <p className="mb-x0_5 t3-medium text-fg-neutral-subtle">내신 성적대</p>
                    <p className="t5-bold text-fg-neutral">{props.internalScoreRange}</p>
                  </div>
                )}
                {props.mockScoreRange && (
                  <div>
                    <p className="mb-x0_5 t3-medium text-fg-neutral-subtle">모의고사 성적대</p>
                    <p className="t5-bold text-fg-neutral">{props.mockScoreRange}</p>
                  </div>
                )}
                {props.targetUniversity && (
                  <div>
                    <p className="mb-x0_5 t3-medium text-fg-neutral-subtle">희망 대학</p>
                    <p className="t5-bold text-fg-neutral">{props.targetUniversity}</p>
                  </div>
                )}
              </div>
            )}

            {/* 상세 필드 */}
            {hasDetail && (
              <div className={cn("flex flex-col gap-x3", hasScores && "border-t border-stroke-neutral-muted pt-x3")}>
                {DETAIL_FIELDS.filter(({ key }) => !!props[key]).map(({ key, label }) => (
                  <div key={key}>
                    <p className="mb-x0_5 t3-medium text-fg-neutral-subtle">{label}</p>
                    <p className="whitespace-pre-wrap t4-regular text-fg-neutral">{props[key]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 블러 오버레이 */}
          {!revealed && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="inline-flex items-center gap-x1_5 rounded-full bg-bg-layer-default px-x4 py-x2 t4-medium text-fg-neutral shadow-[var(--seed-shadow-s1)] transition-colors hover:bg-bg-layer-default-pressed">
                <Eye className="size-4" aria-hidden />
                눌러서 학생 정보 보기
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
