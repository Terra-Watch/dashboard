import type { SymbolKind } from './geojson';
import type { MapColors } from './colors';

const SIZE = 28;

/** Each claim type has its own SHAPE as well as its own colour, so the map works in greyscale and for colour-blind people. */
export function drawSymbol(kind: SymbolKind, colors: MapColors, pixelRatio = 2): ImageData {
  const px = SIZE * pixelRatio;
  const canvas = document.createElement('canvas'); canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(pixelRatio, pixelRatio);
  const c = SIZE / 2;
  const halo = (draw: () => void) => { ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = colors.surface; draw(); ctx.stroke(); };
  const path = (fn: () => void) => { ctx.beginPath(); fn(); };
  switch (kind) {
    case 'signal': { // violet diamond, dashed: heat seen from space, no person has looked
      const draw = () => path(() => { ctx.moveTo(c, 4); ctx.lineTo(SIZE - 4, c); ctx.lineTo(c, SIZE - 4); ctx.lineTo(4, c); ctx.closePath(); });
      halo(draw); draw(); ctx.fillStyle = colors.surface; ctx.fill(); ctx.setLineDash([3, 2]); ctx.lineWidth = 2.5; ctx.strokeStyle = colors.unconfirmed; ctx.stroke(); break;
    }
    case 'report': { // violet hollow circle: a person says so, not yet checked
      const draw = () => path(() => ctx.arc(c, c, 8, 0, Math.PI * 2));
      halo(draw); draw(); ctx.fillStyle = colors.surface; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = colors.unconfirmed; ctx.stroke(); break;
    }
    case 'verified': { // filled red circle
      const draw = () => path(() => ctx.arc(c, c, 9, 0, Math.PI * 2));
      halo(draw); draw(); ctx.fillStyle = colors.danger; ctx.fill(); break;
    }
    case 'responding': { // amber filled circle with a ring: someone is on the way
      const outer = () => path(() => ctx.arc(c, c, 12, 0, Math.PI * 2));
      outer(); ctx.lineWidth = 2; ctx.strokeStyle = colors.warn; ctx.stroke();
      const draw = () => path(() => ctx.arc(c, c, 7, 0, Math.PI * 2));
      halo(draw); draw(); ctx.fillStyle = colors.warn; ctx.fill(); break;
    }
    case 'contained': { // green ring
      const draw = () => path(() => ctx.arc(c, c, 8, 0, Math.PI * 2));
      halo(draw); draw(); ctx.fillStyle = colors.surface; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = colors.ok; ctx.stroke(); break;
    }
    case 'closed': { // small grey dot
      const draw = () => path(() => ctx.arc(c, c, 4, 0, Math.PI * 2));
      halo(draw); draw(); ctx.fillStyle = colors.muted; ctx.fill(); break;
    }
    case 'officer': { // charcoal square
      const draw = () => path(() => ctx.rect(c - 7, c - 7, 14, 14));
      halo(draw); draw(); ctx.fillStyle = colors.text; ctx.fill(); break;
    }
    case 'task': { // charcoal square with an ember centre: the place the officer is going
      const draw = () => path(() => ctx.rect(c - 9, c - 9, 18, 18));
      halo(draw); draw(); ctx.fillStyle = colors.text; ctx.fill(); path(() => ctx.arc(c, c, 4, 0, Math.PI * 2)); ctx.fillStyle = colors.ember; ctx.fill(); break;
    }
    case 'me': { // blue dot with a white ring: where I am
      path(() => ctx.arc(c, c, 11, 0, Math.PI * 2)); ctx.fillStyle = colors.surface; ctx.fill();
      path(() => ctx.arc(c, c, 7, 0, Math.PI * 2)); ctx.fillStyle = colors.action; ctx.fill(); break;
    }
  }
  return ctx.getImageData(0, 0, px, px);
}

export const SYMBOL_PIXEL_RATIO = 2;
