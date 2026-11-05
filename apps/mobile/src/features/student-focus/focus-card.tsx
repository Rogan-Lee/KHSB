import { Lock } from 'lucide-react-native';
import { useState } from 'react';

import { Button, IconTile, ListRow, Section, toast } from '@/design';

import { clock, FOCUS_ROUTE, FOCUS_SUPPORTED, keepFocus, startFocus, useFocusMode } from './focus';

/** 학생 홈 — 집중 모드 바로 시작 (앱·비밀번호를 정해 뒀으면 한 번에 켠다), 2시간이 지나면 계속할지 묻는다 */
export function FocusCard() {
  return FOCUS_SUPPORTED ? <Card /> : null;
}

function Card() {
  const f = useFocusMode();
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<void>, done: string) => {
    setPending(true);
    try {
      await action();
      f.refresh();
      toast(done, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '집중 모드를 바꾸지 못했어요', 'error');
    } finally {
      setPending(false);
    }
  };

  if (f.active) {
    return (
      <Section flush>
        <ListRow
          href={FOCUS_ROUTE}
          leading={<IconTile icon={Lock} tone="brand" solid />}
          title={f.asking ? '아직 공부 중인가요?' : '집중하는 중'}
          description={
            f.asking
              ? `${clock(f.endsAt!)}까지 답이 없으면 풀려요`
              : f.askAt
                ? `${clock(f.askAt)}에 계속하는지 물어볼게요`
                : undefined
          }
          trailing={
            f.asking ? (
              <Button size="sm" loading={pending} onPress={() => void run(keepFocus, '2시간 뒤에 다시 물어볼게요')}>
                계속
              </Button>
            ) : undefined
          }
          chevron={!f.asking}
        />
      </Section>
    );
  }

  if (!f.ready) {
    return (
      <Section flush>
        <ListRow
          href={FOCUS_ROUTE}
          leading={<IconTile icon={Lock} tone="brand" />}
          title="집중 모드"
          description="공부할 때 딴짓 앱을 잠가요"
        />
      </Section>
    );
  }

  return (
    <Section flush>
      <ListRow
        href={FOCUS_ROUTE}
        leading={<IconTile icon={Lock} tone="brand" />}
        title="집중 모드"
        description={`앱 ${f.picked}개 잠그기`}
        trailing={
          <Button size="sm" loading={pending} onPress={() => void run(startFocus, '집중 모드를 켰어요')}>
            바로 시작
          </Button>
        }
        chevron={false}
      />
    </Section>
  );
}
