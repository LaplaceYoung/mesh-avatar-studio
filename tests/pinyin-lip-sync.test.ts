import { expect, test } from 'vitest';
import { Motion } from '../packages/runtime/src/engine/motion.js';
import { pinyinToMoras, skippedPinyinCharacters } from '../packages/runtime/src/engine/pinyin.js';
import { sampleMoras } from '../packages/runtime/src/engine/kana.js';

test('pinyin tokenizer handles syllables with onset and final', () => {
  expect(pinyinToMoras('ni hao').map(m => m.vowel)).toEqual(['i', 'a']);
  expect(pinyinToMoras('wo').map(m => m.vowel)).toEqual(['o']);
  expect(pinyinToMoras('wo').map(m => m.onset)).toEqual(['lips']);
  expect(pinyinToMoras('shi').map(m => m.onset)).toEqual(['consonant']);
});

test('Hanzi maps through the bundled table and unsupported chars surface', () => {
  const moras = pinyinToMoras('我现在很好');
  expect(moras.map(m => m.vowel).join('')).toBe('oeaea');
  expect(skippedPinyinCharacters('龙🤖未来')).toEqual(['🤖']);
  expect(skippedPinyinCharacters('我现在很好')).toEqual([]);
});

test('mixed Hanzi and pinyin work together with punctuation pauses', () => {
  const moras = pinyinToMoras('你好,hao!');
  expect(moras.map(m => m.vowel)).toEqual(['i', 'a', 'n', 'a', 'n']);
  expect(moras.filter(m => m.vowel === 'n').length).toBe(2);
});

test('nasal finals and glides narrow the target shape', () => {
  const nasals = pinyinToMoras('an ang in eng');
  for (const m of nasals) expect(m.nasal).toBe(true);
  const glides = pinyinToMoras('ia ie ian iao iu iong');
  for (const m of glides) expect(m.glide).toBe('i');
  const ianTim = pinyinToMoras('ian');
  const early = sampleMoras(ianTim, ianTim[0].dur * 0.01);
  const late = sampleMoras(ianTim, ianTim[0].dur * 0.95);
  expect(early?.form).toBeLessThan(-0.5);          // starts near i (smile)
  expect(late?.open).toBeLessThan(early?.open ?? 0);  // nasal closes the jaw
});

test('speak drives kana timeline when lang is ja, and pinyin when zh', () => {
  const motion = new Motion([0, 0]); motion.mode = 'manual';
  motion.speak('あいお', { lang: 'ja', speed: 8 });
  expect(motion.kana?.moras.map(m => m.vowel)).toEqual(['a', 'i', 'o']);
  motion.stopLipSync();
  motion.speak('我现在很好', { lang: 'zh', speed: 8 });
  expect(motion.kana?.moras.map(m => m.vowel).join('')).toBe('oeaea');
});
