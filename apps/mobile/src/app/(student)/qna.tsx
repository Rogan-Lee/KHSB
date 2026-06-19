import { Alert, StyleSheet, Text, View } from 'react-native';
import { Camera, CircleCheckBig, Clock3, Plus } from 'lucide-react-native';

import { AppScreen } from '@/components/app-screen';
import { Badge, Card, PrimaryButton, SectionTitle } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';

const questions = [
  { status: '답변 완료', subject: '수학', time: '오늘 14:12', title: '미분 문제 풀이가 이해되지 않아요.' },
  { status: '답변 대기', subject: '영어', time: '어제 21:40', title: '관계대명사 which와 that 구분' },
];

export default function StudentQnaScreen() {
  return (
    <AppScreen subtitle="사진을 첨부해 담당 멘토에게 질문할 수 있습니다." title="질의응답">
      <PrimaryButton onPress={() => Alert.alert('질문 등록', '모바일 API 연결 후 사용할 수 있습니다.')}>
        새 질문 작성
      </PrimaryButton>

      <SectionTitle>내 질문</SectionTitle>
      <View style={styles.list}>
        {questions.map((question) => (
          <Card key={question.title} style={styles.question}>
            <View style={styles.questionTop}>
              <Badge tone={question.status === '답변 완료' ? 'primary' : 'amber'}>
                {question.status}
              </Badge>
              <Text style={styles.time}>{question.time}</Text>
            </View>
            <Text style={styles.subject}>{question.subject}</Text>
            <Text style={styles.title}>{question.title}</Text>
            <View style={styles.meta}>
              {question.status === '답변 완료' ? (
                <CircleCheckBig color={colors.primary} size={15} />
              ) : (
                <Clock3 color={colors.amber} size={15} />
              )}
              <Text style={styles.metaText}>
                {question.status === '답변 완료' ? '멘토 답변을 확인하세요.' : '답변을 준비하고 있습니다.'}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      <Card style={styles.photoHint}>
        <Camera color={colors.blue} size={22} />
        <Text style={styles.photoText}>문제 사진은 최대 5장까지 첨부할 수 있습니다.</Text>
        <Plus color={colors.muted} size={18} />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  question: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  questionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.muted,
    fontSize: 11,
  },
  subject: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
  },
  photoHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  photoText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
  },
});
