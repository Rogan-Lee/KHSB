import type { LucideIcon } from "lucide-react";
import { ButtonLink, IconTile, type Tone } from "@/components/portal/ui";
import { VocabTopBar } from "./vocab-top-bar";

/** /v 안내 화면(없는 시험·만료 등) — 상단바 + 가운데 안내 + 포털로 가기 */
export function VocabNotice({
  icon,
  tone = "gray",
  title,
  body,
  portalHref,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  body: string;
  portalHref?: string;
}) {
  return (
    <>
      <VocabTopBar leading="close" fallbackHref={portalHref} />
      <div className="mx-auto flex min-h-[calc(100svh-56px-env(safe-area-inset-top))] max-w-[480px] flex-col px-x5">
        <div className="flex flex-1 flex-col items-center justify-center pb-x16 text-center">
          <IconTile icon={icon} tone={tone} size={64} round />
          <h1 className="mt-x5 t9-bold text-fg-neutral">{title}</h1>
          <p className="mt-x2 whitespace-pre-line t5-regular text-fg-neutral-subtle">{body}</p>
        </div>
        {portalHref && (
          <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
            <ButtonLink href={portalHref} variant="gray" size="xl" block>
              내 포털로 가기
            </ButtonLink>
          </div>
        )}
      </div>
    </>
  );
}
