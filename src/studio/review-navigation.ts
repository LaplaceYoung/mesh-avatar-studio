export function reviewNavigation(files: string[], selected?: string) {
  const frames = files.filter(file => file !== 'review/contact-sheet.png' && !/-(eyes|mouth)\.png$/.test(file));
  const frame = selected && selected !== 'review/contact-sheet.png' ? selected.replace(/-(eyes|mouth)\.png$/, '.png') : frames[0];
  const index = frame ? frames.indexOf(frame) : -1;
  const crop = selected?.match(/-(eyes|mouth)\.png$/)?.[1];
  const variant = (name: string | undefined, part?: string) => {
    if (!name) return undefined;
    const target = part ? name.replace(/\.png$/, `-${part}.png`) : name;
    return files.includes(target) ? target : undefined;
  };
  // Keep the inspected crop across frames; never silently substitute full images.
  return { frame, index, count: frames.length, full: variant(frame), eyes: variant(frame, 'eyes'), mouth: variant(frame, 'mouth'),
    previous: index > 0 ? variant(frames[index - 1], crop) : undefined,
    next: index >= 0 && index + 1 < frames.length ? variant(frames[index + 1], crop) : undefined };
}
