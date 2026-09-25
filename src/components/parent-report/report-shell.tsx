"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * 학부모 공개 리포트 공통 틀 — SEED 영역(data-portal) + 회색 캔버스 + 상단 브랜드 바.
 * 본문은 흰 Section 카드를 gap-x3 로 쌓는다(학생 포털과 같은 문법).
 */
export function ReportShell({
  label,
  footer,
  children,
}: {
  /** 상단 바 오른쪽 문서 종류 (예: "멘토링 리포트") */
  label: string;
  /** 맨 아래 안내 문구 */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const scrolled = useScrolled();
  return (
    <div
      data-portal
      data-seed-color-mode="light-only"
      className="min-h-[100svh] bg-bg-layer-basement"
      style={
        {
          "--portal-surface": "var(--seed-color-bg-layer-basement)",
          paddingBottom: "env(safe-area-inset-bottom)",
        } as React.CSSProperties
      }
    >
      <header
        className="sticky top-0 z-30 backdrop-blur-xl transition-[box-shadow,background-color] duration-200"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          background: scrolled
            ? "color-mix(in srgb, var(--portal-surface) 86%, transparent)"
            : "var(--portal-surface)",
          boxShadow: scrolled ? "0 1px 0 var(--seed-color-stroke-neutral-subtle)" : "none",
        }}
      >
        <div className="mx-auto flex h-14 max-w-[560px] items-center justify-between gap-x3 px-x5">
          <div className="flex items-center gap-x2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/portal-icon.svg" alt="" className="size-x7 rounded-r2" />
            <span className="t6-bold text-fg-neutral">강한선배</span>
          </div>
          <span className="t4-medium text-fg-neutral-subtle">{label}</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-[560px] flex-col gap-x3 px-x4 pb-x6 pt-x1">{children}</main>

      <footer className="mx-auto flex max-w-[560px] items-start justify-center gap-x1_5 px-x8 pb-x10 pt-x2 text-center">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fg-placeholder" strokeWidth={2} />
        <p className="text-balance t3-regular text-fg-neutral-subtle">
          {footer ?? "학부모님께만 공유된 리포트예요. 링크를 다른 사람에게 전달하지 말아 주세요."}
        </p>
      </footer>
    </div>
  );
}

/**
 * 리포트 첫 화면 — 문서 종류/기간(eyebrow), 학생 이름(큰 제목), 보조 정보, 하위 요약.
 * 카드가 아니라 캔버스 위에 바로 놓는 머리글.
 */
export function ReportHero({
  eyebrow,
  title,
  meta,
  badge,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  /** "고2 · 반송고" 처럼 이어 붙일 보조 정보 (빈 값은 무시) */
  meta?: (ReactNode | null | undefined | false)[];
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const metaItems = (meta ?? []).filter((m) => m != null && m !== false && m !== "");
  return (
    <div className="px-x1 pb-x3 pt-x4">
      <div className="flex items-center gap-x2">
        <p className="t4-bold text-fg-brand">{eyebrow}</p>
        {badge}
      </div>
      <h1 className="mt-x1_5 t10-bold text-fg-neutral">{title}</h1>
      {metaItems.length > 0 && (
        <p className="mt-x1 t5-regular text-fg-neutral-subtle">
          {metaItems.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="px-x1 text-fg-placeholder">·</span>}
              {m}
            </span>
          ))}
        </p>
      )}
      {children != null && <div className="mt-x5">{children}</div>}
    </div>
  );
}

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}
