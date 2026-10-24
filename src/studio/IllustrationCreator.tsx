import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Image, Input, Space, Steps, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useI18n } from '../editor/i18n';

type Uploaded = { source: string; projectName: string; width: number; height: number; transparent: boolean; backgroundProcessed?: boolean; warning?: string };
export function IllustrationCreator() {
  const { language } = useI18n(), zh = language === 'zh';
  const [upload, setUpload] = useState<Uploaded>();
  const [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(''), [consent, setConsent] = useState(false);
  const [subject, setSubject] = useState('');
  const [removeBackground, setRemoveBackground] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const validName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name);
  const receive = async (file: File) => {
    setBusy(true); setError(''); setUpload(undefined); setConsent(false);
    try {
      const response = await fetch('/__studio/illustrations', { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Studio-Request': '1' }, body: file });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setUpload(data); setName(data.projectName); setPreview(URL.createObjectURL(file));
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setError(''); setUpload(undefined); setConsent(false);
    try {
      const response = await fetch('/__studio/mosi-image', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify({ subject, removeBackground, projectName: name || undefined }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setUpload(data); setName(data.projectName); setPreview(`/__studio/illustrations/${data.id}`);
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const prepare = async () => {
    if (!upload || !consent || !validName) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/__studio/production-status?project=${encodeURIComponent(name)}`);
      const existing = await response.json();
      if (!response.ok) throw new Error(existing.error);
      if (existing.projectExists) throw new Error(zh ? '此项目目录已存在，请使用新名称，避免覆盖或跟踪错误项目。' : 'Project directory already exists. Choose a new name.');
    } catch (reason) { setError(String(reason)); setBusy(false); return; }
    setBusy(false);
    const prompt = `请把本地插画 ${upload.source} 制作为可在本项目编辑器和直播页运行的 2D 网格角色，目标目录 projects/${name}。\n用户已明确同意：所选 Agent 可以读取这张图片，并将其交给该 Agent 已配置的视觉模型处理；未授权调用其他生图、抠图或外部服务。\n\n请先阅读 AGENTS.md 和 docs/agent-guide.md，并按以下真实流程执行：\n1. 检查依赖和视觉模型能力；执行视觉坐标校准，报告实际分数，失败时停止，不得估计或虚构分数。\n2. 使用 tools/new-project.py 创建新项目；目标若已存在，停止并报告，不得覆盖或擅自改名；制作进度跟踪此精确目录。原图 ${upload.width}×${upload.height}，${upload.transparent ? '包含透明像素' : '没有透明像素，先评估背景对分层的影响，不要声称已抠图'}。\n3. 全图网格只用于粗定位。对左右眼、嘴、下巴、发际、发束、肩部和饰品分别生成放大局部网格；所有坐标使用原图坐标。将观察到的区域写入项目内 regions.json，格式为 [{"name":"eye_left","box":[x0,y0,x1,y1],"step":5,"observation":"实际观察依据","confidence":"low|medium|high"}]；运行 uv run tools/vision-regions.py projects/${name} --regions projects/${name}/regions.json 生成局部证据包，逐张查看 detail/grid/overview。依据 manifest.json 的反向变换把放大坐标转换回原图坐标，不得混用。记录每个区域的观察依据和不确定性；眼部使用 5 px 网格；不允许套用示例的坐标或仅凭整图估算。\n4. 完成 rig.draft.json，运行 validate-rig、全图叠加和眼部放大叠加，亲自查看并修正后构建图层。检查头发蒙版不含面部/服装、眼球层只含眼白和虹膜。\n5. render-poses 逐帧查看闭眼、转头、低头、张嘴和头发摆动。发现裂缝或残留先修改对应区域，再构建并复审，最多三轮，未通过必须明确指出。\n6. 绘制差分如需调用外部生图服务，先报告用途和待发送文件，等待用户单独同意；不要因这一步未授权而删除已经可用的基础绑定。\n7. 最终列出实际项目路径、已完成步骤、审查图片路径、尚存问题。仅构建成功不等于视觉质量通过。不要修改 samples/、reference/ 或提交用户图片。\n\n这是网格虚拟形象流程，不要声称生成了 Live2D Cubism 模型文件。`;
    window.dispatchEvent(new CustomEvent('studio:agent-start', { detail: { prompt, projectName: name, source: upload.source } }));
  };
  return <section className="illustration-creator" onDragOver={event => event.stopPropagation()} onDrop={event => event.stopPropagation()}>
    <h3>{zh ? '上传插画，让 Agent 制作角色' : 'Create an avatar from your illustration'}</h3>
    <Alert type="info" title={zh ? '生图功能需要本机环境变量 MOSS_API_KEY；key 不会发送到浏览器。' : 'Image generation requires local MOSS_API_KEY; the key never reaches the browser.'} />
    <p className="muted">{zh ? '先保存到本机，再由你选择的 Agent 执行识别、绑定、分层和动作审查。' : 'Save locally, then use your chosen agent to inspect, rig, build layers and review motion.'}</p>
    <label className="creation-name">{zh ? '角色描述（可选）' : 'Character brief (optional)'}<Input.TextArea rows={3} value={subject} onChange={event => setSubject(event.target.value)} placeholder={zh ? '例如：黑色旗袍、双丸子头、红色发带、温和表情' : 'e.g. black qipao, twin buns, red ribbons, gentle expression'} /></label>
    <Checkbox checked={removeBackground} disabled={busy} onChange={event => setRemoveBackground(event.target.checked)}>{zh ? '尝试去除连通白背景（保留原图；白发、白衣可能误伤，需检查）' : 'Try removing connected white background (original preserved; inspect light hair/clothing)'}</Checkbox>
    <Button icon={<InboxOutlined />} loading={busy} onClick={() => { void generate(); }}>{zh ? '用 Mosi 生成 Live 2D 友好底图' : 'Generate Live 2D-ready base image with Mosi'}</Button>
    <Upload.Dragger accept="image/png,.png" multiple={false} showUploadList={false} disabled={busy} beforeUpload={file => { if (file.size > 24 * 1024 * 1024) { setError(zh ? '图片不能超过 24 MiB。' : 'Maximum file size: 24 MiB.'); return false; } void receive(file); return false; }}>
      <InboxOutlined style={{ fontSize: 32 }} /><p>{busy ? zh ? '正在保存到本机…' : 'Saving locally…' : zh ? '点击或拖入 PNG 插画' : 'Click or drop a PNG illustration'}</p><small>PNG · ≤ 24 MiB · ≤ 16 MP</small>
    </Upload.Dragger>
    {error && <Alert type="error" title={error} />}
    {upload && <>
      {upload.warning && <Alert type="warning" title={zh ? '已尝试去背景，请检查轮廓、白发和衣服边缘。未处理原图已保留为 original.png。' : upload.warning} />}
      <div className="illustration-summary"><Image src={preview} width={100} alt={zh ? '已上传的原图' : 'Uploaded illustration'} /><div><strong>{upload.width} × {upload.height}</strong><p className="muted">{zh ? '图片已保存，仅在本机。' : 'Image saved locally.'}</p></div></div>
      {!upload.transparent && <Alert type="warning" title={zh ? '原图没有透明像素，背景可能影响分层质量。' : 'Opaque background may reduce layer quality.'} />}
      {upload.height < 800 && <Alert type="warning" title={zh ? '图片低于 800 px 高，眼部轮廓识别可能不够精细。' : 'Below 800 px tall: eye contour detail may be insufficient.'} />}
      <label className="creation-name">{zh ? '项目目录名' : 'Project directory name'}<Input value={name} onChange={event => setName(event.target.value)} status={validName ? undefined : 'error'} /></label>
      <small className="muted">{zh ? '使用英文字母、数字、横线或下划线；不覆盖已有项目。' : 'Use letters, numbers, hyphens or underscores. Existing projects are not overwritten.'}</small>
      <Checkbox checked={consent} onChange={event => setConsent(event.target.checked)}>{zh ? '同意所选 Agent 读取图片并交给其已配置的视觉模型处理（可能是云端）；不包含外部生图授权。' : 'Allow the selected agent to process this image with its configured vision model (possibly cloud-hosted). This does not authorize external image generation.'}</Checkbox>
      <Button type="primary" loading={busy} disabled={!consent || !validName || busy} onClick={() => { void prepare(); }}>{zh ? '开始 AI 制作' : 'Start AI creation'}</Button>
    </>}
    <Steps size="small" orientation="vertical" current={-1} items={(zh ? ['区域识别与坐标校准', '绑定、蒙版与图层构建', '动作审查与缺陷修正', '打开编辑器 / 直播'] : ['Inspect and calibrate', 'Rig and build layers', 'Review and correct motion', 'Open in editor / Live']).map(title => ({ title }))} />
    <Space><small className="muted">{zh ? '流程说明，不代表制作已完成；真实进度以 Agent 工具结果为准。' : 'Workflow outline only. Completion requires actual agent/tool results.'}</small></Space>
  </section>;
}
