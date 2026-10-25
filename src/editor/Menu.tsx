import { createContext, useContext, useId, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Button, Popover } from 'antd';
const MenuContext = createContext<{ active: string | null; setActive(value: string | null): void } | null>(null);
export function MenuScope({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  return <MenuContext.Provider value={{ active, setActive }}>{children}</MenuContext.Provider>;
}
export type MenuHandle = { open: boolean };
export function Menu({ summary, children, className, disabled, onOpen, detailsRef, ...props }: {
  summary: ReactNode; children: ReactNode; className?: string; disabled?: boolean; onOpen?(): void; detailsRef?: Ref<MenuHandle>; 'data-testid'?: string;
}) {
  const id = useId(), scope = useContext(MenuContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = scope ? scope.active === id : localOpen;
  const setOpen = (next: boolean) => { if (scope) { if (next) scope.setActive(id); else if (scope.active === id) scope.setActive(null); } else setLocalOpen(next); };
  useImperativeHandle(detailsRef, () => ({ get open() { return open; }, set open(value: boolean) { setOpen(value); } }));
  return <Popover trigger="click" open={!disabled && open} onOpenChange={next => { setOpen(next); if (next) onOpen?.(); }} placement="bottomRight" content={<div className="studio-popover" onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); setOpen(false); document.getElementById(id)?.focus(); } }}>{children}</div>}>
    <Button id={id} disabled={disabled} className={className} data-testid={props['data-testid']} aria-expanded={!disabled && open} onKeyDown={e => { if (e.key === 'Escape' && open && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}>{summary}</Button>
  </Popover>;
}
