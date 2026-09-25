import { Link2Off, ShieldCheck } from "lucide-react";
import { IconTile } from "@/components/portal/ui";

/** 매직링크 안내 화면(없음·만료·무효화) — 흰 화면 가운데 안내 + 아래 안전 안내 */
export function TokenNotice({ title, body }: { title: string; body: string }) {
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
      <div className="mx-auto flex min-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[420px] flex-col px-x5">
        <div className="flex flex-1 flex-col items-center justify-center pb-x16 pt-x12 text-center">
          <IconTile icon={Link2Off} tone="gray" size={64} round />
          <h1 className="mt-x5 t8-bold text-fg-neutral">{title}</h1>
          <p className="mt-x2 whitespace-pre-line t5-regular text-fg-neutral-subtle">{body}</p>
        </div>

        <div className="mb-x6 flex items-start gap-x2_5 rounded-r4 bg-bg-layer-fill p-x4">
          <ShieldCheck className="mt-x0_5 h-4 w-4 shrink-0 text-fg-neutral-subtle" strokeWidth={2.2} aria-hidden />
          <div className="min-w-0">
            <p className="t4-bold text-fg-neutral-muted">안전 안내</p>
            <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
              링크가 외부에 노출된 것이 의심되면 즉시 담당 원장님께 알려 주세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function reasonToNotice(reason: "not_found" | "expired" | "revoked"): { title: string; body: string } {
  if (reason === "revoked") {
    return {
      title: "무효화된 링크예요",
      body: "이 링크는 관리자가 무효화했어요.\n담당 원장님께 새 링크를 요청해 주세요.",
    };
  }
  if (reason === "expired") {
    return {
      title: "만료된 링크예요",
      body: "이 링크는 더 이상 유효하지 않아요.\n담당 원장님께 새 링크를 요청해 주세요.",
    };
  }
  return {
    title: "찾을 수 없어요",
    body: "링크가 올바른지 확인해 주세요.\n계속 안 되면 담당 원장님께 문의해 주세요.",
  };
}
