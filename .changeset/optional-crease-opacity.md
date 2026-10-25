---
"mesh-avatar": minor
---

Add optional per-eye creaseClosedOpacity (0..1). Unspecified eyes retain existing
blink rendering; configured eyes interpolate crease opacity from 1 when open
to the specified opacity when closed.
