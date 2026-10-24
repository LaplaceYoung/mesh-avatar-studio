// Japanese text -> timed mouth shapes, for previewing lip sync without audio.
// Only kana are read; other characters are skipped, punctuation makes a short pause.

// open: how far the mouth opens, form: -1 wide (い) .. 0 (あ) .. +1 round (う)
export const VOWELS = {
  a: { open: 0.9, form: 0, label: 'あ' },
  i: { open: 0.5, form: -0.85, label: 'い' },
  u: { open: 0.4, form: 0.9, label: 'う' },
  e: { open: 0.62, form: -0.4, label: 'え' },
  o: { open: 0.75, form: 0.6, label: 'お' },
  n: { open: 0, form: null, label: 'ん' },   // closes with the previous shape
  // Pinyin extras: rounded /y/ (ü) and the retroflex schwa of 儿 (er); Japanese never emits these.
  v: { open: 0.4, form: 1.0, label: 'ü' },
  r: { open: 0.35, form: 0.5, label: 'er' },
};

const ROWS = {
  a: 'あかさたなはまやらわがざだばぱぁ',
  i: 'いきしちにひみりぎじぢびぴぃ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゔ',
  e: 'えけせてねへめれげぜでべぺぇ',
  o: 'おこそとのほもよろをごぞどぼぽぉ',
};
const VOWEL_OF = {};
for (const [v, chars] of Object.entries(ROWS)) for (const c of chars) VOWEL_OF[c] = v;
const LIPS_CLOSE = new Set([...'まみむめもばびぶべぼぱぴぷぺぽ']); // m / b / p close the lips first
const PLAIN_VOWEL = new Set([...'あいうえおぁぃぅぇぉ']);
const SMALL_Y = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const PAUSE = new Set([...'、。，．,.！？!? 　…']);

const toHiragana = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Unsupported characters, for explaining omissions in the editor. */
export function skippedKanaCharacters(text) {
  return [...new Set([...toHiragana(text)].filter(c => !VOWEL_OF[c] && !SMALL_Y[c] && c !== 'ー' && c !== 'っ' && c !== 'ん' && !PAUSE.has(c)))];
}

/** -> [{ vowel, dur, onset }] where onset is 'lips' | 'consonant' | null */
export function kanaToMoras(text, mora = 0.14) {
  const out = [];
  for (const c of toHiragana(text)) {
    const last = out[out.length - 1];
    if (SMALL_Y[c] && last) { last.vowel = SMALL_Y[c]; continue; }
    if (c === 'ー' && last) { last.dur += mora; continue; }
    if (c === 'っ') { out.push({ vowel: 'n', dur: mora * 0.8, onset: null }); continue; }
    if (c === 'ん') { out.push({ vowel: 'n', dur: mora, onset: null }); continue; }
    if (PAUSE.has(c)) { out.push({ vowel: 'n', dur: mora * 2.2, onset: null }); continue; }
    const v = VOWEL_OF[c];
    if (!v) continue;
    out.push({ vowel: v, dur: mora, onset: LIPS_CLOSE.has(c) ? 'lips' : PLAIN_VOWEL.has(c) ? null : 'consonant' });
  }
  return out;
}

/** Mouth target at time t (s) of a mora timeline, or null when it is over. */
export function sampleMoras(moras, t, granularity = 0.5) {
  if (granularity !== 0.5) return sampleGroupedMoras(moras, t, granularity);
  let start = 0;
  for (const m of moras) {
    if (t < start + m.dur) {
      const x = (t - start) / m.dur;
      const v = VOWELS[m.vowel];
      // consonants: the mouth is nearly shut (lips) or half shut at the start of the mora
      const onset = m.onset === 'lips' ? 0.05 : m.onset === 'consonant' ? 0.45 : 1;
      const k = x < 0.35 ? onset + (1 - onset) * (x / 0.35) : 1;
      // Pinyin nasal finals close the jaw for the second half of the mora; the glide
      // (e.g. i- or u- initial) narrows the opening in the first half.
      const nasal = m.nasal && x > 0.55 ? 1 - (x - 0.55) / 0.45 * 0.55 : 1;
      const glide = m.glide && VOWELS[m.glide] && x < 0.4
        ? v.open + (VOWELS[m.glide].open - v.open) * (1 - x / 0.4) * 0.4
        : v.open;
      // i- or u- initial narrows the mouth during the first 40%: e.g. ia → a but start near i,
      // van → e with lips already rounded like ü.
      const form = m.glide && VOWELS[m.glide] && x < 0.4 && v.form !== null && VOWELS[m.glide].form !== null
        ? VOWELS[m.glide].form + (v.form - VOWELS[m.glide].form) * (x / 0.4)
        : v.form;
      return { open: glide * k * nasal, form, vowel: m.vowel };
    }
    start += m.dur;
  }
  return null;
}

// Low sensitivity groups short morae and softens closures. Long pauses still close.
function sampleGroupedMoras(moras, t, granularity) {
  const groupSeconds = granularity < 0.5 ? (0.5 - granularity) * 0.72 : 0;
  let start = 0, groupDuration = 0, groupVowel = null;
  for (const m of moras) {
    let vowel = m.vowel;
    if (m.vowel === 'n') {
      if (groupSeconds && m.dur <= 0.2 && groupVowel) vowel = groupVowel;
      else { groupDuration = 0; groupVowel = null; }
    } else {
      if (!groupVowel || groupDuration >= groupSeconds) { groupVowel = m.vowel; groupDuration = 0; }
      groupDuration += m.dur;
      if (groupSeconds) vowel = groupVowel;
    }
    if (t < start + m.dur) {
      const v = VOWELS[vowel];
      const original = m.onset === 'lips' ? 0.05 : m.onset === 'consonant' ? 0.45 : 1;
      const onset = granularity < 0.5 ? 1 - (1 - original) * granularity * 2 : original * (2 - granularity * 2);
      const attack = Math.min(m.dur * 0.35, 0.05), x = (t - start) / attack;
      const base = x < 1 ? onset + (1 - onset) * x : 1;
      const nasal = m.nasal && x > 0.55 ? 0.45 : 1;
      return { open: v.open * base * nasal, form: v.form, vowel };
    }
    start += m.dur;
  }
  return null;
}
