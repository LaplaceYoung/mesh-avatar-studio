import { Input, Segmented, Tabs } from 'antd';
import { ThemeToggle } from '../studio/Theme';
import { ColorInput, Button, RangeInput, CheckInput, SelectInput } from '../studio/Controls';
import { LightingControls, LightHandle, lightingText } from '../lighting/Controls';
import { colorHex, LIVE_EXPRESSIONS, type LiveExpression, type MeshAvatar } from 'mesh-avatar';
import { loadLighting, saveLighting } from '../lighting/storage';
import { loadLightingPresets, sameLighting, saveLightingPresets } from '../lighting/presets';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../editor/i18n';
import { createAvatarView } from './avatar-view';
import { viewSettings, streamUrl, backgroundColor } from './settings';
import { FacePose, type TrackingOptions } from './tracking';
import { CameraCapture, MicrophoneCapture, type CameraState, type MicState, type BackgroundTracking } from './media';
import { liveText } from './i18n';
import { createLiveSender, receiveExpression, receiveLightingPreset, sendLighting, watchDuplicateLivePages } from './relay';
import { EXPRESSION_TOKEN_PATH, LIGHTING_PRESET_PATH } from './expression-protocol';

export function LiveApp() {
  const { language, setLanguage } = useI18n(), t = liveText[language];
  const [settings, setSettings] = useState(() => { const view = viewSettings(location.search); return { ...view, lighting: view.lighting ?? loadLighting(view.project) }; });
  const [activeTab, setActiveTab] = useState('capture');
  const [lightingOpen, setLightingOpen] = useState(false);
  const [presets, setPresets] = useState(() => loadLightingPresets(settings.project));
  const presetsRef = useRef(presets); presetsRef.current = presets;
  const [duplicatePage, setDuplicatePage] = useState(false);
  const [expression, setExpression] = useState<LiveExpression>('neutral');
  const expressionRef = useRef(expression); expressionRef.current = expression;
  const [remote, setRemote] = useState<{ url: string; token: string } | null>(null), [remoteCopied, setRemoteCopied] = useState<'url' | 'token' | null>(null);
  const [options, setOptions] = useState<TrackingOptions>({ mirror: true, sensitivity: 1, smoothing: 0.35 });
  const [cameraState, setCameraState] = useState<CameraState>('stopped');
  const [micState, setMicState] = useState<MicState>('micOff');
  const [tracking, setTracking] = useState(false), [showCamera, setShowCamera] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [cameraId, setCameraId] = useState(''), [micId, setMicId] = useState('');
  const [gain, setGain] = useState(1), [calibrated, setCalibrated] = useState(false);
  const [copyState, setCopyState] = useState<'copied' | 'copyError' | null>(null);
  const [viewState, setViewState] = useState<'loading' | 'ready' | 'projectError'>('loading');
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundTracking>(null);
  const canvas = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null);
  const camera = useRef<CameraCapture | null>(null), microphone = useRef<MicrophoneCapture | null>(null);
  const avatarRef = useRef<MeshAvatar | null>(null);
  const lightRef = useRef(settings.lighting); lightRef.current = settings.lighting;
  const pose = useRef(new FacePose());
  const controls = useRef({ options, gain, micState, cameraState }); controls.current = { options, gain, micState, cameraState };
  const refreshDevices = () => { void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => undefined); };
  useEffect(() => {
    const capture = new CameraCapture(video.current!, (result, now) => pose.current.update(result, now), state => { setCameraState(state); if (state !== 'running') setTracking(false); });
    const mic = new MicrophoneCapture(setMicState);
    camera.current = capture; microphone.current = mic;
    refreshDevices(); navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    const stop = () => { capture.stop(); mic.stop(); pose.current.reset(); };
    window.addEventListener('pagehide', stop);
    return () => { stop(); navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices); window.removeEventListener('pagehide', stop); };
  }, []);
  useEffect(() => {
    let cancelled = false, view: Awaited<ReturnType<typeof createAvatarView>> | undefined;
    const clock = new Worker(new URL('./clock-worker.ts', import.meta.url), { type: 'module' });
    clock.onmessage = () => {
      const now = performance.now();
      view?.updateIfStalled(now);
      setBackgroundStatus(camera.current?.backgroundStatus(document.visibilityState === 'hidden' || !!view?.paintPaused(now), now) ?? null);
    };
    const send = createLiveSender(settings.project);
    setViewState('loading');
    void createAvatarView(canvas.current!, settings, (avatar, now, dt) => {
      const control = controls.current, sampled = pose.current.sample(now, dt, control.options);
      setTracking(sampled.tracking);
      avatar.setAutoIdle(!sampled.tracking); avatar.setAutoMotion(!sampled.tracking);
      avatar.setParameters(sampled.params, sampled.weight);
      const micOn = control.micState === 'micOn';
      avatar.setSpeaking(micOn); avatar.setVoiceLevel(micOn ? microphone.current?.level(control.gain) ?? 0 : 0);
    }, (avatar, now) => {
      // An expression alone also drives the stream view, including its fade back to neutral.
      if (controls.current.cameraState === 'running' || controls.current.micState === 'micOn' || avatar.getExpression().active) send(avatar.getParameters(), now);
    }).then(value => { if (cancelled) value.destroy(); else { view = value; avatarRef.current = value.avatar; value.avatar.setLighting(lightRef.current); value.avatar.setExpression(expressionRef.current); setViewState('ready'); } }).catch(() => { if (!cancelled) setViewState('projectError'); });
    return () => { cancelled = true; clock.terminate(); view?.destroy(); avatarRef.current = null; };
  }, [settings.project, settings.fit]);
  useEffect(() => {
    saveLighting(settings.project, settings.lighting);
    avatarRef.current?.setLighting(settings.lighting);
  }, [settings.project, settings.lighting]);
  useEffect(() => {
    let sent: typeof settings.lighting | undefined;
    // Throttle continuous drags and deliver the final position even after dragging stops.
    const timer = setInterval(() => {
      if (sent === lightRef.current) return;
      sent = lightRef.current; sendLighting(settings.project, sent);
    }, 34);
    return () => clearInterval(timer);
  }, [settings.project]);
  const changeLighting = (lighting: typeof settings.lighting) => setSettings(current => ({ ...current, lighting }));
  useEffect(() => { avatarRef.current?.setExpression(expression); }, [expression]);
  useEffect(() => watchDuplicateLivePages(settings.project, setDuplicatePage), [settings.project]);
  useEffect(() => receiveExpression(settings.project, setExpression), [settings.project]);
  // Empty slots are ignored, so a shortcut for an unsaved preset changes nothing.
  const applyPreset = (preset: number) => { const value = presetsRef.current[preset - 1]; if (value) changeLighting({ ...value }); };
  const savePreset = (index: number) => {
    const next = presets.map((value, i) => i === index ? { ...settings.lighting } : value);
    setPresets(next); saveLightingPresets(settings.project, next);
  };
  const applyPresetRef = useRef(applyPreset); applyPresetRef.current = applyPreset;
  useEffect(() => receiveLightingPreset(settings.project, preset => applyPresetRef.current(preset)), [settings.project]);
  const loadRemote = (method: 'GET' | 'POST') => fetch(EXPRESSION_TOKEN_PATH, { method, headers: { 'x-studio-request': '1' } })
    .then(response => response.ok ? response.json() : null)
    .then((data: { token?: unknown; path?: unknown } | null) => setRemote(typeof data?.token === 'string' && typeof data.path === 'string' ? { url: `${location.origin}${data.path}`, token: data.token } : null))
    .catch(() => setRemote(null));
  useEffect(() => { void loadRemote('GET'); }, []);
  const copyRemote = (kind: 'url' | 'token', value: string) => { void navigator.clipboard.writeText(value).then(() => { setRemoteCopied(kind); setTimeout(() => setRemoteCopied(null), 1500); }).catch(() => undefined); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || target?.closest('input, select, textarea, [contenteditable="true"]')) return;
      // Shift with a digit applies a lighting preset. The physical key is used because Shift
      // changes the typed character (Shift+1 is "!" on common layouts).
      if (event.shiftKey) {
        const preset = /^Digit([1-8])$/.exec(event.code);
        if (preset) { event.preventDefault(); applyPresetRef.current(Number(preset[1])); }
        return;
      }
      const name = LIVE_EXPRESSIONS[Number(event.key) - 1];
      if (!/^[1-8]$/.test(event.key) || !name) return;
      event.preventDefault(); setExpression(name);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const cameraActive = cameraState === 'starting' || cameraState === 'running';
  const micActive = micState === 'micStarting' || micState === 'micOn';
  const url = streamUrl(settings, location.origin);
  const status = cameraState === 'running' ? tracking ? 'tracking' : 'lost' : cameraState;
  return <main className="live-app">
    <header className="studio-header"><div className="studio-brand"><span className="brand-mark">M</span><div><h1>MESH <span>LIVE</span></h1><small>{settings.project}</small></div></div><div className="studio-project-name" /><nav className="studio-actions"><Button href="/">{t.back}</Button><Segmented aria-label="Language" value={language} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'EN' }, { value: 'ja', label: 'JA' }]} onChange={setLanguage} /><ThemeToggle /></nav></header>
    <div className="live-layout"><section className="live-view"><div className="live-preview checkerboard lighting-preview" style={{ backgroundColor: settings.background, backgroundImage: settings.background === 'transparent' ? undefined : 'none' }}>
      <canvas ref={canvas} data-testid="live-avatar" />
      {lightingOpen && <LightHandle value={settings.lighting} onChange={changeLighting} language={language} />}
    </div><p role="status" className={viewState === 'projectError' ? 'live-error' : ''}>{t[viewState]} · {settings.project}</p></section>
    <aside className="live-controls">
      {duplicatePage && <p role="alert" className="live-warning" data-testid="duplicate-live-page">{t.duplicatePage}</p>}
      <Tabs activeKey={activeTab} onChange={key => { setActiveTab(key); setLightingOpen(key === 'lighting'); }} items={[
        { key: 'capture', label: t.camera, forceRender: true, children: <>      <section><h2>{t.camera}</h2><label>{t.device}<SelectInput aria-label={t.camera} value={cameraId} disabled={cameraActive} onChange={event => setCameraId(event.target.value)}><option value="">{t.defaultDevice}</option>{devices.filter(device => device.kind === 'videoinput' && device.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${t.camera} ${i + 1}`}</option>)}</SelectInput></label>
        <div className="live-buttons"><Button type="primary" disabled={!cameraActive && viewState !== 'ready'} onClick={() => {
          setCalibrated(false); pose.current.reset();
          if (cameraActive) camera.current?.stop(); else void camera.current?.start(cameraId).then(refreshDevices);
        }}>{cameraActive ? t.stop : t.start}</Button><Button disabled={!tracking} onClick={() => setCalibrated(pose.current.calibrate(performance.now()))}>{t.calibrate}</Button></div>
        <p role="status" data-testid="tracking-status" data-state={status}>{t[status]}</p>
        {backgroundStatus && <p role="alert" className="live-error" data-testid="background-status">{t[backgroundStatus]}</p>}
        <small>{calibrated ? t.calibrated : t.calibrateHint}</small>
        <label className="live-check"><CheckInput checked={options.mirror} onChange={event => setOptions(current => ({ ...current, mirror: event.target.checked }))} />{t.mirror}</label>
        <label>{t.sensitivity}<RangeInput  min="0.25" max="2" step="0.05" value={options.sensitivity} onChange={event => setOptions(current => ({ ...current, sensitivity: Number(event.target.value) }))} /></label>
        <label>{t.smoothing}<RangeInput  min="0" max="1" step="0.05" value={options.smoothing} onChange={event => setOptions(current => ({ ...current, smoothing: Number(event.target.value) }))} /></label>
        <label className="live-check"><CheckInput checked={showCamera} onChange={event => setShowCamera(event.target.checked)} />{t.cameraPreview}</label>
        <video ref={video} autoPlay muted playsInline className={showCamera ? 'camera-preview' : 'camera-preview camera-hidden'} style={{ transform: options.mirror ? 'scaleX(-1)' : undefined }} aria-label={t.cameraPreview} />
      </section>
      <section><h2>{t.microphone}</h2><label className="live-check"><CheckInput checked={micActive} disabled={!micActive && viewState !== 'ready'} onChange={event => { if (event.target.checked) void microphone.current?.start(micId).then(refreshDevices); else microphone.current?.stop(); }} />{t.microphone}</label>
        <SelectInput aria-label={t.microphone} value={micId} disabled={micActive} onChange={event => setMicId(event.target.value)}><option value="">{t.defaultDevice}</option>{devices.filter(device => device.kind === 'audioinput' && device.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${t.microphone} ${i + 1}`}</option>)}</SelectInput>
        <label>{t.gain}<RangeInput  min="0.25" max="5" step="0.05" value={gain} onChange={event => setGain(Number(event.target.value))} /></label><small role="status">{t[micState]}</small>
      </section>
</> },
        { key: 'output', label: t.background, children: <>      <section><h2>{t.background}</h2><SelectInput aria-label={t.background} value={settings.background} onChange={event => setSettings(current => ({ ...current, background: backgroundColor(event.target.value) }))}>
        <option value="transparent">{t.transparent}</option><option value="#00ff00">{t.green}</option><option value="#0000ff">{t.blue}</option>{!['transparent', '#00ff00', '#0000ff'].includes(settings.background) && <option value={settings.background}>{t.custom}</option>}
      </SelectInput><small className="background-hint" data-testid="background-hint">{settings.background === 'transparent' ? t.bgHintTransparent : ['#00ff00', '#0000ff'].includes(settings.background) ? t.bgHintChroma : t.bgHintCustom}</small>
        <label>{t.custom}<ColorInput  value={settings.background === 'transparent' ? '#ffffff' : settings.background} onChange={event => setSettings(current => ({ ...current, background: event.target.value }))} /></label>
        <label>{t.fit}<SelectInput value={settings.fit} onChange={event => setSettings(current => ({ ...current, fit: event.target.value as 'contain' | 'cover' }))}><option value="contain">{t.contain}</option><option value="cover">{t.cover}</option></SelectInput></label>
        <div className="live-buttons"><Button type="primary" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopyState('copied')).catch(() => setCopyState('copyError')); }}>{t.obs}</Button>
        <a className="live-open" href={url} target="_blank" rel="noreferrer">{t.openStream}</a></div>
        {copyState && <p role="status">{t[copyState]}</p>}<Input className="obs-url" aria-label={t.obs} readOnly value={url} onFocus={event => event.target.select()} /><small>{t.obsHelp}</small>
      </section>
</> },
        { key: 'expression', label: t.expression, children: <>      <section className="live-expression" data-testid="expression-section">
        <div className="live-expression-body"><div className="expression-buttons" role="group" aria-label={t.expression}>
          {LIVE_EXPRESSIONS.map((name, i) => <Button key={name}  aria-pressed={expression === name} aria-keyshortcuts={String(i + 1)} onClick={() => setExpression(name)}><kbd>{i + 1}</kbd>{t[name]}</Button>)}
        </div><small>{t.expressionHint}</small>
        <h3>{t.remoteTitle}</h3><p className="remote-help">{t.remoteHelp}</p>
        {remote ? <>
          <label>{t.remoteUrl}<span className="remote-field"><Input readOnly value={remote.url} onFocus={event => event.target.select()} /><Button  onClick={() => copyRemote('url', remote.url)}>{remoteCopied === 'url' ? t.copiedShort : t.copy}</Button></span></label>
          <label>{t.remoteToken}<span className="remote-field"><Input readOnly value={remote.token} onFocus={event => event.target.select()} /><Button  onClick={() => copyRemote('token', remote.token)}>{remoteCopied === 'token' ? t.copiedShort : t.copy}</Button></span></label>
          <small>{t.remoteNames}</small>
          <div className="remote-actions"><Button  onClick={() => { void loadRemote('POST'); }}>{t.regenerate}</Button><small>{t.regenerateHelp}</small></div>
        </> : <small>{t.remoteUnavailable}</small>}
        <a href="https://github.com/shinshin86/mesh-avatar-studio/blob/main/docs/reference.md#switching-expressions-from-other-apps" target="_blank" rel="noreferrer">{t.remoteDocs}</a></div>
      </section>
</> },
        { key: 'lighting', label: lightingText[language].title, children: <>      <section className="live-lighting" data-testid="lighting-section">
        <div className="lighting-presets"><h3>{t.presets}</h3>
          <div className="preset-slots" role="group" aria-label={t.presets}>
            {presets.map((value, i) => <div className="preset-slot" key={i}>
              {/* The swatch shows the light and ambient colours; the slot number is in the key hint. */}
              <Button  disabled={!value} aria-label={`${t.preset} ${i + 1}${value ? '' : ` (${t.presetEmpty})`}`} aria-pressed={!!value && sameLighting(value, settings.lighting)} aria-keyshortcuts={`Shift+${i + 1}`} onClick={() => applyPreset(i + 1)}>
                <kbd>⇧{i + 1}</kbd>{value ? <span className={`preset-swatch${value.enabled ? '' : ' off'}`} style={value.enabled ? { background: `linear-gradient(135deg, ${colorHex(value.color)} 50%, ${colorHex(value.ambientColor)} 50%)` } : undefined} /> : t.presetEmpty}</Button>
              <Button  className="preset-save" aria-label={`${t.presetSave}: ${t.preset} ${i + 1}`} onClick={() => savePreset(i)}>{t.presetSave}</Button>
            </div>)}
          </div><small>{t.presetHint}</small>
          {remote && <label>{t.presetUrl}<span className="remote-field"><Input readOnly value={`${location.origin}${LIGHTING_PRESET_PATH}`} onFocus={event => event.target.select()} /></span></label>}
        </div>
        <LightingControls value={settings.lighting} onChange={changeLighting} language={language} />
      </section>
</> },
      ]} />
      <p className="live-privacy">{t.privacy}</p>
    </aside></div>
  </main>;
}
