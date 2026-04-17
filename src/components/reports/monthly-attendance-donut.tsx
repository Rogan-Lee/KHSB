"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  normal: number;
  tardy: number;
  absent: number;
  earlyLeave: number;
  outingCount: number;
}

const COLORS = {
  normal: "#10b981",
  tardy: "#f59e0b",
  absent: "#ef4444",
  earlyLeave: "#a855f7",
  outing: "#6b7280",
};

export function MonthlyAttendanceDonut({ normal, tardy, absent, earlyLeave, outingCount }: Props) {
  const data = [
    { name: "정상 출석", value: normal, color: COLORS.normal },
    { name: "지각", value: tardy, color: COLORS.tardy },
    { name: "결석", value: absent, color: COLORS.absent },
    { name: "조퇴", value: earlyLeave, color: COLORS.earlyLeave },
  ].filter((d) => d.value > 0);

  const total = normal + tardy + absent + earlyLeave;

  if (total === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">집계된 출결 데이터가 없습니다</p>;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 h-32 shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={36} outerRadius={60} paddingAngle={2}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${v}일`} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-bold">{total}</p>
          <p className="text-[10px] text-muted-foreground">총 출결</p>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-medium">{d.value}일</span>
          </div>
        ))}
        {outingCount > 0 && (
          <div className="flex items-center gap-2 text-xs pt-1.5 mt-1.5 border-t">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS.outing }} />
            <span className="flex-1">외출</span>
            <span className="font-medium">{outingCount}회</span>
          </div>
        )}
      </div>
    </div>
  );
}
