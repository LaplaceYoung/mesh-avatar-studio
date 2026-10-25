---
"mesh-avatar": patch
---

Report unparsed Latin suffixes through skippedPinyinCharacters instead of silently
accepting every letter. Normalize Unicode composed/decomposed pinyin consistently
for both playback and unsupported-character reporting.
