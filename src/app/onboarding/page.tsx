import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createTrialOrganization } from "@/actions/onboarding";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (user.orgId) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
      <div className="relative w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            스터디룸 매니저에 오신 것을 환영합니다
          </h1>
          <p className="text-muted-foreground mt-2">
            학원 정보를 입력하면 14일 무료 체험이 시작됩니다.
            <br />
            샘플 데이터가 자동으로 생성되어 바로 체험할 수 있습니다.
          </p>
        </div>

        <form action={createTrialOrganization} className="space-y-4">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium mb-1.5">
              학원(독서실) 이름
            </label>
            <input
              id="orgName"
              name="orgName"
              type="text"
              required
              placeholder="예: OO 관리형 독서실"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            14일 무료 체험 시작하기
          </button>

          <p className="text-xs text-center text-muted-foreground">
            체험 기간 동안 STANDARD 플랜의 모든 기능을 사용할 수 있습니다.
            <br />
            신용카드 등록이 필요 없습니다.
          </p>
        </form>
      </div>
    </div>
  );
}
