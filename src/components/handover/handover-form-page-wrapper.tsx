"use client";

import { useRouter } from "next/navigation";
import { HandoverForm } from "@/components/handover/handover-form";

type Props = Omit<
  React.ComponentProps<typeof HandoverForm>,
  "onDone" | "onCancel"
> & {
  backHref: string;
};

export function HandoverFormPageWrapper({ backHref, ...formProps }: Props) {
  const router = useRouter();

  return (
    <HandoverForm
      {...formProps}
      onDone={() => router.push(backHref)}
      onCancel={() => router.push(backHref)}
    />
  );
}
