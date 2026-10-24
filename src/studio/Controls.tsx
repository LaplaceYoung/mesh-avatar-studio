import { Children, isValidElement, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type ChangeEvent, type ReactNode } from 'react';
import { Button, ColorPicker, Checkbox, Collapse, Input, Select, Slider } from 'antd';
export { Button };

// Preserve the controller event contracts while migrating rendering to Ant Design.
export function RangeInput({ value, min, max, step, onChange, onPointerUp, onKeyUp, onBlur, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const commit = () => { const event = {} as never; onPointerUp?.(event); onKeyUp?.(event); onBlur?.(event); };
  return <Slider className={props.className} disabled={props.disabled} ariaLabelForHandle={props['aria-label']} min={Number(min ?? 0)} max={Number(max ?? 100)} step={Number(step ?? 1)} value={Number(value ?? 0)}
    onChange={number => onChange?.({ target: { value: String(number), valueAsNumber: number } } as ChangeEvent<HTMLInputElement>)} onChangeComplete={commit} />;
}
export function CheckInput({ checked, onChange, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <Checkbox checked={checked} disabled={props.disabled} aria-label={props['aria-label']} onChange={e => onChange?.({ target: { checked: e.target.checked, value: e.target.value } } as ChangeEvent<HTMLInputElement>)} />;
}
export function SelectInput({ value, onChange, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(children).flatMap(child => isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child) && child.type === 'option' ? [{ value: child.props.value ?? '', label: child.props.children, disabled: child.props.disabled }] : []);
  return <Select virtual={false} value={value as string} options={options} disabled={props.disabled} aria-label={props['aria-label']} className={props.className} style={props.style} data-testid={(props as Record<string, unknown>)['data-testid']}
    onChange={next => onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>)} />;
}
export function Disclosure({ title, children, defaultOpen = false, onToggle, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; onToggle?(open: boolean): void; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return <Collapse className={className} ghost activeKey={open ? ['content'] : []} onChange={keys => { const next = keys.length > 0; setOpen(next); onToggle?.(next); }} items={[{ key: 'content', label: title, children }]} />;
}
export const TextInput = Input;

export function ColorInput({ value, onChange, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <ColorPicker value={String(value)} disabled={props.disabled} aria-label={props['aria-label']} onChange={color => onChange?.({ target: { value: color.toHexString() } } as ChangeEvent<HTMLInputElement>)} />;
}
