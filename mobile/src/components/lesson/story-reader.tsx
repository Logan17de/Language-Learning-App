import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Copy, Eyebrow } from '@/components/ui';
import { palette, radius, space, type } from '@/constants/theme';
import type { StoryLine, StoryWord } from '@/types/domain';

type Segment = { text: string; word?: StoryWord };
function segmentLine(line: StoryLine, words: StoryWord[]): Segment[] {
  const relevant = words.filter((word) => word.story_line_id === line.id).sort((a, b) => a.position - b.position);
  const segments: Segment[] = []; let cursor = 0;
  for (const word of relevant) {
    const index = line.japanese_text.indexOf(word.surface, cursor);
    if (index < 0) continue;
    if (index > cursor) segments.push({ text: line.japanese_text.slice(cursor, index) });
    segments.push({ text: word.surface, word }); cursor = index + word.surface.length;
  }
  if (cursor < line.japanese_text.length) segments.push({ text: line.japanese_text.slice(cursor) });
  return segments.length ? segments : [{ text: line.japanese_text }];
}

export function StoryReader({ title, japaneseTitle, lines, words }: { title: string; japaneseTitle: string; lines: StoryLine[]; words: StoryWord[] }) {
  const [reveals, setReveals] = useState<Record<string, number>>({}); const [active, setActive] = useState<StoryWord | null>(null);
  const paragraphs = useMemo(() => lines.map((line) => ({ line, segments: segmentLine(line, words) })), [lines, words]);
  function reveal(word: StoryWord) { const current = reveals[word.id] ?? 0; const next = word.script_type === 'kanji' ? Math.min(2, current + 1) : 2; setReveals((value) => ({ ...value, [word.id]: next })); setActive(word); }
  const stage = active ? reveals[active.id] ?? 0 : 0;
  return <View style={styles.wrap}><View><Eyebrow>Story</Eyebrow><Text style={styles.title}>{title}</Text><Text style={styles.japaneseTitle}>{japaneseTitle}</Text><Copy>Tap a word when you need its reading or meaning.</Copy></View>
    <Card style={styles.storyCard}><Text style={styles.passage}>{paragraphs.map(({ line, segments }, lineIndex) => <Text key={line.id}>{lineIndex ? ' ' : ''}{segments.map((segment, index) => segment.word ? <Text key={`${segment.word.id}-${index}`} onPress={() => reveal(segment.word!)} style={[styles.word, (reveals[segment.word.id] ?? 0) > 0 && styles.wordTouched]}>{segment.text}</Text> : <Text key={`${line.id}-${index}`}>{segment.text}</Text>)}</Text>)}</Text>
      {active && stage > 0 ? <Pressable onPress={() => setActive(null)} style={styles.support}><Text style={styles.supportWord}>{active.surface}</Text>{active.script_type === 'kanji' && stage >= 1 ? <Text style={styles.supportReading}>{active.reading}</Text> : null}{stage >= 2 ? <Text style={styles.supportMeaning}>{active.meaning}</Text> : <Text style={styles.supportHint}>Tap the word again for meaning</Text>}</Pressable> : null}
      <View style={styles.translation}><Eyebrow>English translation</Eyebrow><Text style={styles.english}>{lines.map((line) => line.translation).join(' ')}</Text></View>
    </Card>
  </View>;
}
const styles = StyleSheet.create({ wrap: { gap: space.xl }, title: { color: palette.ink, fontSize: 29, fontWeight: '800', marginTop: space.sm }, japaneseTitle: { color: palette.inkMuted, fontFamily: type.japanese, fontSize: 18, marginVertical: space.sm }, storyCard: { gap: space.xl }, passage: { color: palette.ink, fontFamily: type.japanese, fontSize: 21, lineHeight: 39, textAlign: 'justify' }, word: { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: palette.moss200 }, wordTouched: { textDecorationColor: palette.persimmon600, color: palette.moss900 }, support: { alignSelf: 'center', minWidth: 210, borderRadius: radius.md, backgroundColor: palette.moss900, padding: space.lg, alignItems: 'center', gap: space.xs }, supportWord: { color: palette.white, fontSize: 15, fontWeight: '800' }, supportReading: { color: palette.persimmon200, fontFamily: type.japanese, fontSize: 20 }, supportMeaning: { color: palette.white, fontSize: 18 }, supportHint: { color: '#C8D8D1', fontSize: 11 }, translation: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: space.xl, gap: space.md }, english: { color: palette.inkMuted, fontSize: 16, lineHeight: 27, textAlign: 'justify' } });
