import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { loadLunchFormData } from "@/lib/lunch-data";
import { LunchOrderForm } from "@/components/lunch/lunch-order-form";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "점심 도시락 신청 · 강한선배 | KHSB",
  description: "자녀의 점심 도시락을 신청하는 학부모 전용 페이지입니다.",
};

export default async function ParentLunchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadLunchFormData(token);
  if (!data) redirect("/s/expired");

  return (
    <div
      className="min-h-[100svh] bg-canvas"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
    >
      <header className="border-b border-line bg-panel px-4 py-3">
        <div className="mx-auto max-w-[480px]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">
            강한선배 | KHSB
          </p>
          <h1 className="mt-0.5 text-[16px] font-bold text-ink">
            {data.studentName} 학생 · 점심 도시락
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-4 py-4">
        <LunchOrderForm {...data.form} />
      </main>
    </div>
  );
}
