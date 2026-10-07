import { describe, expect, it } from 'vitest';
import { opaqueBounds, squareFrame } from './sliced-file';

/** A see-through picture with the given pixels painted solid. */
function picture(width: number, height: number, solid: [number, number][], alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of solid) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe('opaqueBounds', () => {
  it('finds the box around everything that is drawn', () => {
    const data = picture(10, 8, [
      [2, 3],
      [6, 1],
      [4, 5],
    ]);

    expect(opaqueBounds(data, 10, 8)).toEqual({ x: 2, y: 1, width: 5, height: 5 });
  });

  it('ignores the faint halo the renderer leaves around the parts', () => {
    const data = picture(10, 10, [[0, 0]], 3);
    data[(5 * 10 + 5) * 4 + 3] = 255;

    expect(opaqueBounds(data, 10, 10)).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });

  it('says there is nothing to crop in an empty picture', () => {
    expect(opaqueBounds(picture(4, 4, []), 4, 4)).toBeNull();
  });
});

describe('squareFrame', () => {
  it('centres a square with some air around a wide box', () => {
    // Parts drawn from x 100 to 299 and y 200 to 299, in a 512 px render.
    const frame = squareFrame({ x: 100, y: 200, width: 200, height: 100 }, 512, 512, 0.05, 0);

    expect(frame.size).toBe(220);
    expect(frame).toEqual({ x: 90, y: 140, size: 220 });
  });

  it('slides back inside instead of cutting a box that touches an edge', () => {
    const frame = squareFrame({ x: 0, y: 450, width: 60, height: 62 }, 512, 512, 0.1, 0);

    expect(frame.x).toBe(0);
    expect(frame.y + frame.size).toBe(512);
  });

  it('does not blow a single small part up into a blur', () => {
    expect(squareFrame({ x: 250, y: 250, width: 10, height: 10 }, 512, 512, 0.06, 128).size).toBe(128);
  });

  it('never asks for more than the picture holds', () => {
    expect(squareFrame({ x: 0, y: 0, width: 512, height: 512 }, 512, 512).size).toBe(512);
  });
});
