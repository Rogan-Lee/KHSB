"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export type MagicLinkGateProps = {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  maxLength: number;
  inputMode?: "numeric" | "tel";
  brandColor?: "blue" | "purple" | "violet" | "slate";
  /** Server action 호출. ok=true 면 페이지 reload. */
  onSubmit: (value: string) => Promise<{ ok: boolean; reason?: string }>;
};

const BRAND: Record<NonNullable<MagicLinkGateProps["brandColor"]>, { bg: string; ring: string }> = {
  blue: { bg: "bg-blue-600", ring: "focus:ring-blue-500" },
  purple: { bg: "bg-purple-600", ring: "focus:ring-purple-500" },
  violet: { bg: "bg-violet-600", ring: "focus:ring-violet-500" },
  slate: { bg: "bg-slate-900", ring: "focus:ring-slate-700" },
};

function reasonToMessage(reason: string | undefined): string {
  switch (reason) {
    case "locked":
      return "여러 번 잘못 입력했어요. 10분 후 다시 시도해 주세요.";
    case "invalid":
      return "입력한 값이 일치하지 않아요. 다시 확인해 주세요.";
    case "no_credential":
      return "본인 확인 정보가 등록돼 있지 않아요. 담당 원장님께 문의해 주세요.";
    case "not_found":
    case "expired":
    case "revoked":
      return "이 링크는 더 이상 유효하지 않아요. 새 링크를 요청해 주세요.";
    default:
      return "확인에 실패했어요. 다시 시도해 주세요.";
  }
}

export function MagicLinkGate(props: MagicLinkGateProps) {
  const brand = BRAND[props.brandColor ?? "blue"];
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await props.onSubmit(value);
      if (result.ok) {
        // 쿠키가 발급됐으니 페이지를 다시 로드해 컨텐츠를 보여준다.
        window.location.reload();
      } else {
        setError(reasonToMessage(result.reason));
      }
    });
  }

  return (
    <div
      className="grid min-h-[100svh] place-items-center bg-[#f5f6fa] px-4"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className={`mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full text-white ${brand.bg}`}>
          <ShieldCheck className="h-6 w-6" strokeWidth={2.2} />
        </div>
        <h1 className="mt-4 text-center text-[17px] font-bold tracking-[-0.01em] text-gray-900">
          {props.title}
        </h1>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-500">
          {props.description}
        </p>

        <label className="mt-5 block">
          <span className="text-[12px] font-semibold text-gray-700">{props.label}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.length > 0 && !pending) submit();
            }}
            inputMode={props.inputMode ?? "numeric"}
            autoComplete="off"
            maxLength={props.maxLength}
            placeholder={props.placeholder}
            className={`mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[16px] tracking-widest text-center text-gray-900 placeholder:text-gray-300 focus:border-transparent focus:outline-none focus:ring-2 ${brand.ring}`}
          />
        </label>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || value.length === 0}
          className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${brand.bg}`}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "확인 중…" : "확인"}
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
          본인 확인 정보는 화면 표시 외 용도로 저장되지 않아요.
          <br />
          잘못된 입력이 반복되면 10분 동안 잠금돼요.
        </p>
      </div>
    </div>
  );
}
