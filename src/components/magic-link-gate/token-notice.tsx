import { ShieldAlert } from "lucide-react";

export function TokenNotice({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="grid min-h-[100svh] place-items-center bg-[#f5f6fa] px-4"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="h-6 w-6" strokeWidth={2.2} />
        </div>
        <h1 className="mt-4 text-[17px] font-bold tracking-[-0.01em] text-gray-900">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-500 whitespace-pre-line">{body}</p>
        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">안전 안내</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">
            링크가 외부에 노출된 것이 의심되면 즉시 담당 원장님께 알려 주세요.
          </p>
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
