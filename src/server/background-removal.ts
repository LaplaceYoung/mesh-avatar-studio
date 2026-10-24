import { PNG } from 'pngjs';

export function removeConnectedLightBackground(image: PNG) {
  const visited = new Uint8Array(image.width * image.height), queue = new Uint32Array(image.width * image.height);
  let head = 0, tail = 0;
  const isBackground = (index: number) => image.data[index] > 224 && image.data[index + 1] > 224 && image.data[index + 2] > 224 && Math.max(image.data[index], image.data[index + 1], image.data[index + 2]) - Math.min(image.data[index], image.data[index + 1], image.data[index + 2]) < 28;
  const add = (x: number, y: number) => { const position = y * image.width + x; if (visited[position]) return; const index = position * 4; if (!isBackground(index)) return; visited[position] = 1; queue[tail++] = position; };
  for (let x = 0; x < image.width; x++) { add(x, 0); add(x, image.height - 1); }
  for (let y = 1; y < image.height - 1; y++) { add(0, y); add(image.width - 1, y); }
  while (head < tail) {
    const position = queue[head++], x = position % image.width, y = Math.floor(position / image.width);
    const index = position * 4;
    // Keep an anti-aliased edge: very light boundary pixels fade out instead of forming a halo.
    const lightness = (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3;
    image.data[index + 3] = Math.min(image.data[index + 3], lightness >= 248 ? 0 : Math.max(0, Math.min(255, Math.round((248 - lightness) / 24 * 255))));
    if (x > 0) add(x - 1, y); if (x + 1 < image.width) add(x + 1, y); if (y > 0) add(x, y - 1); if (y + 1 < image.height) add(x, y + 1);
  }
  return image;
}
