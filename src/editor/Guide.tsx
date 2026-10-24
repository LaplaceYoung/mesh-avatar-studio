import { Button, Drawer, Steps } from 'antd';
import { useI18n } from './i18n';
export function GuideSteps() {
  const { t } = useI18n();
  return <Steps orientation="vertical" size="small" items={[t.guide1, t.guide2, t.guide3].map(title => ({ title }))} />;
}
export function FirstGuide({ onDismiss }: { onDismiss(): void }) {
  const { t } = useI18n();
  return <section className="first-guide" data-testid="first-guide" aria-label={t.guideTitle}><h3>{t.guideTitle}</h3><GuideSteps /><Button type="primary" onClick={onDismiss}>{t.gotIt}</Button></section>;
}
export function Help({ onClose, onGuide }: { onClose(): void; onGuide(): void }) {
  const { t } = useI18n();
  return <Drawer title={t.help} open onClose={onClose} size={400}><GuideSteps /><h3>{t.shortcuts}</h3><dl className="shortcut-list">{[[t.shortcutUndo, '⌘Z / ⇧⌘Z'], [t.shortcutSave, '⌘S'], [t.shortcutPan, t.spaceDrag], [t.shortcutZoom, `${t.wheel} · ⌘+/⌘−/⌘0/⌘1`], [t.shortcutVertex, t.vertexKeys]].map(([label, keys]) => <div key={label}><dt>{label}</dt><dd>{keys}</dd></div>)}</dl><Button onClick={onGuide}>{t.guideAgain}</Button></Drawer>;
}
