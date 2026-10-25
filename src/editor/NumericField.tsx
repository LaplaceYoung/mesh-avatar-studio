import { InputNumber } from 'antd';
import { editorNumber, isIntegerField } from '../../packages/runtime/src/rig/numeric';
export function NumericField({ path, value, label, onChange }: { path: string; label?: string; value: number; onChange(value: number): void }) {
  return <label className="numeric-field" title={path}><span>{label}</span>
    <InputNumber aria-label={path} value={value} min={path.endsWith('.creaseClosedOpacity') ? 0 : undefined} max={path.endsWith('.creaseClosedOpacity') ? 1 : undefined} step={isIntegerField(path) ? 1 : 0.1} onChange={number => { if (number !== null && Number.isFinite(number)) onChange(editorNumber(path, number)); }} />
    <small className="field-path">{path}</small></label>;
}
