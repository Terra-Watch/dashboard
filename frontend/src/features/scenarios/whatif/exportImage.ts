/** Helpers for the exported image. The drawing itself is in the page (it needs the map canvas). */

/** Greedy word wrap; `measure` returns the width of a string. */
export function wrapWords(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw `source` with a caption band under it; returns the new canvas. Throws if the map canvas cannot be read. */
export function composeExport(source: HTMLCanvasElement, caption: string[], disclaimer: string, colors: { background: string; text: string }): HTMLCanvasElement {
  const ratio = source.width / Math.max(1, source.clientWidth || source.width);
  const font = Math.round(14 * ratio);
  const pad = Math.round(10 * ratio);
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `600 ${font}px sans-serif`;
  const width = source.width;
  const lines = [...caption.flatMap(c => wrapWords(c, width - 2 * pad, s => probe.measureText(s).width)), ...wrapWords(disclaimer, width - 2 * pad, s => probe.measureText(s).width)];
  const lineH = Math.round(font * 1.4);
  const band = lines.length * lineH + 2 * pad;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = source.height + band;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, source.height, width, band);
  ctx.fillStyle = colors.text;
  ctx.font = `600 ${font}px sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, source.height + pad + i * lineH));
  return out;
}
