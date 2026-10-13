#!/usr/bin/env python3
"""Validate v32 kanji-reading lessons and their strict level gate."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PRACTICE = ROOT / 'practice' / 'kanji-reading'
SOURCE = ROOT / 'data' / 'kanji-recall-v32'
LEVELS = ('N5', 'N4', 'N3', 'N2', 'N1')
KANJI = re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def run():
    catalog = load(PRACTICE / 'kanji-level-index.json')
    progress = load(PRACTICE / 'progress.json')
    seen = set()
    for level in LEVELS:
        chars = catalog[level]
        if len(chars) != len(set(chars)):
            raise ValueError(f'{level}: duplicate single-kanji entries')
        if seen.intersection(chars):
            raise ValueError(f'{level}: kanji listed in multiple levels')
        seen.update(chars)

    vocab = {}
    for category, typ in [('compound', 'compound'), ('kana-kanji', 'kana')]:
        for path in (SOURCE / category).glob('N*.json'):
            for card in load(path):
                vocab[(card['target'], typ, card['level'])] = card

    current_level = progress['current_level']
    remaining = sum(progress.get('kanji', {}).get(ch, {}).get('status') != 'strong'
                    for ch in catalog[current_level])
    gate_open = remaining <= 10
    allowed_levels = LEVELS[:LEVELS.index(current_level) + (2 if gate_open else 1)]
    allowed_chars = set().union(*(set(catalog[lvl]) for lvl in allowed_levels))
    print(f'Current level {current_level}, not confirmed strong: {remaining}; '
          f'next-level gate: {"open" if gate_open else "closed"}')

    lesson_files = sorted((PRACTICE / 'stories').glob('N*-*.json'))
    if not lesson_files:
        raise ValueError('No lesson files')
    for file in lesson_files:
        lesson = load(file)
        story = lesson['title'] + '\n' + '\n'.join(lesson['paragraphs'])
        chars = set(KANJI.findall(story))
        # Stored lessons never become invalid when the gate changes later.
        lesson_allowed = set().union(*(set(catalog[lvl]) for lvl in LEVELS[:LEVELS.index(lesson['level'])+1]))
        if lesson['level'] == current_level:
            lesson_allowed |= allowed_chars
        unauthorized = chars - lesson_allowed
        if unauthorized:
            raise ValueError(f'{file}: higher-level/unlisted kanji: {sorted(unauthorized)}')
        if chars != set(lesson['introduced_kanji']):
            raise ValueError(f'{file}: introduced_kanji inventory mismatch')
        for focus in lesson['focus_cards']:
            key = (focus['target'], focus['type'], lesson['level'])
            card = vocab.get(key)
            if card is None:
                raise ValueError(f'{file}: unknown or cross-level vocabulary {key}')
            if card['sourceId'] != focus['source_id'] or card['reading'] != focus['reading']:
                raise ValueError(f'{file}: card source/reading mismatch: {key}')
            for surface in focus['surface_forms']:
                if surface not in story:
                    raise ValueError(f'{file}: target inflection missing: {surface}')
                if set(KANJI.findall(surface)) - lesson_allowed:
                    raise ValueError(f'{file}: target inflection above allowed level: {surface}')
        markdown = file.with_suffix('.md').read_text(encoding='utf-8')
        for p in lesson['paragraphs']:
            if p not in markdown:
                raise ValueError(f'{file}: reader Markdown and JSON differ')
        print(f'PASS {file.name}: {len(chars)} permitted distinct kanji, '
              f'{len(lesson["focus_cards"])} N5 source-verified focus entries, '
              f'{len(lesson["paragraphs"])} paragraphs')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(run())
    except Exception as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)