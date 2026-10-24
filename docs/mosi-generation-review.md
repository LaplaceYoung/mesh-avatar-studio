# Mosi generation review

This note records the local prompt experiment used to tune the optional Mosi
image-generation flow. The generated PNGs are intentionally kept under the
ignored `projects/.uploads/` directory and are not part of Git.

## Shared constraints

The server prompt asks for one front-facing, head-and-shoulders character with
clear eyes, a closed neutral mouth, separated hair locks, readable accessories,
a flat white background and generous margins. The negative prompt rejects sheets,
multiple poses, covered facial features, complex backgrounds, text and watermarks.

The prompt is designed for downstream tracing and layer construction, not only
for image quality. Results still require visual review because a text prompt does
not guarantee semantic separation.

## Local samples

| Brief | Result | Diagnosis |
| --- | --- | --- |
| Short dark bob, one red clip, dark teal jacket | `f2e5258b-7865-4570-9f96-a5d06dbad60b` | Best first-pass candidate. Face is unobstructed, hair silhouette is clear, clothing has a dark boundary, and the single accessory is easy to isolate. |
| Long blue-black hair, side locks, silver ornaments, pale top | `b5e7e990-a25d-435c-aa85-7bd2c8844459` | Usable but higher risk. Long hair, two buns, ribbons, earrings and pale clothing create more layer boundaries and more opportunities for background removal to damage highlights. |
| Very short pixie cut, no ornaments, coral jacket | `55909757-e57d-49f0-93db-a1f1a46c915a` | The model ignored the no-ornament constraint and added buns, flowers and tassels. This confirms that negative wording alone is not a reliable accessory control. |

## Product decisions

1. Keep generated source bytes as `original.png` and use `source.png` as the
   selected working image.
2. Keep background removal opt-in. Connected-light flood fill is not semantic
   segmentation and can damage pale hair, clothing or small gaps.
3. Prefer one or two simple, high-contrast accessories over “no accessories” as
   a generation constraint. A named accessory is easier to inspect and isolate.
4. Treat hair complexity as a production cost. Short hair or clearly separated
   locks are preferred for the first automatic rigging pass.
5. Require a human check of eyes, mouth, hair boundary, pale clothing and
   accessories before regional evidence or layer extraction.

## Reproduction

Set `MOSS_API_KEY` only in a local `.env.local`, start `npm run dev`, and use the
Studio Create flow. Do not copy keys, generated images or private upload IDs into
source code, issues or commits.
