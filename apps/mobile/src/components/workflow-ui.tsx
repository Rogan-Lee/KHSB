import { Image } from 'expo-image';
import { FileText } from 'lucide-react-native';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { colors, palette, spacing, type as typeScale } from '@/constants/theme';
import { formatShortDateTime } from '@/lib/format';
import type { QuestionThreadResponse } from '@/lib/mobile-api';

function attIsImage(att: { mimeType: string; name: string }) {
  return (
    att.mimeType.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(att.name)
  );
}

export function FormInput({
  label,
  multiline,
  style,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#9AA49F"
        style={[styles.input, multiline && styles.multilineInput, style]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

export function MessageThread({
  messages,
  viewer,
}: {
  messages: QuestionThreadResponse['messages'];
  viewer: 'STUDENT' | 'STAFF';
}) {
  return (
    <View style={styles.thread}>
      {messages.map((message) => {
        const mine = message.senderType === viewer;
        return (
          <View
            key={message.id}
            style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
            <View style={[styles.message, mine ? styles.messageMine : styles.messageOther]}>
              <Text style={styles.sender}>{message.senderName}</Text>
              <Text style={styles.messageText}>{message.content}</Text>
              {message.attachments.length > 0 ? (
                <View style={styles.attachments}>
                  {message.attachments.map((attachment) =>
                    attIsImage(attachment) ? (
                      <Pressable
                        accessibilityLabel={`${attachment.name} 사진 열기`}
                        accessibilityRole="link"
                        key={attachment.url}
                        onPress={() => void Linking.openURL(attachment.url)}
                        style={({ pressed }) => pressed && styles.pressed}>
                        <Image
                          contentFit="cover"
                          source={{ uri: attachment.url }}
                          style={styles.attachmentImage}
                        />
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityLabel={`${attachment.name} 파일 열기`}
                        accessibilityRole="link"
                        key={attachment.url}
                        onPress={() => void Linking.openURL(attachment.url)}
                        style={({ pressed }) => [styles.fileChip, pressed && styles.pressed]}>
                        <FileText color={palette.blue50} size={16} />
                        <Text numberOfLines={1} style={styles.fileChipText}>
                          {attachment.name}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              ) : null}
              <Text style={styles.messageTime}>{formatShortDateTime(message.createdAt)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  multilineInput: {
    minHeight: 132,
    paddingTop: spacing.md,
  },
  error: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 19,
  },
  thread: {
    gap: spacing.md,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  message: {
    borderRadius: 8,
    gap: spacing.xs,
    maxWidth: '88%',
    padding: spacing.md,
  },
  messageMine: {
    backgroundColor: colors.primarySoft,
  },
  messageOther: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  sender: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  messageText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  messageTime: {
    color: colors.muted,
    fontSize: 10,
  },
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  attachmentImage: {
    borderRadius: 8,
    height: 112,
    width: 112,
  },
  fileChip: {
    alignItems: 'center',
    backgroundColor: palette.blue5,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileChipText: {
    ...typeScale.caption1,
    color: palette.blue50,
    flexShrink: 1,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
