import { Image, MessageSquareReply } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { Badge, Card, PrimaryButton, SectionTitle } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';

const questions = [
  { age: '12분 전', name: '김학생', subject: '수학', title: '미분 문제 풀이 질문입니다.' },
  { age: '1시간 전', name: '이수빈', subject: '영어', title: '관계대명사 문법을 모르겠어요.' },
  { age: '어제', name: '최민호', subject: '국어', title: '비문학 지문 4번 선지 질문' },
];

export default function StaffQnaScreen() {
  return (
    <AppScreen subtitle="미답변 질문부터 우선 처리합니다." title="질의응답">
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>7</Text>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>답변 대기</Text>
          <Text style={styles.summaryCaption}>24시간 경과 2건</Text>
        </View>
        <MessageSquareReply color={colors.blue} size={28} />
      </View>

      <SectionTitle>답변 대기</SectionTitle>
      <View style={styles.list}>
        {questions.map((question) => (
          <Card key={question.title} style={styles.question}>
            <View style={styles.questionTop}>
              <View style={styles.badges}>
                <Badge tone="blue">{question.subject}</Badge>
                <Badge tone="red">미답변</Badge>
              </View>
              <Text style={styles.age}>{question.age}</Text>
            </View>
            <Text style={styles.title}>{question.title}</Text>
            <View style={styles.meta}>
              <Text style={styles.name}>{question.name}</Text>
              <View style={styles.attachment}>
                <Image color={colors.muted} size={14} />
                <Text style={styles.attachmentText}>사진 1장</Text>
              </View>
            </View>
            <PrimaryButton variant="secondary">답변 작성</PrimaryButton>
          </Card>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryText: {
    flex: 1,
  },
  summaryValue: {
    color: colors.blue,
    fontSize: 36,
    fontWeight: '900',
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryCaption: {
    color: colors.red,
    fontSize: 12,
    marginTop: 3,
  },
  list: {
    gap: spacing.md,
  },
  question: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  questionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  age: {
    color: colors.muted,
    fontSize: 11,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.muted,
    fontSize: 12,
  },
  attachment: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  attachmentText: {
    color: colors.muted,
    fontSize: 11,
  },
});
