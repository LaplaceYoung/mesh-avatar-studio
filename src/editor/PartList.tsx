import { useState } from 'react';
import { Button, Empty, Input, Tree } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, SearchOutlined } from '@ant-design/icons';
import type { Rig } from 'mesh-avatar';
import { useI18n } from './i18n';
import { PART_COLORS, partPresent, SECTIONS } from './parts';
export function PartList({ rig, visible, selected, onSelect, onFocus, onVisible }: {
  rig: Rig; visible: string[]; selected: string | null; onSelect(group: string): void; onFocus(group: string): void; onVisible(groups: string[]): void;
}) {
  const { t, parts } = useI18n();
  const [query, setQuery] = useState('');
  const data = SECTIONS.map(section => ({ key: `section:${section.key}`, title: t[section.key], selectable: false,
    children: section.groups.filter(group => `${parts[group][0]} ${group}`.toLowerCase().includes(query.toLowerCase())).map(group => {
      const present = partPresent(rig, group), shown = visible.includes(group);
      return { key: group, disabled: !present, title: <div className="part-tree-row" data-part={group} data-visible={shown}>
        <Button type="text" className="part-tree-label" data-testid={`part-${group}`} disabled={!present} onClick={() => onSelect(group)} onDoubleClick={() => onFocus(group)} title={present ? parts[group][1] : t.notPresent}>
          <span className="part-swatch" style={{ background: PART_COLORS[group] }} />{parts[group][0]}</Button>
        <Button size="small" type="text" icon={shown ? <EyeOutlined /> : <EyeInvisibleOutlined />} disabled={!present} data-testid={`visibility-${group}`} aria-label={`${shown ? t.hide : t.show} · ${parts[group][0]}`} aria-pressed={shown}
          onClick={e => { e.stopPropagation(); onVisible(shown ? visible.filter(g => g !== group) : [...visible, group]); }} />
      </div> };
    }),
  })).filter(section => section.children.length);
  return <aside className="parts-panel" aria-label={t.parts}>
    <div className="panel-heading"><strong>{t.parts}</strong><Button size="small" type="text" onClick={() => onVisible(visible.length ? [] : SECTIONS.flatMap(s => s.groups).filter(g => partPresent(rig, g)))}>{visible.length ? t.hideAll : t.showAll}</Button></div>
    <Input aria-label={t.parts} prefix={<SearchOutlined />} placeholder={t.parts} value={query} onChange={e => setQuery(e.target.value)} allowClear />
    {data.length ? <Tree blockNode defaultExpandAll selectedKeys={selected ? [selected.split('.')[0]] : []} treeData={data} onSelect={keys => { if (keys[0]) onSelect(String(keys[0])); }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
  </aside>;
}
