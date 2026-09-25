import * as React from "react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "./button"

// 카카오톡 전송·공유 버튼 — 카카오 공식 브랜드 규격(배경 #FEE500, 글자·심볼 검정 85%, 말풍선 심볼).
// 크기·반경·굵기는 SEED ActionButton 규격(size prop)을 그대로 따른다. SEED 팔레트의 유일한 예외.
const KAKAO_CLASS =
  "bg-[#FEE500] text-black/85 hover:bg-[#FEE500] hover:brightness-[0.96] active:brightness-[0.92] " +
  "disabled:bg-bg-disabled disabled:text-fg-disabled disabled:brightness-100"

function KakaoSymbol() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3.2c-5.52 0-10 3.48-10 7.78 0 2.78 1.87 5.22 4.69 6.6l-.96 3.5c-.08.3.25.54.52.37l4.14-2.72c.53.06 1.07.09 1.61.09 5.52 0 10-3.49 10-7.8S17.52 3.2 12 3.2Z" />
    </svg>
  )
}

export type KakaoButtonProps = Omit<ButtonProps, "variant" | "asChild">

const KakaoButton = React.forwardRef<HTMLButtonElement, KakaoButtonProps>(
  ({ className, children = "카카오톡으로 보내기", ...props }, ref) => (
    <Button ref={ref} className={cn(KAKAO_CLASS, className)} {...props}>
      <KakaoSymbol />
      {children}
    </Button>
  )
)
KakaoButton.displayName = "KakaoButton"

export { KakaoButton }
