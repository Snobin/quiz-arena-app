/**
 * Runs a Web Animations API animation of transform and/or opacity only (DESIGN.md › Do's and
 * Don'ts). Where `Element.animate` is missing, the final keyframe is applied at once, so the
 * element still ends up in its settled state.
 */
export type PeakKeyframe = { transform?: string; opacity?: number; offset?: number };

export const ANIMATED_PROPERTIES = ['transform', 'opacity'] as const;

export function animatePeak(element: HTMLElement | SVGElement, keyframes: PeakKeyframe[], options: KeyframeAnimationOptions): void {
  for (const frame of keyframes) {
    for (const key of Object.keys(frame)) {
      if (key !== 'offset' && !(ANIMATED_PROPERTIES as readonly string[]).includes(key)) {
        throw new Error(`peak animations may only animate transform and opacity, not ${key}`);
      }
    }
  }
  const last = keyframes[keyframes.length - 1] ?? {};
  // The settled state, also what stays after the animation (no fill needed).
  if (last.transform !== undefined) element.style.transform = last.transform;
  if (last.opacity !== undefined) element.style.opacity = String(last.opacity);
  if (typeof element.animate === 'function') element.animate(keyframes as Keyframe[], options);
}
