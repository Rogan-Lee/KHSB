"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Datum {
  date: string;
  isoDate: string;
  score: number;
  correctWords: number;
  totalWords: number;
}

interface Props {
  data: Datum[];
}

/**
 * 영단어 학습 추이 라인 차트(클라이언트). 부모 서버 컴포넌트가 데이터 정제까지 처리.
 * X = testDate (월/일), Y = 정답률(%) 0~100.
 */
export function VocabTrendMiniChartView({ data }: Props) {
  return (
    <div className="h-48 rounded-[12px] border border-gray-100 bg-white p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEC" vertical={false} />
          <XAxis
            dataKey="date"
            fontSize={11}
            tick={{ fill: "#8A8D94" }}
            tickLine={false}
            axisLine={{ stroke: "#DADAD6" }}
          />
          <YAxis
            fontSize={11}
            tick={{ fill: "#8A8D94" }}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            formatter={(v, _name, item) => {
              const p = (item as { payload?: Datum } | undefined)?.payload;
              const detail = p ? ` (${p.correctWords}/${p.totalWords})` : "";
              return [`${v}점${detail}`, "정답률"];
            }}
            labelFormatter={(label) => `${label}`}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid #E8E8E5",
              boxShadow: "0 10px 28px -12px rgba(20,20,25,0.18)",
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="정답률"
            stroke="#2E9D6B"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: "#2E9D6B", strokeWidth: 2, stroke: "white" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
