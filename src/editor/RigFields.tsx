import { Disclosure } from '../studio/Controls';
import type { Rig } from 'mesh-avatar';
import { getAt } from './model';
import { NumericField } from './NumericField';
import { useI18n } from './i18n';
import { Button } from 'antd';

export function RigFields({ rig, path, scope = path, onChange }: {
  rig: Rig; path: string; scope?: string; onChange: (path: string, value: number) => void;
}) {
  const { t, title, language } = useI18n();
  const creaseLabel = language === 'zh' ? '闭眼褶皱透明度' : language === 'ja' ? '閉眼時のまぶたの折り目の不透明度' : 'Closed-eye crease opacity';
  const label = title(path === scope ? path.split('.').at(-1)! : path.slice(scope.length + 1));
  const value = getAt(rig, path);
  if (typeof value === 'number') return <NumericField path={path} label={path.endsWith('.creaseClosedOpacity') ? creaseLabel : label} value={value} onChange={number => onChange(path, number)} />;
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number') && !/band$/i.test(path)) {
    return <div className="point-field"><span>{label}</span><div className="point-inputs">
      {value.map((number, index) => <NumericField key={index} path={`${path}.${index}`} label={index === 0 ? t.x : t.y}
        value={number} onChange={next => onChange(`${path}.${index}`, next)} />)}
    </div><small>{path}</small></div>;
  }
  const children = Object.entries(value).map(([key]) => <RigFields key={key} rig={rig} path={`${path}.${key}`} scope={scope} onChange={onChange} />);
  if (Array.isArray(value)) return <Disclosure defaultOpen={path === 'eyes' || path === 'strands'} title={<>{label} ({value.length})</>}><div className="fields">{children}</div></Disclosure>;
  return <>{children}{/^eyes\.\d+$/.test(path) && <div className="eye-crease-setting">
    {!Object.hasOwn(value, 'creaseClosedOpacity') && <Button size="small" onClick={() => onChange(`${path}.creaseClosedOpacity`, 0.55)}>{language === 'zh' ? `调整${creaseLabel}` : language === 'ja' ? creaseLabel : `Adjust ${creaseLabel.toLowerCase()}`}</Button>}
    <small className="muted">{language === 'zh' ? '0：闭眼时隐藏褶皱；1：保留。未启用时沿用原效果。调整后检查睁眼、半闭眼和全闭眼；此参数不能修复底图残留。' : language === 'ja' ? '0：閉眼時に非表示、1：維持。変更後は開眼・半閉眼・閉眼を確認してください。' : '0 hides the crease at closure; 1 retains it. Unconfigured eyes keep the original behavior. Inspect open, half-closed and closed poses; this does not repair base-layer residue.'}</small>
  </div>}</>;
}
