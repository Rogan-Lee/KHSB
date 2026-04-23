import { cn } from "@/lib/utils";

interface StatLineProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function StatLine({ label, value, className }: StatLineProps) {
  return (
    <div className={cn(
      "flex items-center justify-between py-[7px] border-b border-line-2 last:border-b-0 text-[12.5px]",
      className
    )}>
      <span className="text-ink-3">{label}</span>
      <span className="text-ink font-semibold tabular-nums font-mono tracking-[-0.01em]">{value}</span>
    </div>
  );
}
