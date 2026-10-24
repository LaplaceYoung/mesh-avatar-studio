import { useRef, useState } from 'react';
import { useI18n } from './i18n';
import { archiveText } from './archive-i18n';
import { Icon } from './Icon';
import { Button, CheckInput } from '../studio/Controls';
import { type MenuHandle, Menu } from './Menu';

export function ExportAvatar({ busy, available, writable, dirty, stale, onExport }: {
  busy: boolean; available: boolean; writable: boolean; dirty: boolean; stale: boolean;
  onExport: (includeSource: boolean) => Promise<void>;
}) {
  const { language } = useI18n(), text = archiveText[language];
  const [includeSource, setIncludeSource] = useState(true);
  const detailsRef = useRef<MenuHandle>(null);
  return <Menu className="archive-menu" data-testid="export-menu"
    summary={<>{text.exportTitle}<Icon name="chevron" /></>}
    disabled={busy}
    detailsRef={el => { detailsRef.current = el; }}>
    <div className="archive-options">
      <p>{text.savedHelp}</p>
      <label><CheckInput checked={includeSource} disabled={busy} onChange={event => setIncludeSource(event.target.checked)} />{text.includeSource}</label>
      <p>{text.sourceHelp}</p><small>{text.noSourceHelp}</small>
      {(dirty || (writable && stale)) && <p>{writable ? stale ? text.rebuildHelp : text.saveHelp : text.originalHelp}</p>}
      {!available && <p>{text.exportUnavailable}</p>}
      <Button type="primary" disabled={busy || !available || (writable && stale)} onClick={() => { void onExport(includeSource).finally(() => { if (detailsRef.current) detailsRef.current.open = false; }).catch(() => undefined); }}>{busy ? text.busy : writable && dirty ? text.saveExport : text.exportButton}</Button>
    </div>
  </Menu>;
}

export function ImportAvatar({ busy, available, onImport }: { busy: boolean; available: boolean; onImport: (file: File) => void }) {
  const { language } = useI18n(), text = archiveText[language];
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div className={`archive-import${dragging ? ' dragging' : ''}`} data-testid="archive-import"
    onDragOver={event => { event.preventDefault(); event.stopPropagation(); if (!busy && available) setDragging(true); }}
    onDragLeave={() => setDragging(false)} onDrop={event => {
      event.preventDefault(); event.stopPropagation(); setDragging(false);
      const file = event.dataTransfer.files[0]; if (file && !busy && available) onImport(file);
    }}>
    <input ref={input} type="file" accept=".mavatar" hidden aria-label={text.archiveFile} onChange={event => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
    <Button disabled={busy || !available} onClick={() => input.current?.click()}>{busy ? text.busy : text.importTitle}</Button>
    <p>{available ? text.importHelp : text.importUnavailable}</p>
  </div>;
}
