"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// 직원 화면(기본 분기) 토스트 — sonner 테마 변수를 SEED 토큰으로 연결한다.
// sonner CSS 는 레이어 밖이라 Tailwind 클래스보다 우선하므로, 색은 변수(인라인 style)로, 치수는 ! 로 덮는다.
// richColors 를 켜면 성공·정보·주의·오류가 SEED 역할색 weak 배경 + 역할색 글자로 그려진다.
const SEED_TOAST_VARS = {
  "--normal-bg": "var(--seed-color-bg-layer-floating)",
  "--normal-border": "var(--seed-color-stroke-neutral-muted)",
  "--normal-text": "var(--seed-color-fg-neutral)",
  "--success-bg": "var(--seed-color-bg-positive-weak)",
  "--success-border": "var(--seed-color-stroke-positive-weak)",
  "--success-text": "var(--seed-color-fg-positive)",
  "--info-bg": "var(--seed-color-bg-informative-weak)",
  "--info-border": "var(--seed-color-stroke-informative-weak)",
  "--info-text": "var(--seed-color-fg-informative)",
  "--warning-bg": "var(--seed-color-bg-warning-weak)",
  "--warning-border": "var(--seed-color-stroke-warning-weak)",
  "--warning-text": "var(--seed-color-fg-warning)",
  "--error-bg": "var(--seed-color-bg-critical-weak)",
  "--error-border": "var(--seed-color-stroke-critical-weak)",
  "--error-text": "var(--seed-color-fg-critical)",
  "--border-radius": "var(--seed-radius-r3)",
  fontFamily: "var(--seed-font-family)",
} as React.CSSProperties

const SEED_TOAST_OPTIONS: ToasterProps["toastOptions"] = {
  classNames: {
    toast: "!gap-x2_5 !px-x4 !py-x3_5 !t4-medium !shadow-[var(--seed-shadow-s3)]",
    title: "!t4-medium",
    description: "!t3-regular !text-fg-neutral-muted",
    icon: "[&_svg]:!size-[18px]",
    actionButton: "!h-8 !rounded-r2 !px-x3 !t3-bold",
    cancelButton: "!h-8 !rounded-r2 !bg-bg-neutral-weak !px-x3 !t3-medium !text-fg-neutral-muted",
  },
}

const Toaster = ({ toastOptions, style, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // toastOptions 를 넘기는 쪽(학생 포털 AppToaster 분기)은 자체 외형을 쓰므로 SEED 기본값을 섞지 않는다.
  const seedDefault = toastOptions === undefined

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      style={seedDefault ? { ...SEED_TOAST_VARS, ...style } : style}
      toastOptions={seedDefault ? SEED_TOAST_OPTIONS : toastOptions}
      {...props}
    />
  )
}

export { Toaster }
