"use client";

import { useState, useTransition } from "react";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { Button, IconTile, Notice } from "@/components/portal/ui";

export type MagicLinkGateProps = {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  maxLength: number;
  inputMode?: "numeric" | "tel";
  /** 예전 브랜드 색 지정 — SEED 전환 후에는 화면에 쓰지 않지만 호출부 호환을 위해 남겨 둔다. */
  brandColor?: "blue" | "purple" | "violet" | "slate";
  /** Server action 호출. ok=true 면 페이지 reload. */
  onSubmit: (value: string) => Promise<{ ok: boolean; reason?: string }>;
};

// 화면당 게이트는 하나뿐이라 고정 id 로 충분하다(useId 는 상위 트리 차이로 하이드레이션 불일치가 난 적이 있음).
const ERROR_ID = "magic-link-gate-error";

function reasonToMessage(reason: string | undefined): string {
  switch (reason) {
    case "locked":
      return "여러 번 잘못 입력했어요. 10분 후 다시 시도해 주세요.";
    case "locked_long":
      return "오늘 시도 횟수를 넘었어요. 담당 원장님께 새 링크를 요청해 주세요.";
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

/**
 * 매직링크 본인 확인 화면 (학부모·학생·순찰 공용) — 흰 화면 위 PIN 입력.
 * 키보드가 올라와도 가리지 않도록 내용은 위에서부터 쌓고, 확인 버튼은 입력창 바로 아래에 둔다.
 */
export function MagicLinkGate(props: MagicLinkGateProps) {
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
      data-portal
      data-seed-color-mode="light-only"
      className="min-h-[100svh] bg-bg-layer-default"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex max-w-[420px] flex-col px-x5 pb-x10 pt-x12">
        <IconTile icon={ShieldCheck} tone="brand" size={56} round />

        <h1 className="mt-x5 t8-bold text-fg-neutral">{props.title}</h1>
        <p className="mt-x2 whitespace-pre-line t5-regular text-fg-neutral-subtle">
          {props.description}
        </p>

        <label className="mt-x8 block">
          <span className="t4-medium text-fg-neutral-muted">{props.label}</span>
          <input
            aria-label={props.label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.length > 0 && !pending) submit();
            }}
            inputMode={props.inputMode ?? "numeric"}
            autoComplete="off"
            autoFocus
            maxLength={props.maxLength}
            placeholder={props.placeholder}
            // 글자 사이 간격(tracking)이 마지막 글자 뒤에도 붙어 왼쪽으로 쏠리는 것을 indent 로 보정
            className="mt-x2 block h-x16 w-full rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x4 text-center t9-bold tracking-[0.3em] indent-[0.3em] tabular-nums text-fg-neutral outline-none transition-[border-color,box-shadow] duration-color-transition placeholder:text-fg-placeholder focus:border-stroke-neutral-contrast focus:shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-contrast)] aria-invalid:border-stroke-critical-solid aria-invalid:shadow-[inset_0_0_0_1px_var(--seed-color-stroke-critical-solid)]"
          />
        </label>

        {error && (
          <div id={ERROR_ID} role="alert" className="mt-x3">
            <Notice tone="bad" icon={CircleAlert}>
              {error}
            </Notice>
          </div>
        )}

        <Button
          variant="primary"
          size="xl"
          block
          loading={pending}
          disabled={value.length === 0}
          onClick={() => {
            if (!pending) submit();
          }}
          className="mt-x4"
        >
          확인
        </Button>

        <p className="mt-x5 t3-regular text-fg-neutral-subtle">
          본인 확인 정보는 화면 표시 외 용도로 저장되지 않아요.
          <br />
          잘못된 입력이 반복되면 10분 동안 잠금돼요.
        </p>
      </div>
    </div>
  );
}
