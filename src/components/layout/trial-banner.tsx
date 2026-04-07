"use client";

import { Clock } from "lucide-react";

export function TrialBanner({ trialEndsAt }: { trialEndsAt: Date }) {
  const now = new Date();
  const end = new Date(trialEndsAt);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysLeft <= 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm" data-print-hide>
      <div className="flex items-center gap-2 text-amber-800">
        <Clock className="h-4 w-4" />
        <span>
          무료 체험 기간: <strong>{daysLeft}일 남음</strong>
        </span>
      </div>
      <a
        href="#contact"
        className="text-amber-900 font-medium hover:underline"
      >
        유료 전환 문의하기 →
      </a>
    </div>
  );
}
