import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { listMyInstructions } from "@/actions/student-instructions";
import { cn } from "@/lib/utils";
import { EmptyState, Section } from "@/components/portal/ui";
import { InstructionItem } from "../_components/instruction-item";

export const dynamic = "force-dynamic";

export default async function StudentInstructionsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const { items, unacked } = await listMyInstructions({ studentToken: token });

  return (
    <>
      {items.length === 0 ? (
        <Section>
          <EmptyState
            icon={ListChecks}
            tone="brand"
            title="아직 받은 지시가 없어요"
            description="선생님이 할 일을 보내면 여기에 모여요."
            className="py-x10"
          />
        </Section>
      ) : (
        <div className="flex flex-col gap-x3">
          <p className="px-x1 pt-x2 t4-regular text-fg-neutral-subtle">
            {unacked > 0
              ? `확인하지 않은 지시가 ${unacked}건 있어요. 읽고 [확인했어요]를 눌러 주세요.`
              : "받은 지시를 모두 확인했어요."}
          </p>
          {items.map((i) => (
            <Section key={i.id} className={cn(!i.ackedAt && "ring-2 ring-inset ring-stroke-brand-weak")}>
              <InstructionItem token={token} item={i} />
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
