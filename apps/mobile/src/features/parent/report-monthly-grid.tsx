import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

import { space } from '@/design';

/**
 * 칸 수가 고정된 격자 (웹 grid grid-cols-N) — 마지막 줄이 모자라도 칸이 늘어나지 않게 빈 칸으로 채운다.
 */
export function FixedGrid({
  columns,
  gap = space.x2,
  children,
}: {
  columns: number;
  gap?: number;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const cols = Math.max(1, columns);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((item, c) => (
            <View key={c} style={{ flex: 1, minWidth: 0 }}>
              {item}
            </View>
          ))}
          {Array.from({ length: cols - row.length }, (_, k) => (
            <View key={`pad${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
