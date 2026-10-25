import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Space } from 'antd';
import { CodeOutlined, MinusOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import { useI18n } from '../editor/i18n';
import { readPreference, savePreference } from '../editor/preferences';

type WindowSettings = { expanded?: boolean; position?: { x: number; y: number }; size?: { width: number; height: number } };
const SETTINGS_KEY = 'studio-agent-window';
function readSettings(): WindowSettings {
  try {
    const value = JSON.parse(readPreference(SETTINGS_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return {};
    const position = value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y) ? { x: value.position.x, y: value.position.y } : undefined;
    const size = value.size && Number.isFinite(value.size.width) && Number.isFinite(value.size.height) && value.size.width > 0 && value.size.height > 0 ? { width: value.size.width, height: value.size.height } : undefined;
    return { expanded: value.expanded === true, position, size };
  } catch { return {}; }
}

export function AgentWindow({ open, onOpenChange, status, provider, children }: { open: boolean; onOpenChange(open: boolean): void; status?: string; provider?: string; children: ReactNode }) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const titleId = useId();
  const windowId = `${titleId}-window`;
  const [settings] = useState(readSettings);
  const [expanded, setExpanded] = useState(settings.expanded ?? false);
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>(settings.position);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(settings.size);
  const windowRef = useRef<HTMLElement>(null);
  const titlebarRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => {
    savePreference(SETTINGS_KEY, JSON.stringify({ expanded, position, size } satisfies WindowSettings));
  }, [expanded, position, size]);
  useEffect(() => {
    const element = windowRef.current;
    if (!element || expanded || !open) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      if (innerWidth <= 600 || rect.width <= 0 || rect.height <= 0) return;
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setSize(current => current?.width === next.width && current.height === next.height ? current : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, open]);
  useEffect(() => {
    const keepInViewport = () => {
      if (!position || expanded || !open || innerWidth <= 600) return;
      const rect = windowRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      const { width, height } = rect;
      const next = { x: Math.max(8, Math.min(Math.max(8, innerWidth - width - 8), position.x)), y: Math.max(8, Math.min(Math.max(8, innerHeight - height - 8), position.y)) };
      if (next.x !== position.x || next.y !== position.y) setPosition(next);
    };
    keepInViewport();
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [expanded, open, position, size]);
  useEffect(() => {
    if (open) {
      titlebarRef.current?.focus();
      return;
    }
    // Do not steal focus from a project/help drawer that closed this window.
    if (windowRef.current?.contains(document.activeElement)) launcherRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (!(event.target instanceof Node) || !windowRef.current?.contains(event.target)) return;
      event.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onOpenChange, open]);
  const desktopLayout = typeof window === 'undefined' || window.innerWidth > 600;
  const style = !expanded && desktopLayout ? { ...(position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : {}), ...(size ? { width: size.width, height: size.height } : {}) } : undefined;
  const statusLabels: Record<string, [string, string]> = {
    awaiting_permission: ['等待工具授权', 'Awaiting permission'],
    idle: ['未连接', 'Idle'], starting: ['正在连接', 'Connecting'], ready: ['已就绪', 'Ready'], working: ['执行中', 'Working'], disconnected: ['连接断开，待重连', 'Disconnected; reconnect'],
    configuring: ['更新配置', 'Configuring'], exited: ['已结束', 'Ended'],
  };
  const statusLabel = status ? statusLabels[status]?.[zh ? 0 : 1] ?? status : '';
  const providerLabel = provider === 'codex' ? 'Codex' : provider === 'pi' ? 'Pi' : 'Claude';
  const active = status === 'starting' || status === 'working' || status === 'configuring' || status === 'awaiting_permission';
  return <>
    {!open && <Button ref={launcherRef} className={`agent-launcher${active ? ' agent-launcher-active' : ''}`} type="primary" icon={<CodeOutlined />} onClick={() => onOpenChange(true)} aria-expanded={open} aria-controls={windowId} aria-label={zh ? `展开 Agent 对话${statusLabel ? `，${statusLabel}` : ''}` : `Open agent conversation${statusLabel ? `, ${statusLabel}` : ''}`}>
      Agent · {providerLabel}{statusLabel && <span className="agent-launcher-status">{statusLabel}</span>}
    </Button>}
    <section id={windowId} ref={windowRef} className={`agent-window${expanded ? ' agent-window-expanded' : ''}`} hidden={!open}
      role="dialog" aria-modal="false" aria-labelledby={titleId} aria-label={zh ? 'Agent 对话窗口' : 'Agent conversation window'}
      style={style}>
      <header ref={titlebarRef} tabIndex={-1} className="agent-window-titlebar"
        onPointerDown={event => {
          if (expanded || innerWidth <= 600 || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
          const rect = windowRef.current!.getBoundingClientRect();
          drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          const rect = windowRef.current!.getBoundingClientRect();
          setPosition({ x: Math.max(8, Math.min(innerWidth - rect.width - 8, drag.current.left + event.clientX - drag.current.x)),
            y: Math.max(8, Math.min(innerHeight - rect.height - 8, drag.current.top + event.clientY - drag.current.y)) });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <Space><CodeOutlined /><strong id={titleId}>{zh ? '创作助手' : 'Creative assistant'}</strong><span className="agent-window-provider">{providerLabel}</span>{statusLabel && <span className={`agent-window-status agent-window-status-${status}`} role="status">{statusLabel}</span>}</Space>
        <Space size={2}>
          <Button type="text" size="small" icon={expanded ? <CompressOutlined /> : <ExpandOutlined />} aria-label={zh ? '切换窗口大小' : 'Toggle window size'} onClick={() => setExpanded(value => !value)} />
          <Button type="text" size="small" icon={<MinusOutlined />} aria-label={zh ? '收起 Agent 对话' : 'Minimize agent conversation'} onClick={() => onOpenChange(false)} />
        </Space>
      </header>
      <div className="agent-window-body">{children}</div>
    </section>
  </>;
}
