import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getWaitlistGuide } from "@/actions/waitlist";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";

export const metadata: Metadata = { title: "등록 안내 · 스터디룸" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };
export const dynamic = "force-dynamic";

export default async function WaitlistGuidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guide = await getWaitlistGuide(token);
  if (!guide) notFound();

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
            <BookOpen className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">{guide.branchName}</h1>
            <p className="text-[11px] text-gray-500">등록 안내</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-4">
            <p className="text-xs font-medium text-white/80">등록 안내</p>
            <h2 className="mt-0.5 text-lg font-bold text-white">{guide.name}님께 드리는 안내</h2>
          </div>
          <div className="px-5 py-5">
            <MarkdownViewer source={guide.content} className="prose prose-sm max-w-none text-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
