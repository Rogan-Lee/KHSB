import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

import { FullSheet, Screen } from '@/design';

/**
 * 상세 화면 틀 — 폰은 push 화면(Screen kind="push"), 태블릿 TwoPane 오른쪽 패널은 FullSheet inline.
 * 라우트 화면과 태블릿 패널이 같은 본문 컴포넌트를 쓰도록 감싼다.
 */
export function DetailFrame({
  inline = false,
  title,
  onClose,
  surface = 'panel',
  footer,
  refreshing,
  onRefresh,
  right,
  children,
}: {
  inline?: boolean;
  title: string;
  onClose?: () => void;
  surface?: 'panel' | 'canvas';
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  right?: ReactNode;
  children?: ReactNode;
}) {
  if (inline) {
    return (
      <FullSheet
        inline
        visible
        title={title}
        onClose={onClose ?? (() => {})}
        surface={surface}
        footer={
          footer != null ? (
            // FullSheet footer 는 가로 한 줄 — 버튼들이 폭을 나눠 갖게 감싼다 (Screen footer 와 같은 모양)
            <>
              {Children.toArray(footer).map((child, i) => (
                <View key={i} style={{ flex: 1, minWidth: 0 }}>
                  {child}
                </View>
              ))}
            </>
          ) : undefined
        }>
        {children}
      </FullSheet>
    );
  }
  return (
    <Screen
      kind="push"
      title={title}
      surface={surface}
      footer={footer}
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={right}>
      {children}
    </Screen>
  );
}
