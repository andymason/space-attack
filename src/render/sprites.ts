import { Texture } from 'pixi.js';

// Original hand-drawn pixel masks. Each character is a single, hard-edged pixel.
export const ALIEN_MASKS = [
  ['100000000001', '010010010010', '001111111100', '011011110110', '111111111111', '101111111101', '100100001001', '001000000100'],
  ['001000000100', '000100001000', '001111111100', '011011110110', '111111111111', '110111111011', '100100001001', '001000000100'],
  ['001000000100', '000100001000', '001111111100', '011011110110', '111111111111', '101111111101', '101000000101', '000110011000'],
  ['000011110000', '001111111100', '011011110110', '111111111111', '001111111100', '010100001010', '100100001001', '010000000010'],
];
export const ROW_COLORS = [0xf7eb7b, 0xff667c, 0x8df881, 0xff667c, 0xff667c, 0xff667c];
const shipMask = ['0000001000000', '0000011100000', '0000011100000', '0001111111000', '0001111111000', '0111111111110', '1111111111111', '1110011100111', '1100000000011'];

function texture(mask: string[], color: number) {
  const canvas = document.createElement('canvas');
  canvas.width = mask[0].length; canvas.height = mask.length;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  mask.forEach((line, y) => [...line].forEach((pixel, x) => { if (pixel === '1') ctx.fillRect(x, y, 1, 1); }));
  const result = Texture.from(canvas);
  result.source.scaleMode = 'nearest';
  return result;
}

export function createTextures() {
  return { player: texture(shipMask, 0x7bfbe0), aliens: ROW_COLORS.map((color, row) => {
    const mask = ALIEN_MASKS[Math.min(row, 3)];
    const alternate = mask.map((line, y) => y === mask.length - 1 ? [...line].reverse().join('') : line);
    alternate[alternate.length - 1] = row === 0 ? '010000000010' : '100000000001';
    return [texture(mask, color), texture(alternate, color)];
  }) };
}

export function alienSvg(row: number) {
  const mask = ALIEN_MASKS[Math.min(row, 3)];
  const pixels = mask.flatMap((line, y) => [...line].flatMap((pixel, x) => pixel === '1' ? [`<rect x="${x}" y="${y}" width="1" height="1"/>`] : [])).join('');
  return `<svg viewBox="0 0 12 8" aria-hidden="true" fill="currentColor">${pixels}</svg>`;
}
