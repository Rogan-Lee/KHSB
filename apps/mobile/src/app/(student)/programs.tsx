import {
  BookMarked,
  ClipboardCheck,
  FileUp,
  MessageCircleMore,
  NotebookTabs,
  Speech,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ActionRow, Card, SectionTitle } from '@/components/mobile-ui';
import { colors } from '@/constants/theme';

export default function StudentProgramsScreen() {
  return (
    <AppScreen subtitle="배정된 프로그램만 표시됩니다." title="관리 프로그램">
      <SectionTitle>학습</SectionTitle>
      <Card>
        <ActionRow caption="진행 중 2개 · 오늘 마감 1개" icon={ClipboardCheck} title="과제" />
        <Divider />
        <ActionRow caption="사진과 파일로 결과 제출" icon={FileUp} title="과제 제출" tone="blue" />
        <Divider />
        <ActionRow caption="이번 주 40개 단어" icon={BookMarked} title="단어 학습" tone="amber" />
      </Card>

      <SectionTitle>소통</SectionTitle>
      <Card>
        <ActionRow
          caption="담당 멘토와 실시간 대화"
          icon={MessageCircleMore}
          title="멘토 채팅"
          tone="blue"
        />
        <Divider />
        <ActionRow
          caption="주간 피드백 1건 미확인"
          icon={NotebookTabs}
          title="학습 피드백"
          tone="violet"
        />
        <Divider />
        <ActionRow caption="첫 상담 전 작성" icon={Speech} title="온라인 관리 설문" tone="primary" />
      </Card>
    </AppScreen>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
