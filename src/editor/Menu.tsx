import { useEffect, useRef, type ReactNode } from 'react';

// One open toolbar menu at a time. Menus built from <details><summary> are kept
// for the disclosure styling, but the registry makes A close when B opens, adds
// light dismiss and restores focus to the summary when the menu closes — the
// behaviour keyboard and pointer users expect from menus per the ARIA APG
// Menu Button pattern and Material 3 menu behavior.
const openMenus = new Set<HTMLDetailsElement>();

function closeOthers(active: HTMLDetailsElement) {
  for (const menu of openMenus) if (menu !== active) menu.open = false;
}

function closeOnOutside(event: PointerEvent) {
  const target = event.target as Node | null;
  for (const menu of openMenus) if (target && !menu.contains(target)) menu.open = false;
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  for (const menu of openMenus) {
    if (!menu.open) continue;
    menu.open = false;
    // APG: focus returns to the trigger that opened the menu.
    const trigger = menu.querySelector('summary');
    if (trigger instanceof HTMLElement) trigger.focus();
  }
  if (openMenus.size) event.stopPropagation();
}

let listenersAttached = 0;
function attachListeners() {
  if (!listenersAttached) {
    document.addEventListener('pointerdown', closeOnOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);
  }
  listenersAttached++;
}
function detachListeners() {
  if (!--listenersAttached) {
    document.removeEventListener('pointerdown', closeOnOutside, true);
    document.removeEventListener('keydown', closeOnEscape, true);
  }
}

export type MenuProps = {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onOpen?: () => void;
  'data-testid'?: string;
  detailsRef?: (el: HTMLDetailsElement | null) => void;
};

export function Menu({ summary, children, className, disabled, onOpen, detailsRef, ...rest }: MenuProps) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => () => { const el = details.current; if (el && openMenus.delete(el)) detachListeners(); }, []);
  return <details
    ref={el => { details.current = el; detailsRef?.(el); }}
    className={className} data-testid={rest['data-testid']}
    onToggle={event => {
      const el = event.currentTarget;
      if (el.open) {
        openMenus.add(el);
        attachListeners();
        closeOthers(el);
        onOpen?.();
      } else if (openMenus.delete(el)) {
        detachListeners();
      }
    }}>
    <summary aria-haspopup="menu" aria-disabled={disabled}>{summary}</summary>
    {children}
  </details>;
}
