import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate, splitPath, withBase } from './router.ts';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** App path, without the base (e.g. '/rooms'). */
  to: string;
  replace?: boolean;
};

/** True for a plain left click the router should handle (no modifier keys, no other target, no download). */
export function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.getAttribute('target');
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!target || target === '_self') &&
    !event.currentTarget.hasAttribute('download')
  );
}

/**
 * A real `<a href>` (open in new tab, copy link and middle-click all work); plain left clicks
 * navigate in-app without a reload.
 */
export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    navigate(to, { replace });
  };
  const { path, suffix } = splitPath(to);
  return <a {...rest} href={`${withBase(path)}${suffix}`} onClick={handleClick} />;
}
