import type { ChartTheme } from '../chart/theme.ts';

/** Height of the title band above the chart, in CSS pixels. */
const BAND = 40;

/** "AAPL_1D_2026-11-23.png" */
export function snapshotFileName(display: string, interval: string, now: Date): string {
  const safe = display.replace(/[^A-Za-z0-9!._-]/g, '_');
  return `${safe}_${interval}_${now.toISOString().slice(0, 10)}.png`;
}

/**
 * The chart image with a title band on top (symbol, interval, exchange on the left; the latest
 * OHLC and the date on the right), in the chart's own colours, so a shared image explains itself.
 */
export function withTitleBand(
  chart: HTMLCanvasElement,
  title: string,
  detail: string,
  theme: ChartTheme,
): HTMLCanvasElement {
  // takeScreenshot() is in device pixels; the band and its text scale the same way.
  const ratio = window.devicePixelRatio || 1;
  const band = Math.round(BAND * ratio);
  const out = document.createElement('canvas');
  out.width = chart.width;
  out.height = chart.height + band;
  const ctx = out.getContext('2d');
  if (ctx === null) return chart;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, out.width, band);
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${String(14 * ratio)}px ${theme.fontFamily}`;
  ctx.fillStyle = theme.text;
  ctx.fillText(title, 12 * ratio, band / 2);
  ctx.font = `${String(12 * ratio)}px ${theme.fontFamily}`;
  ctx.fillStyle = theme.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText(detail, out.width - 12 * ratio, band / 2);
  ctx.drawImage(chart, 0, band);
  return out;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('the browser could not encode the image'));
      else resolve(blob);
    }, 'image/png');
  });
}

/** Put the image on the clipboard (PNG). */
export async function copyImage(canvas: HTMLCanvasElement): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(canvas) })]);
}

/** Save the image as a PNG file in the browser's downloads. */
export async function downloadImage(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  const url = URL.createObjectURL(await toBlob(canvas));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  // Some browsers (Firefox) only download from an anchor in the document, and read the blob
  // after the click returns: attach it, and free the URL a moment later.
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
