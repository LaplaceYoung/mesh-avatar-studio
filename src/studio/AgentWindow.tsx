import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Space } from 'antd';
import { CodeOutlined, MinusOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import { useI18n } from '../editor/i18n';

export function AgentWindow({ open, onOpenChange, children }: { open: boolean; onOpenChange(open: boolean): void; children: ReactNode }) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>();
  const windowRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => {
    const reset = () => setPosition(undefined);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  return <>
    {!open && <Button className="agent-launcher" type="primary" icon={<CodeOutlined />} onClick={() => onOpenChange(true)} aria-label={zh ? '展开 Agent 对话' : 'Open agent conversation'}>Agent</Button>}
    <section ref={windowRef} className={`agent-window${expanded ? ' agent-window-expanded' : ''}`} hidden={!open}
      aria-label={zh ? 'Agent 对话窗口' : 'Agent conversation window'}
      style={!expanded && position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}>
      <header className="agent-window-titlebar"
        onPointerDown={event => {
          if (expanded || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
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
        <Space><CodeOutlined /><strong>{zh ? '创作助手' : 'Creative assistant'}</strong></Space>
        <Space size={2}>
          <Button type="text" size="small" icon={expanded ? <CompressOutlined /> : <ExpandOutlined />} aria-label={zh ? '切换窗口大小' : 'Toggle window size'} onClick={() => setExpanded(value => !value)} />
          <Button type="text" size="small" icon={<MinusOutlined />} aria-label={zh ? '收起 Agent 对话' : 'Minimize agent conversation'} onClick={() => onOpenChange(false)} />
        </Space>
      </header>
      <div className="agent-window-body">{children}</div>
    </section>
  </>;
}
