// Mandarin text -> timed mouth shapes, for previewing lip sync without audio.
// Han characters go through a small frequency-ordered map (see pinyin-map.js, derived from the
// kHanyuPinlu table with tone marks stripped, ü written "v"). Characters not covered by the map
// show up via skippedPinyinCharacters, mirroring the Japanese path.
import { VOWELS } from './kana.js';
import { PINYIN_MAP_COMPACT } from './pinyin-map.js';

// Parsed lazily so consumers that never use Mandarin do not parse ~28 KB of compact data.
let PINYIN;
function pinyinMap() {
  if (!PINYIN) {
    PINYIN = new Map();
    for (const entry of PINYIN_MAP_COMPACT.split(',')) PINYIN.set(entry[0], entry.slice(1));
  }
  return PINYIN;
}

// Onset groups by articulation:
//   lips      — b, p, m, f, w: mouth closes or rounds first
//   alveolar  — d, t, n, l, z, c, s: tongue-ridge stop, slight narrowing
//   retroflex — zh, ch, sh, r: tongue curled, corners open like /u/
//   palatal   — j, q, x, y: i-quality onglide, wide smile
//   velar     — g, k, h: neutral, no extra lip work
const ONSET_LIPS = new Set(['b', 'p', 'm', 'f', 'w']);
const ONSETS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'y', 'w', 'z', 'c', 's', 'r'];
// Multi-char finals first so the regex above matches longest first.
const FINALS = ['iang', 'iong', 'uang', 'ueng', 'uan', 'ian', 'ang', 'eng', 'ing', 'ong',
  'iao', 'uai', 'van', 'vn', 'ua', 'uo', 'ia', 'ie', 'iu', 'in', 'ai', 'ei', 'ao', 'ou',
  'ui', 'ue', 'un', 'en', 'an', 've', 'er', 'a', 'o', 'e', 'i', 'u', 'v'];
// dominant vowel target for each final — see VOWELS for the shape each key holds
const FINAL_SHAPE = {
  a: ['a', null], ai: ['a', null], an: ['a', null], ang: ['a', null], ao: ['a', null],
  o: ['o', null], ong: ['o', null], ou: ['o', null],
  e: ['e', null], ei: ['e', null], en: ['e', null], eng: ['e', null], er: ['e', 'r'],
  i: ['i', null], ia: ['a', 'i'], ie: ['e', 'i'], iao: ['a', 'i'], iu: ['u', 'i'],
  ian: ['e', 'i'], in: ['i', 'i'], iang: ['a', 'i'], ing: ['i', 'i'], iong: ['o', 'i'],
  u: ['u', null], ua: ['a', 'u'], uo: ['o', 'u'], uai: ['a', 'u'], ui: ['e', 'u'],
  uan: ['a', 'u'], un: ['e', 'u'], uang: ['a', 'u'], ueng: ['e', 'u'],
  v: ['v', null], ve: ['e', 'v'], van: ['e', 'v'], vn: ['v', 'v'],
};

// Normalize accidental tone marks so the documented toneless path also accepts
// pasted pinyin such as "nǐ hǎo" without turning the marked vowels into gaps.
const TONE_MARKS = new Map([
  ...Object.entries({ ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i', ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v', ü: 'v' }),
  ...Object.entries({ Ā: 'a', Á: 'a', Ǎ: 'a', À: 'a', Ē: 'e', É: 'e', Ě: 'e', È: 'e', Ī: 'i', Í: 'i', Ǐ: 'i', Ì: 'i', Ō: 'o', Ó: 'o', Ǒ: 'o', Ò: 'o', Ū: 'u', Ú: 'u', Ǔ: 'u', Ù: 'u', Ǖ: 'v', Ǘ: 'v', Ǚ: 'v', Ǜ: 'v', Ü: 'v' }),
]);
const normalizeLatin = value => [...value].map(c => TONE_MARKS.get(c) ?? c).join('');

// VOWELS already carries the v (ü) and r (er) shapes that kana.js exposes; see kana.js.
void VOWELS;

export function skippedPinyinCharacters(text) {
  const out = [];
  const map = pinyinMap();
  let latin = '';
  const flush = () => {
    let consumed = 0;
    for (const { onset, final } of syllablesFrom(normalizeLatin(latin))) consumed += onset.length + final.length;
    for (const c of [...latin].slice(consumed)) if (!out.includes(c)) out.push(c);
    latin = '';
  };
  for (const c of text.normalize('NFC')) {
    if (/[a-zA-Z]/.test(c) || TONE_MARKS.has(c)) { latin += c; continue; }
    flush();
    if (/\s|，。！？；：、“”‘’（）《》〈〉【】…—,.!?;:'"()\[\]<>-/.test(c)) continue;
    if (/[0-9]/.test(c)) { out.push(c); continue; }
    if (!map.has(c) && !out.includes(c)) out.push(c);
  }
  flush();
  return out;
}

const PAUSE = new Set([...'、。，．！？；：,.!?;:\u3000…\n\t']);
const GAP = new Set([...' ']);

function* syllablesFrom(pinyin) {
  let i = 0;
  while (i < pinyin.length) {
    const rest = pinyin.slice(i).toLowerCase();
    let onset = '';
    for (const o of ONSETS) if (rest.startsWith(o) && rest.length > o.length) { onset = o; break; }
    const tail = rest.slice(onset.length);
    let final = '';
    for (const f of FINALS) if (tail.startsWith(f)) { final = f; break; }
    if (!final) return; // The skipped-character API reports this unparsed suffix.
    yield { onset, final };
    i += (onset + final).length;
  }
}

function pushSyllables(out, latin, mora) {
  for (const { onset, final } of syllablesFrom(latin)) {
    // Pinyin omits the umlaut after j/q/x and in yu/yuan/yun. Keep the
    // written spelling for token boundaries, but recover the rounded vowel.
    const pronouncedFinal = ['j', 'q', 'x', 'y'].includes(onset)
      ? ({ u: 'v', ue: 've', un: 'vn', uan: 'van' }[final] ?? final) : final;
    const nasal = /n$|ng$/.test(pronouncedFinal) || pronouncedFinal === 'vn';
    const shape = FINAL_SHAPE[pronouncedFinal] ?? ['a', null];
    out.push({ vowel: shape[0], dur: mora, onset: ONSET_LIPS.has(onset) ? 'lips' : onset ? 'consonant' : null, nasal, glide: shape[1] });
  }
}

/** Hanzi + pinyin mixed text -> [{ vowel, dur, onset }]. */
export function pinyinToMoras(text, mora = 0.14) {
  const out = [];
  const map = pinyinMap();
  let latin = '';
  const flush = () => {
    if (!latin.trim()) { latin = ''; return; }
    for (const word of latin.trim().split(/\s+/)) pushSyllables(out, word, mora);
    latin = '';
  };
  for (const c of text.normalize('NFC')) {
    if (PAUSE.has(c)) {
      flush();
      out.push({ vowel: 'n', dur: mora * 1.6, onset: null, nasal: false, glide: null });
      continue;
    }
    if (GAP.has(c)) { latin += ' '; continue; }
    if (/[a-zA-Z]/.test(c) || TONE_MARKS.has(c)) { latin += normalizeLatin(c); continue; }
    flush();
    const p = map.get(c);
    if (p) pushSyllables(out, p, mora);
  }
  flush();
  return out;
}
