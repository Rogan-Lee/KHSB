"use client";

// 멘토링 세션 양측 서명 패드 (Sprint 5 PR 5.2).
// react-signature-canvas 는 canvas 기반이라 SSR 불가 → next/dynamic 로 lazy load.
// 기존 서명이 있으면 <img> 로 보여주고 "다시 서명" 시 새 canvas 활성화.

import dynamic from "next/dynamic";
import { useRef, useState, type ComponentType, type RefAttributes } from "react";
import { Loader2, Eraser, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type SignatureCanvasType from "react-signature-canvas";
import type { SignatureCanvasProps } from "react-signature-canvas";

// next/dynamic 의 결과 타입은 ref 를 받지 못해 cast 필요. 원본 class 의 props + ref 타입을 명시.
const SignatureCanvas = dynamic(
  () => import("react-signature-canvas").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="grid place-items-center h-[160px] rounded-[8px] border border-dashed border-line bg-canvas-2/40 text-[11px] text-ink-5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    ),
  }
) as unknown as ComponentType<
  SignatureCanvasProps & RefAttributes<SignatureCanvasType>
>;

export interface SignaturePadProps {
  initialDataUrl?: string | null;
  onSave: (dataUrl: string) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  label: string;
  disabled?: boolean;
}

export function SignaturePad({
  initialDataUrl,
  onSave,
  onClear,
  label,
  disabled,
}: SignaturePadProps) {
  // ref 는 dynamic-imported class component 라 unknown 으로 받은 뒤 캐스팅
  const padRef = useRef<SignatureCanvasType | null>(null);
  const [drawing, setDrawing] = useState(!initialDataUrl);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(true);

  const handleSave = async () => {
    const pad = padRef.current;
    if (!pad) return;
    if (pad.isEmpty()) return;
    setBusy(true);
    try {
      const dataUrl = pad.getTrimmedCanvas().toDataURL("image/png");
      await onSave(dataUrl);
      setDrawing(false);
    } finally {
      setBusy(false);
    }
  };

  const handleResign = async () => {
    if (initialDataUrl) {
      // 서버에서 기존 서명 삭제까지 동기 처리하면 UX 가 무거워지므로
      // 화면상 redraw 만 활성화하고, 새 서명 저장 시 setSessionSignature 가
      // previousUrl 정리를 함께 수행한다.
      setDrawing(true);
      setEmpty(true);
      return;
    }
    setDrawing(true);
    setEmpty(true);
  };

  const handleClearAll = async () => {
    setBusy(true);
    try {
      await onClear();
      padRef.current?.clear();
      setEmpty(true);
      setDrawing(true);
    } finally {
      setBusy(false);
    }
  };

  const handleCanvasClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
          {label}
        </span>
        {initialDataUrl && !drawing && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-700">
            <Check className="h-3 w-3" />
            서명 완료
          </span>
        )}
      </div>

      {initialDataUrl && !drawing ? (
        <div className="rounded-[8px] border border-line bg-canvas p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={initialDataUrl}
            alt={`${label} 서명`}
            className="block max-h-[140px] w-auto mx-auto"
          />
        </div>
      ) : (
        <div
          className={cn(
            "rounded-[8px] border border-line bg-white overflow-hidden",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          <SignatureCanvas
            ref={(r: SignatureCanvasType | null) => {
              padRef.current = r;
            }}
            penColor="#111"
            onBegin={() => setEmpty(false)}
            canvasProps={{
              className: "w-full h-[160px] touch-none",
              "aria-label": `${label} 서명 패드`,
            }}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {initialDataUrl && !drawing ? (
          <>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={disabled || busy}
              className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-2 py-1 text-[11.5px] text-red-600 hover:text-red-700 hover:border-red-300 disabled:opacity-50"
            >
              <Eraser className="h-3 w-3" />
              삭제
            </button>
            <button
              type="button"
              onClick={handleResign}
              disabled={disabled || busy}
              className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-2.5 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:border-line-strong disabled:opacity-50"
            >
              다시 서명
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleCanvasClear}
              disabled={disabled || busy}
              className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:border-line-strong disabled:opacity-50"
            >
              <Eraser className="h-3 w-3" />
              지우기
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || busy || empty}
              className="inline-flex items-center gap-1 rounded-[8px] bg-ink text-white px-3 py-1 text-[11.5px] font-semibold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              서명 저장
            </button>
          </>
        )}
      </div>
    </div>
  );
}
