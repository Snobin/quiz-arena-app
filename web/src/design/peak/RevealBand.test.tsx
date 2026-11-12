import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motion } from '../tokens.ts';
import { animatePeak } from './animate.ts';
import { BOLT_HEIGHT, BOLT_WIDTH, boltViewportFraction } from './BoltStrike.tsx';
import { CORRECT_OPTION_CLASS, CORRECT_STATUS_CLASS, CorrectTile } from './CorrectOption.tsx';
import { RevealBand, type RevealBandProps } from './RevealBand.tsx';

const flashes = vi.hoisted(() => ({ queue: [] as Array<{ run: (t: number) => void; cancelled: boolean }> }));
vi.mock('../../motion/flashScheduler.ts', () => ({
  requestFlash: (run: (t: number) => void) => {
    const entry = { run, cancelled: false };
    flashes.queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  },
}));
const monitor = vi.hoisted(() => ({ calls: 0, stops: 0 }));
vi.mock('../../motion/reduceEffects.ts', () => ({
  monitorBandDrop: () => {
    monitor.calls += 1;
    return () => {
      monitor.stops += 1;
    };
  },
}));

type Animated = { keyframes: Keyframe[]; options: KeyframeAnimationOptions; element: Element };
let animations: Animated[];

function runFlashes(): number {
  let ran = 0;
  act(() => {
    while (flashes.queue.length) {
      const entry = flashes.queue.shift()!;
      if (!entry.cancelled) {
        entry.run(0);
        ran += 1;
      }
    }
  });
  return ran;
}

const props = (over: Partial<RevealBandProps> = {}): RevealBandProps => ({
  revealKey: '3',
  correct: true,
  reduced: false,
  label: 'ചോദ്യം 4 · ശരി',
  answer: 'പെരിയാർ',
  answerLang: 'ml',
  points: '+800',
  total: 'ആകെ 3,140',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  flashes.queue.length = 0;
  monitor.calls = 0;
  monitor.stops = 0;
  animations = [];
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    animations.push({ keyframes, options, element: this });
    return {} as Animation;
  } as unknown as Element['animate'];
});

afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as { animate?: unknown }).animate;
});

const onlyTransformAndOpacity = () => {
  for (const { keyframes } of animations) {
    for (const frame of keyframes) {
      expect(Object.keys(frame).every((k) => ['transform', 'opacity', 'offset'].includes(k))).toBe(true);
    }
  }
};

describe('RevealBand', () => {
  it('correct: drop then one strike, each through requestFlash; volt points; dark volt edge', () => {
    render(<RevealBand {...props()} />);
    const band = screen.getByTestId('reveal-band');
    expect(band.className).toContain('surface-band');
    expect(band.className).toContain('rounded-xl');
    expect(band.className).toContain('dark:border-volt');
    expect(screen.getByTestId('band-points').className).toContain('text-volt');
    expect(screen.getByTestId('band-points').className).toContain('font-peak-points');
    expect(screen.getByText('പെരിയാർ')).toHaveAttribute('lang', 'ml');
    expect(screen.getByText('പെരിയാർ').className).toContain('text-peak-word');
    expect(screen.getByTestId('bolt').getAttribute('class')).toContain('text-volt');
    // Nothing shows until the scheduler grants a slot.
    expect(band.style.opacity).toBe('0');
    expect(screen.getByTestId('bolt').style.opacity).toBe('0');
    expect(flashes.queue).toHaveLength(2);

    expect(runFlashes()).toBe(2);
    expect(band.style.opacity).toBe('1');
    const [drop, strike] = animations;
    expect(drop!.element).toBe(band);
    expect(drop!.options).toMatchObject({ duration: motion.bandDrop });
    expect(strike!.element).toBe(screen.getByTestId('bolt'));
    expect(strike!.options).toMatchObject({ duration: motion.strikeTotal });
    // Full volt for the hold, then it settles below full: never white, opacity/transform only.
    const frames = strike!.keyframes as Array<{ opacity: number; offset: number }>;
    const full = frames.filter((f) => f.opacity === 1);
    expect((full[full.length - 1]!.offset - full[0]!.offset) * motion.strikeTotal).toBeCloseTo(motion.strikeVoltHold);
    expect(frames[frames.length - 1]!.opacity).toBeLessThan(1);
    onlyTransformAndOpacity();

    // The first drop is measured, and the monitor stops when the drop ends.
    expect(monitor.calls).toBe(1);
    act(() => vi.advanceTimersByTime(motion.bandDrop));
    expect(monitor.stops).toBe(1);
  });

  it('wrong: the same band with no bolt and no volt; one flash (the drop)', () => {
    render(<RevealBand {...props({ correct: false, points: undefined, label: 'ശരിയുത്തരം', wrongLine: 'ശരി: പെരിയാർ. അടുത്തതിൽ നോക്കാം!' })} />);
    const band = screen.getByTestId('reveal-band');
    expect(band).toHaveTextContent('ശരി: പെരിയാർ. അടുത്തതിൽ നോക്കാം!');
    expect(band).toHaveTextContent('ആകെ 3,140');
    expect(screen.queryByTestId('bolt')).toBeNull();
    expect(screen.queryByTestId('band-points')).toBeNull();
    // Only the dark-mode edge names volt on a wrong band.
    expect(band.innerHTML).not.toMatch(/volt/);
    expect(runFlashes()).toBe(1);
    onlyTransformAndOpacity();
  });

  it('reduced: one 200 ms opacity fade through requestFlash, no drop, no strike, no jank monitor', () => {
    render(<RevealBand {...props({ reduced: true })} />);
    expect(flashes.queue).toHaveLength(1);
    runFlashes();
    expect(animations).toHaveLength(1);
    expect(animations[0]!.element).toBe(screen.getByTestId('reveal-band'));
    expect(animations[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animations[0]!.options).toMatchObject({ duration: motion.reducedFade });
    expect(screen.getByTestId('bolt').style.opacity).toBe('1');
    expect(monitor.calls).toBe(0);
  });

  it('unmounting cancels peaks that have not started', () => {
    const { unmount } = render(<RevealBand {...props()} />);
    unmount();
    expect(runFlashes()).toBe(0);
  });

  it('without Element.animate the settled state still applies', () => {
    delete (Element.prototype as { animate?: unknown }).animate;
    render(<RevealBand {...props()} />);
    runFlashes();
    expect(screen.getByTestId('reveal-band').style.transform).toBe('translateY(0)');
    expect(screen.getByTestId('bolt').style.opacity).toBe('0.6');
  });
});

describe('BoltStrike', () => {
  it('stays at or below 10% of the smallest supported viewport (320 × 480)', () => {
    expect(boltViewportFraction(320, 480)).toBeLessThanOrEqual(0.1);
    expect(boltViewportFraction(360, 640)).toBeLessThanOrEqual(0.1);
    expect(BOLT_WIDTH * BOLT_HEIGHT).toBe(5120);
  });

  it('renders at its declared size and paints only volt (currentColor)', () => {
    render(<RevealBand {...props({ reduced: true })} />);
    const bolt = screen.getByTestId('bolt');
    expect(bolt).toHaveAttribute('width', String(BOLT_WIDTH));
    expect(bolt).toHaveAttribute('height', String(BOLT_HEIGHT));
    expect(bolt).toHaveAttribute('aria-hidden', 'true');
    expect(bolt.querySelector('polygon')).toHaveAttribute('fill', 'currentColor');
  });
});

describe('animatePeak', () => {
  it('refuses anything but transform and opacity', () => {
    const el = document.createElement('div');
    expect(() => animatePeak(el, [{ opacity: 0 }, { width: '10px' } as never], { duration: 1 })).toThrow(/width/);
  });
});

describe('the correct option', () => {
  it('band fill with a dark volt edge, a volt ✓ tile with on-volt text, volt status', () => {
    expect(CORRECT_OPTION_CLASS).toContain('surface-band');
    expect(CORRECT_OPTION_CLASS).toContain('dark:border-volt');
    expect(CORRECT_STATUS_CLASS).toBe('text-volt');
    render(<CorrectTile />);
    const tile = screen.getByTestId('correct-tile');
    expect(tile).toHaveTextContent('✓');
    expect(tile.className).toContain('bg-volt');
    expect(tile.className).toContain('text-on-volt');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
  });
});
