import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 직원·학생 공용 인증 화면 틀 — 로고 · 제목 · 설명 · 폼.
 * 모바일은 흰 화면 한 장, sm 이상은 옅은 회색 바탕 위 가운데 카드.
 */
export function AuthShell({
  children,
  description,
  title,
  icon: Icon,
  iconTone = "neutral",
  meta,
  footer,
}: {
  children: React.ReactNode;
  description: React.ReactNode;
  title: React.ReactNode;
  /** 결과 화면(발송 완료·링크 오류 등)에서 로고 대신 보여줄 상태 아이콘 */
  icon?: LucideIcon;
  iconTone?: "neutral" | "positive" | "critical";
  /** 제목 위 작은 배지 (초대 유형 등) */
  meta?: React.ReactNode;
  /** 카드 아래 보조 링크 */
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-bg-layer-default px-x4 py-x10 sm:items-center sm:justify-center sm:bg-bg-layer-fill sm:py-x16">
      <section className="mx-auto w-full max-w-[400px]">
        <div className="sm:rounded-r5 sm:border sm:border-stroke-neutral-muted sm:bg-bg-layer-default sm:px-x8 sm:py-x10">
          <div className="mb-x8 flex flex-col items-center text-center">
            {Icon ? (
              <span
                aria-hidden
                className={cn(
                  "mb-x5 grid size-x14 place-items-center rounded-full",
                  iconTone === "positive" && "bg-bg-positive-weak text-fg-positive",
                  iconTone === "critical" && "bg-bg-critical-weak text-fg-critical",
                  iconTone === "neutral" && "bg-bg-neutral-weak text-fg-neutral-subtle",
                )}
              >
                <Icon className="size-7" />
              </span>
            ) : (
              <Image
                src="/khsb-logo.png"
                alt="강한선배 KHSB"
                width={640}
                height={242}
                priority
                className="mb-x6 h-10 w-auto"
              />
            )}
            {meta != null && <div className="mb-x3">{meta}</div>}
            <h1 className="t8-bold text-fg-neutral sm:t9-bold">{title}</h1>
            <p className="mt-x2 whitespace-pre-line t4-regular text-fg-neutral-subtle">{description}</p>
          </div>
          {children}
        </div>
        {footer != null && (
          <div className="mt-x6 flex flex-col items-center gap-x2 text-center">{footer}</div>
        )}
      </section>
    </main>
  );
}

/** 인증 화면 하단 보조 링크 모양 */
export const authLinkClass =
  "rounded-r2 px-x1 t4-medium text-fg-neutral-muted underline-offset-4 transition-colors hover:text-fg-neutral hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus-ring";

/** 인증 화면 입력 — SEED TextInput(outline · large) 규격(52px · r3 · t5) */
export const authInputClass = "h-x13 rounded-r3 px-x4 t5-regular";
