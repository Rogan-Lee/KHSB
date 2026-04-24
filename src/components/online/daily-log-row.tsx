"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Check, Loader2, Eye, EyeOff, ChevronRight } from "lucide-react";
import { upsertDailyKakaoLog } from "@/actions/online/daily-kakao-log";
import { KAKAO_LOG_TAGS } from "@/lib/online/kakao-tags";

const AUTOSAVE_DELAY_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

export function DailyLogRow({
  studentId,
  studentName,
  studentGrade,
  logDate,
  initialSummary,
  initialTags,
  initialIsParentVisible,
  hasExistingLog,
}: {
  studentId: string;
  studentName: string;
  studentGrade: string;
  logDate: string;
  initialSummary: string;
  initialTags: string[];
  initialIsParentVisible: boolean;
  hasExistingLog: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [isParentVisible, setIsParentVisible] = useState(initialIsParentVisible);
  const [status, setStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef({
    summary: initialSummary,
    tags: initialTags.join(","),
    isParentVisible: initialIsParentVisible,
  });

  const save = async () => {
    if (!summary.trim()) {
      setStatus("idle");
      return;
    }
    const currentKey = {
      summary,
      tags: tags.join(","),
      isParentVisible,
    };
    if (
      currentKey.summary === lastSaved.current.summary &&
      currentKey.tags === lastSaved.current.tags &&
      currentKey.isParentVisible === lastSaved.current.isParentVisible
    ) {
      return;
    }
    setStatus("saving");
    try {
      await upsertDailyKakaoLog({
        studentId,
        logDate,
        summary,
        tags,
        isParentVisible,
      });
      lastSaved.current = currentKey;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
      router.refresh();
    } catch (err) {
      setStatus("error");
      toast.error(err instanceof Error ? err.message : "저장 실패");
    }
  };

  // summary/tags/isParentVisible 변경 debounce 저장
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, tags, isParentVisible]);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const notRecorded = !hasExistingLog && !summary.trim();

  return (
    <div
      className={`rounded-[12px] border bg-panel p-3 ${
        notRecorded ? "border-amber-300 bg-amber-50/40" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{studentName}</span>
          <span className="text-[11px] text-ink-5">{studentGrade}</span>
          {notRecorded && (
            <span className="text-[10.5px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
              미기록
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge state={status} />
          <Link
            href={`/online/students/${studentId}/daily-log`}
            className="text-[11px] text-ink-4 hover:text-ink inline-flex items-center gap-0.5"
            title="전체 히스토리"
          >
            과거 기록
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          save();
        }}
        placeholder="오늘 나눈 대화의 핵심 요약"
        rows={2}
        className="w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] resize-y focus:outline-none focus:border-line-strong"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {KAKAO_LOG_TAGS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-colors ${
                active
                  ? "bg-ink text-white"
                  : "bg-panel border border-line text-ink-3 hover:text-ink hover:border-line-strong"
              }`}
            >
              {tag}
            </button>
          );
        })}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setIsParentVisible((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
              isParentVisible
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-200 text-slate-700"
            }`}
            title={isParentVisible ? "학부모 보고서에 노출" : "내부만 — 학부모에게 안 보임"}
          >
            {isParentVisible ? (
              <>
                <Eye className="h-3 w-3" /> 학부모 공개
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3" /> 내부만
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: SaveState }) {
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
    return <span className="text-[11px] text-red-600">실패</span>;
  }
  return null;
}
