import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Clock, Check } from "lucide-react";

export default async function TrialExpiredPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  // 트라이얼이 아직 유효하면 대시보드로
  if (user.orgStatus !== "TRIAL" || !user.trialEndsAt || user.trialEndsAt > new Date()) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">체험 기간이 만료되었습니다</h1>
          <p className="text-muted-foreground mt-2">
            14일 무료 체험이 종료되었습니다.
            <br />
            유료 플랜으로 전환하시면 기존 데이터를 그대로 이어서 사용할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-left">
          <div className="rounded-xl border p-5 space-y-3">
            <div>
              <p className="font-semibold">Starter</p>
              <p className="text-2xl font-bold">129,000<span className="text-sm font-normal text-muted-foreground">원/월</span></p>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />원생 관리</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />출결 관리</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />좌석 배치</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />인수인계</li>
            </ul>
          </div>

          <div className="rounded-xl border-2 border-primary p-5 space-y-3 relative">
            <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">추천</span>
            <div>
              <p className="font-semibold">Standard</p>
              <p className="text-2xl font-bold">239,000<span className="text-sm font-normal text-muted-foreground">원/월</span></p>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />Starter 전체</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />멘토링 기록</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />상벌점 / 면담</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-green-500" />월간 리포트</li>
            </ul>
          </div>
        </div>

        <a
          href="https://tally.so/r/your-contact-form"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          유료 전환 상담 신청
        </a>

        <p className="text-xs text-muted-foreground">
          기존 데이터는 안전하게 보관되어 있으며, 유료 전환 시 그대로 이어서 사용할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
