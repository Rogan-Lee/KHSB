import { cn } from "@/lib/utils";

interface StatLineProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function StatLine({ label, value, className }: StatLineProps) {
  return (
    <div className={cn(
      "flex items-center justify-between py-[7px] border-b border-border last:border-b-0 text-xs",
      className
    )}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-semibold tabular-nums">{value}</span>
    </div>
  );
}
