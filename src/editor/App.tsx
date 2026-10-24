import { useEffect, useRef, useState } from 'react';
import fixture from 'virtual:sample-rig';
import { EditorCanvas } from './EditorCanvas';
import { setAt } from './model';
import { type Rig, type LipSyncSettings, parseRig, validateRig } from 'mesh-avatar';
import { Preview } from './Preview';
import { RigHistory, downloadRig } from './history';
import { openProjectFolder, saveLipSync, openLocalProject, copySample, localProjects, projectAction, sampleImagesAvailable, sampleSourceUrl, repositoryContext, runProjectJob, ProjectJobError, importAvatar, exportAvatar, type ProjectJob, type LocalProject, type LocalProjectEntry } from './project';
import { ExportAvatar, ImportAvatar } from './AvatarTransfer';
import { archiveText } from './archive-i18n';
import { folderOpenError } from './folder-errors';
import { layerSignature } from './stale';
import { RigFields } from './RigFields';
import { GROUPS } from './parts';
import { PartList } from './PartList';
import { GUIDE_KEY, I18nProvider, readPreference, savePreference, useI18n, type PartGroup } from './i18n';
import { FirstGuide, GuideSteps, Help } from './Guide';
import { RecentProjects } from './RecentProjects';
import { MenuScope } from './Menu';
import { VariantsPanel } from './VariantsPanel';
import { JobFeedback } from './JobFeedback';
import { CopyButton } from './CopyButton';
import { readRecent, addRecent, saveRecent, REOPEN_KEY, pickDirectory, hasDirectoryPicker, directoryFiles,
  keepDirectory, restoreDirectory, forgetDirectory, clearDirectories, type RecentProject, type ProjectDirectory } from './recent-projects';
import { App as AntApp, Button, Drawer, Empty, Segmented, Space, Splitter, Tabs, Tag, Tooltip } from 'antd';
import { AppstoreOutlined, CodeOutlined, FolderOpenOutlined, SaveOutlined, UndoOutlined, RedoOutlined, QuestionCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { StudioTheme, ThemeToggle } from '../studio/Theme';
import { AgentDock } from '../studio/AgentDock';
import { IllustrationCreator } from '../studio/IllustrationCreator';
import { AgentWindow } from '../studio/AgentWindow';
import { liveText } from '../live/i18n';

type EditorError = { kind: 'invalidRig' | 'invalidFolder' | 'missingFolderFiles' | 'unreadableFolder' | 'unreadableProject' | 'invalidValue' | 'saveError' | 'revealError' | 'copyError' | 'continueError'; paths: string[] };
function errorPaths(value: string) { return [...new Set(value.match(/rig(?:\.[\w]+|\[\d+\])+/g) ?? [])]; }

export function App() { return <I18nProvider><StudioTheme><MenuScope><Workspace /></MenuScope></StudioTheme></I18nProvider>; }
function Workspace() {
  const { t, parts, language, locale, setLanguage, title } = useI18n();
  const [projectLibrary, setProjectLibrary] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [inspectorTab, setInspectorTab] = useState('preview');
  const { modal } = AntApp.useApp();
  const zh = language === 'zh';
  const openMenu = useRef<{ open: boolean } | null>(null);
  openMenu.current = { get open() { return projectLibrary; }, set open(value: boolean) { setProjectLibrary(value); } };
  const showProjects = () => { setHelp(false); setAgentOpen(false); setProjectLibrary(true); };
  const showHelp = () => { setProjectLibrary(false); setAgentOpen(false); setHelp(true); };
  const toggleAgent = () => { setProjectLibrary(false); setHelp(false); setAgentOpen(value => !value); };
  useEffect(() => {
    const show = () => { setProjectLibrary(false); setHelp(false); setAgentOpen(true); };
    window.addEventListener('studio:agent-prompt', show);
    window.addEventListener('studio:agent-start', show);
    return () => { window.removeEventListener('studio:agent-prompt', show); window.removeEventListener('studio:agent-start', show); };
  }, []);
  useEffect(() => {
    const receive = (event: Event) => { const status = (event as CustomEvent<string>).detail; if (typeof status === 'string') setAgentStatus(status); };
    window.addEventListener('studio:agent-status', receive);
    return () => window.removeEventListener('studio:agent-status', receive);
  }, []);

  const [guide, setGuide] = useState(() => readPreference(GUIDE_KEY) !== '1');
  const [help, setHelp] = useState(false);
  const [history] = useState(() => new RigHistory(parseRig(fixture)));
  const [rig, setRig] = useState(history.present);
  const [lipSync, setLipSync] = useState<LipSyncSettings | undefined>();
  const [savedLipSync, setSavedLipSync] = useState<string | undefined>();
  const [savedRig, setSavedRig] = useState(() => JSON.stringify(history.present));
  const pickedFiles = useRef<File[] | undefined>(undefined);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveFeedback, setArchiveFeedback] = useState<{ error?: string; name?: string } | null>(null);
  const sharing = archiveText[language];
  const [builtSignature, setBuiltSignature] = useState(() => layerSignature(history.present));
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const projectOpened = useRef(false);
  const objectUrls = useRef<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [assets, setAssets] = useState<Record<string, string> | undefined>(undefined);
  const [projects, setProjects] = useState<LocalProjectEntry[] | null>(null);
  const [localProject, setLocalProject] = useState<LocalProject | null>(null);
  const [pickedName, setPickedName] = useState('');
  const [notice, setNotice] = useState<{ key: 'savedTo' | 'missingRecent' | 'variantsReloaded' | 'reloadFailed'; path?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [rootPath, setRootPath] = useState<string>();
  const [focusRequest, setFocusRequest] = useState<{ group: string; id: number }>();
  const [mouthSprites, setMouthSprites] = useState(true), [mouthRequest, setMouthRequest] = useState(0);
  const [job, setJob] = useState<ProjectJob | null>(null);
  const jobRef = useRef<ProjectJob | 'transfer' | null>(null);
  const [rebuildError, setRebuildError] = useState<ProjectJobError | null>(null);
  useEffect(() => { void repositoryContext().then(context => { setRootPath(context?.rootPath); }); }, []);
  const [recent, setRecent] = useState(readRecent);
  const [reopen, setReopen] = useState(() => readPreference(REOPEN_KEY) !== '0');
  const remember = (entry: RecentProject) => {
    setRecent(current => {
      const next = addRecent(current, entry); saveRecent(next);
      for (const item of current) if (!next.some(value => value.id === item.id)) void forgetDirectory(item.id);
      return next;
    });
  };
  const removeRecent = (id: string) => {
    setRecent(current => { const next = current.filter(item => item.id !== id); saveRecent(next); return next; });
    void forgetDirectory(id);
  };
  useEffect(() => {
    let active = true;
    void localProjects().then(async list => {
      if (!active) return;
      setProjects(list);
      const entries = readRecent();
      const missing = list ? entries.filter(entry => entry.kind === 'server' && !list.some(project => project.name === entry.serverName)) : [];
      const available = entries.filter(entry => !missing.includes(entry));
      if (missing.length) { setRecent(available); saveRecent(available); setNotice({ key: 'missingRecent', path: missing.map(entry => entry.name).join(', ') }); }
      if (readPreference(REOPEN_KEY) === '0' || !available.length || projectOpened.current) return;
      const latest = available[0];
      if (latest.kind === 'server') {
        const project = list?.find(item => item.name === latest.serverName);
        if (project && !project.error) { projectOpened.current = true; await openLocal(project, true); }
      } else if (latest.hasHandle) {
        const handle = await restoreDirectory(latest.id);
        if (!active || !handle) return;
        try {
          if (await handle.queryPermission({ mode: 'read' }) === 'granted' && active && !projectOpened.current) {
            projectOpened.current = true; await openFolder(await directoryFiles(handle), handle);
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'NotFoundError') { removeRecent(latest.id); setNotice({ key: 'missingRecent', path: latest.name }); }
          // Permission prompts are reserved for a click on the recent entry.
        }
      }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(timer); }, [notice]);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let cancelled = false;
    sampleImagesAvailable().then(available => {
      if (cancelled) return;
      if (available && !projectOpened.current) setSourceUrl(sampleSourceUrl);
      setChecking(false);
    });
    return () => { cancelled = true; objectUrls.current.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  const [visible, setVisible] = useState<string[]>([...GROUPS]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragStale, setDragStale] = useState<boolean | null>(null);
  const [error, setError] = useState<EditorError | null>(null);
  const update = (next: Rig) => {
    if (jobRef.current) return;
    const errors = validateRig(next);
    if (errors.length) { setError({ kind: 'invalidValue', paths: errorPaths(errors.join('\n')) }); return; }
    setError(null);
    history.change(next);
    setRig(history.present);
  };
  const openFile = async (file?: File) => {
    if (!file || jobRef.current || localProject?.hasSource === false) return;
    try {
      update(parseRig(JSON.parse(await file.text())));
      setSelected(null);
      setLocalProject(null);
    } catch (error) { setError({ kind: 'invalidRig', paths: errorPaths(String(error)) }); }
  };
  const openFolder = async (files: File[], handle?: ProjectDirectory) => {
    if (jobRef.current) return false;
    setOpening(true);
    try {
      const project = await openProjectFolder(files);
      projectOpened.current = true;
      setLipSync(project.lipSync); setSavedLipSync(JSON.stringify(project.lipSync));
      if (project.rig) {
        history.load(project.rig); setRig(history.present); setDragStale(null);
        setSavedRig(JSON.stringify(project.rig));
        setBuiltSignature(layerSignature(project.rig));
      }
      setSelected(null);
      objectUrls.current.forEach(url => URL.revokeObjectURL(url));
      objectUrls.current = project.urls;
      setSourceUrl(project.sourceUrl);
      setAssets(project.assets);
      setLocalProject(null);
      pickedFiles.current = files;
      setPickedName(files[0]?.webkitRelativePath.split('/')[0] || t.openProject);
      setChecking(false);
      setError(null);
      setRebuildError(null);
      const name = handle?.name || files[0]?.webkitRelativePath.split('/')[0] || t.openProject;
      let id = `folder:${name}`;
      if (handle) {
        id = `folder:${crypto.randomUUID()}`;
        for (const entry of recent.filter(item => item.kind === 'folder' && item.hasHandle)) {
          const previous = await restoreDirectory(entry.id);
          try { if (previous && await handle.isSameEntry(previous)) { id = entry.id; break; } } catch { /* An old handle may no longer exist. */ }
        }
      }
      const hasHandle = handle ? await keepDirectory(id, handle) : false;
      if (!hasHandle) id = `folder:${name}`;
      remember({ id, name, kind: 'folder', relativePath: name, lastOpened: new Date().toISOString(), hasHandle });
      if (openMenu.current) openMenu.current.open = false;
      return true;
    } catch (error) { setError(folderOpenError(error)); return false; }
    finally { setOpening(false); }
  };
  const openLocal = async (entry: LocalProjectEntry, automatic = false) => {
    if (jobRef.current) return;
    if (entry.error) { setError({ kind: 'unreadableProject', paths: [entry.error.code, entry.error.path] }); return; }
    setOpening(true);
    try {
      const project = await openLocalProject(entry);
      projectOpened.current = true;
      setLipSync(project.lipSync); setSavedLipSync(JSON.stringify(project.lipSync));
      history.load(project.rig!); setRig(history.present); setDragStale(null); setBuiltSignature(layerSignature(project.rig!));
      setSavedRig(JSON.stringify(project.rig)); pickedFiles.current = undefined;
      setSelected(null); setLocalProject(entry); setPickedName('');
      objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current = [];
      setSourceUrl(project.sourceUrl); setAssets(project.assets); setChecking(false); setError(null);
      setRebuildError(null);
      if (!automatic) setNotice(null);
      remember({ id: `server:${entry.name}`, kind: 'server', name: entry.name, serverName: entry.name,
        relativePath: entry.relativePath, lastOpened: new Date().toISOString() });
      if (openMenu.current) openMenu.current.open = false;
    } catch {
      if (automatic) { removeRecent(`server:${entry.name}`); setNotice({ key: 'missingRecent', path: entry.name }); }
      else setError({ kind: 'invalidFolder', paths: [] });
    }
    finally { setOpening(false); }
  };
  const saveRef = useRef<() => void>(() => undefined);
  const save = async () => {
    if (jobRef.current) return;
    if (localProject?.hasSource === false) return;
    if (!localProject || localProject.readOnly) {
      if (JSON.stringify(lipSync) !== savedLipSync) await exportFile(true).catch(() => undefined); else downloadRig(history.present);
      return;
    }
    if (saving) return;
    setSaving(true);
    const snapshot = JSON.stringify(history.present);
    try { const result = await projectAction(localProject, 'rig', history.present);
      if (lipSync) { await saveLipSync(localProject, lipSync); setSavedLipSync(JSON.stringify(lipSync)); } setSavedRig(snapshot); setNotice({ key: 'savedTo', path: result.path }); setError(null); }
    catch { setError({ kind: 'saveError', paths: [] }); }
    finally { setSaving(false); }
  };
  saveRef.current = () => { void save(); };
  const reveal = async () => {
    if (!localProject) return;
    try { await projectAction(localProject, 'reveal'); setError(null); }
    catch { setError({ kind: 'revealError', paths: [] }); }
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setHelp(false); setAgentOpen(false); if (openMenu.current) openMenu.current.open = false; }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (jobRef.current) { if (['s', 'z'].includes(event.key.toLowerCase())) event.preventDefault(); return; }
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); saveRef.current(); }
      if (!typing && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setRig(event.shiftKey ? history.redo() : history.undo());
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [history]);
  const selectPart = (group: string) => { setInspectorTab('properties'); setSelected(group); setVisible(current => current.includes(group) ? current : [...current, group]); };
  const selectedGroup = selected?.split('.')[0] as PartGroup | undefined;
  const selectedPart = selectedGroup && parts[selectedGroup];
  const currentLayers = JSON.parse(layerSignature(rig)), builtLayers = JSON.parse(builtSignature);
  const changed = Object.keys(currentLayers).filter(key => JSON.stringify(currentLayers[key]) !== JSON.stringify(builtLayers[key]));
  const errorNotice = error && <p role="alert" className="error">{t[error.kind]} {error.paths.join(', ')}</p>;
  const dismissGuide = () => { setGuide(false); savePreference(GUIDE_KEY, '1'); };
  const chooseFile = async (folder: boolean) => {
    if (jobRef.current) return;
    if (openMenu.current) openMenu.current.open = false;
    if (folder && hasDirectoryPicker()) {
      try { const handle = await pickDirectory(); await openFolder(await directoryFiles(handle), handle); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(folderOpenError(error)); }
    } else (folder ? folderInput : fileInput).current!.click();
  };
  const openRecent = async (entry: RecentProject) => {
    if (entry.kind === 'server') {
      const list = await localProjects(); setProjects(list);
      if (list) {
        const project = list.find(item => item.name === entry.serverName);
        if (!project) { removeRecent(entry.id); setNotice({ key: 'missingRecent', path: entry.name }); return; }
        await openLocal(project); return;
      }
    } else if (entry.hasHandle) {
      const handle = await restoreDirectory(entry.id);
      if (handle) {
        try {
          const permission = await handle.queryPermission({ mode: 'read' });
          if (permission !== 'granted' && await handle.requestPermission({ mode: 'read' }) !== 'granted') return;
          await openFolder(await directoryFiles(handle), handle); return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'NotFoundError') { removeRecent(entry.id); setNotice({ key: 'missingRecent', path: entry.name }); return; }
          setError(folderOpenError(error)); return;
        }
      }
    }
    await chooseFile(true);
  };
  const recentControl = <RecentProjects recent={recent} projects={projects} reopen={reopen}
    onOpen={entry => { void openRecent(entry); }} onRemove={removeRecent}
    onClear={() => { setRecent([]); saveRecent([]); void clearDirectories(); }}
    onReopen={value => { setReopen(value); savePreference(REOPEN_KEY, value ? '1' : '0'); }} />;
  const reloadInPlace = async (entry: LocalProject) => {
    const list = await localProjects(), fresh = list?.find(item => item.name === entry.name);
    if (!fresh || fresh.error) throw new ProjectJobError('toolFailed', t.reloadFailed);
    const loaded = await openLocalProject(fresh);
    // Keep the canvas mounted, its view, selection and the existing undo/redo stack.
    history.replacePresent(loaded.rig!); setRig(history.present); setDragStale(null);
    setSavedRig(JSON.stringify(loaded.rig));
    setBuiltSignature(layerSignature(loaded.rig!)); setAssets(loaded.assets); setLocalProject(fresh); setProjects(list); setRebuildError(null);
  };
  useEffect(() => {
    if (!import.meta.hot || !localProject) return;
    const entry = localProject;
    let active = true, revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = ({ name }: { name: string }) => {
      if (name !== entry.name || jobRef.current) return;
      const generation = ++revision;
      clearTimeout(timer);
      const reload = async (attempt = 0) => {
        if (!active || generation !== revision || jobRef.current) return;
        try {
          const list = await localProjects(), fresh = list?.find(item => item.name === entry.name);
          if (!fresh || fresh.error) throw new Error('Project unavailable');
          const loaded = await openLocalProject(fresh);
          if (!active || generation !== revision || jobRef.current) return;
          // Sprite changes must not discard unsaved outlines, selection, view or undo history.
          setAssets(loaded.assets); setLocalProject(fresh); setProjects(list);
          setNotice({ key: 'variantsReloaded' });
        } catch {
          if (!active || generation !== revision || jobRef.current) return;
          if (attempt < 3) timer = setTimeout(() => { void reload(attempt + 1); }, 600 * (attempt + 1));
          else setNotice({ key: 'reloadFailed' });
        }
      };
      timer = setTimeout(() => { void reload(); }, 300);
    };
    import.meta.hot.on('studio:variants-changed', changed);
    return () => { active = false; clearTimeout(timer); import.meta.hot?.off('studio:variants-changed', changed); };
  }, [localProject?.name]);
  const runJob = async (action: ProjectJob, files?: File[]) => {
    if (!localProject || localProject.readOnly || jobRef.current || saving) throw new ProjectJobError('toolFailed');
    jobRef.current = action; setJob(action);
    try {
      const result = await runProjectJob(localProject, action, history.present, files);
      if (action !== 'variant-requests') {
        try { await reloadInPlace(localProject); }
        catch { throw new ProjectJobError('reloadFailed', t.reloadFailed); }
      }
      return result;
    } finally { jobRef.current = null; setJob(null); }
  };
  const sampleEditing = !!localProject?.readOnly || (!localProject && !pickedName);
  const listedProject = !localProject && pickedName ? projects?.find(project => !project.error && !project.readOnly && project.name === pickedName && project.relativePath.startsWith('projects/')) : undefined;
  const continueEditing = async () => {
    if (jobRef.current || saving || opening) return;
    const edited = structuredClone(history.present), previousSignature = builtSignature;
    jobRef.current = 'transfer'; setOpening(true); setError(null);
    try {
      const entry = sampleEditing ? await copySample(edited) : listedProject;
      if (!entry || entry.error) throw new Error('Project unavailable');
      const loaded = await openLocalProject(entry);
      // The copied layers still reflect the sample's original outlines, not the edited rig.
      setBuiltSignature(sampleEditing ? previousSignature : layerSignature(loaded.rig!));
      history.replacePresent(edited); setRig(history.present); setDragStale(null);
      objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current = [];
      projectOpened.current = true; setSourceUrl(loaded.sourceUrl); setAssets(loaded.assets);
      setLocalProject(entry); setPickedName(''); setChecking(false); setRebuildError(null);
      setSavedRig(JSON.stringify(loaded.rig)); pickedFiles.current = undefined;
      setProjects(await localProjects());
      remember({ id: `server:${entry.name}`, kind: 'server', name: entry.name, serverName: entry.name, relativePath: entry.relativePath, lastOpened: new Date().toISOString() });
    } catch { setError({ kind: 'continueError', paths: [] }); }
    finally { jobRef.current = null; setOpening(false); }
  };
  const playbackOnly = localProject?.hasSource === false;
  const busy = job !== null || opening || archiveBusy;
  const dirty = JSON.stringify(rig) !== savedRig || JSON.stringify(lipSync) !== savedLipSync;
  const writable = !!localProject && !localProject.readOnly && !playbackOnly;
  const importFile = async (file: File) => {
    if (jobRef.current || saving || opening) return;
    if (!rootPath) { setArchiveFeedback({ error: sharing.importUnavailable }); return; }
    if (openMenu.current) openMenu.current.open = false;
    jobRef.current = 'transfer'; setArchiveBusy(true); setArchiveFeedback(null);
    try {
      const entry = await importAvatar(file);
      setProjects(await localProjects());
      jobRef.current = null;
      await openLocal(entry);
      setArchiveFeedback({ name: entry.name });
    } catch (error) { setArchiveFeedback({ error: error instanceof Error ? error.message : sharing.failed }); }
    finally { jobRef.current = null; setArchiveBusy(false); }
  };
  const exportFile = async (includeSource: boolean) => {
    if (jobRef.current || saving || opening) return;
    jobRef.current = 'transfer'; setArchiveBusy(true); setArchiveFeedback(null);
    try {
      if (writable && dirty) {
        const snapshot = JSON.stringify(history.present);
        await projectAction(localProject!, 'rig', history.present); setSavedRig(snapshot);
        if (lipSync) { await saveLipSync(localProject!, lipSync); setSavedLipSync(JSON.stringify(lipSync)); }
      }
      const name = localProject?.name ?? (pickedName || 'sample-miko-qipao');
      const blob = await exportAvatar(name, includeSource, pickedFiles.current, lipSync);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${name}.mavatar`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setArchiveFeedback({ error: error instanceof Error ? error.message : sharing.failed }); throw error; }
    finally { jobRef.current = null; setArchiveBusy(false); }
  };
  const generatedProjectHandler = useRef<(name: string) => void>(() => undefined);
  generatedProjectHandler.current = name => {
    if (busy || saving) return;
    void localProjects().then(list => {
      setProjects(list);
      const entry = list?.find(item => item.name === name && !item.error);
      if (!entry) { showProjects(); return; }
      const load = () => openLocal(entry);
      if (dirty) modal.confirm({ title: zh ? '打开生成的角色？' : 'Open generated avatar?', content: zh ? '当前未保存的编辑会被替换，请先保存需要保留的内容。' : 'Unsaved changes will be replaced. Save changes you want to keep.', onOk: load });
      else void load();
    }).catch(() => setError({ kind: 'invalidFolder', paths: [] }));
  };
  useEffect(() => {
    const receive = (event: Event) => { const name = (event as CustomEvent<string>).detail; if (typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) generatedProjectHandler.current(name); };
    window.addEventListener('studio:open-generated-project', receive);
    return () => window.removeEventListener('studio:open-generated-project', receive);
  }, []);
  const importControl = <ImportAvatar busy={busy || saving} available={!!rootPath} onImport={file => { void importFile(file); }} />;
  const projectName = localProject?.readOnly ? t.sampleProject : localProject?.name || pickedName || t.sampleProject;
  const projectPath = localProject?.relativePath ?? (pickedName || 'samples/miko-qipao');
  const refreshAfterAgent = () => {
    void localProjects().then(setProjects);
    if (!localProject) { showProjects(); return; }
    const reload = () => { void openLocal(localProject); };
    if (dirty) modal.confirm({ title: zh ? '重新加载磁盘上的项目？' : 'Reload project from disk?', content: zh ? '当前未保存的编辑会被磁盘版本替换。请先保存需要保留的修改。' : 'Unsaved editor changes will be replaced. Save changes you want to keep first.', onOk: reload });
    else reload();
  };
  const openEntry = (entry: LocalProjectEntry) => {
    if (dirty) modal.confirm({ title: zh ? '切换项目？' : 'Switch project?', content: zh ? '当前未保存的修改将丢失。' : 'Unsaved changes will be lost.', onOk: () => openLocal(entry) });
    else void openLocal(entry);
  };
  return <main className="studio-app" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file?.name.toLowerCase().endsWith('.mavatar')) void importFile(file); else void openFile(file); }}>
    <header className="studio-header">
      <div className="studio-brand"><span className="brand-mark">M</span><div><h1>MESH <span>STUDIO</span></h1><small>{zh ? '角色创作工作台' : 'AVATAR WORKBENCH'}</small></div></div>
      <div className="studio-project-name"><strong>{projectName}</strong><Tag color={dirty ? 'orange' : undefined}>{dirty ? zh ? '未保存' : 'Unsaved' : localProject?.readOnly || !localProject ? t.readOnly : zh ? '已保存' : 'Saved'}</Tag></div>
      <nav className="studio-actions" aria-label={t.tools}>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label={t.rigFile} onChange={event => { void openFile(event.target.files?.[0]); event.target.value = ''; }} />
        <input ref={folderInput} type="file" multiple hidden aria-label={t.folderFiles} {...{ webkitdirectory: '' }} onChange={event => { void openFolder(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        <Button aria-label={t.openProject} icon={<FolderOpenOutlined />} onClick={() => { showProjects(); void localProjects().then(setProjects); }}>{t.openProject}</Button>
        <Tooltip title={`${t.save} · ⌘S`}><Button icon={<SaveOutlined />} aria-label={t.save} loading={saving} disabled={busy || playbackOnly} onClick={() => { void save(); }} /></Tooltip>
        <Button icon={<UndoOutlined />} aria-label={t.undo} disabled={!history.canUndo || busy || playbackOnly} onClick={() => setRig(history.undo())} />
        <Button icon={<RedoOutlined />} aria-label={t.redo} disabled={!history.canRedo || busy || playbackOnly} onClick={() => setRig(history.redo())} />
        <ExportAvatar busy={busy || saving} available={!!rootPath || !!pickedFiles.current} writable={writable} dirty={dirty} stale={changed.length > 0} onExport={exportFile} />
        <Button icon={<VideoCameraOutlined />} href={localProject || listedProject || !pickedName ? `/live.html?project=${encodeURIComponent(localProject?.name ?? listedProject?.name ?? 'sample-miko-qipao')}` : undefined} disabled={!!pickedName && !localProject && !listedProject} target="_blank" rel="noreferrer">{liveText[language].title}</Button>
        <Button type={agentOpen ? 'primary' : 'default'} icon={<CodeOutlined />} aria-pressed={agentOpen} onClick={toggleAgent}>Agent</Button>
        <Button icon={<QuestionCircleOutlined />} aria-label={t.help} onClick={showHelp} />
        <Segmented aria-label={t.language} size="small" value={language} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'EN' }, { value: 'ja', label: 'JA' }]} onChange={setLanguage} />
        <ThemeToggle />
      </nav>
    </header>
    <Drawer title={<Space><AppstoreOutlined />{zh ? '项目工作台' : 'Projects'}</Space>} placement="left" size={680} open={projectLibrary} onClose={() => setProjectLibrary(false)}>
      <div className="library-intro"><h2>{zh ? '从一张插画，到一个角色。' : 'An illustration. A character in motion.'}</h2><p>{t.projectHelp}</p><Space wrap><Button icon={<FolderOpenOutlined />} onClick={() => { void chooseFile(true); }}>{t.openFolder}</Button><Button disabled={playbackOnly} onClick={() => { void chooseFile(false); }}>{t.openRig}</Button></Space></div>
      <Tabs items={[
        { key: 'local', label: t.localProjects, children: <div className="library-list">{projects?.map(project => <Button block key={project.name} disabled={opening || !!project.error} data-testid={`project-${project.name}`} onClick={() => openEntry(project)}><div><strong>{project.readOnly ? t.sampleProject : project.name}</strong><small>{project.relativePath}</small><small>{project.error ? `${t.unreadableProject}: ${project.error.code}` : `${t.updated}: ${new Date(project.updatedAt).toLocaleString(locale)}`}</small></div><Tag>{project.readOnly ? t.readOnly : !project.error && project.hasSource === false ? sharing.playbackBadge : zh ? '可编辑' : 'Editable'}</Tag></Button>)}{projects?.length === 0 && <Empty description={t.noProjects} />}</div> },
        { key: 'recent', label: t.recent, children: recentControl },
        { key: 'import', label: sharing.importTitle, children: importControl },
        { key: 'create', label: t.newIllustration, children: <IllustrationCreator /> },
      ]} />
    </Drawer>
    <div className="studio-notices">
    {notice && <div role="status" className="save-notice">{t[notice.key]}{notice.path && ` ${notice.path}`}</div>}
    {archiveFeedback && <div className={`archive-feedback${archiveFeedback.error ? ' error' : ''}`} role={archiveFeedback.error ? 'alert' : 'status'}>
      <span>{archiveFeedback.error ?? `${sharing.imported} ${archiveFeedback.name}`}</span><Button onClick={() => setArchiveFeedback(null)}>{sharing.dismiss}</Button>
    </div>}
    {playbackOnly && <p className="playback-notice" role="status">{sharing.playbackOnly}</p>}
    {help && <Help onClose={() => setHelp(false)} onGuide={() => { setGuide(true); setHelp(false); }} />}
    {(dragStale ?? changed.length > 0) && <div className="stale" data-testid="stale-banner"><p role="status">{localProject && !localProject.readOnly ? t.staleLocal : sampleEditing ? t.staleSample : listedProject ? t.staleListed : t.stale}</p><small>{t.changedParts}: {changed.map(key => parts[key as PartGroup]?.[0] ?? title(key)).join(' · ')}</small>
      {localProject && !localProject.readOnly ? <Button type="primary" disabled={job !== null || saving} onClick={() => { setRebuildError(null); void runJob('rebuild').catch(error => setRebuildError(error instanceof ProjectJobError ? error : new ProjectJobError('toolFailed'))); }}>{job === 'rebuild' ? t.rebuilding : t.rebuild}</Button> : <><small>{sampleEditing ? t.sampleRebuildReason : t.folderRebuildReason}</small>{sampleEditing || listedProject ? <Button type="primary" disabled={opening || saving || job !== null || (sampleEditing && !rootPath)} onClick={() => { void continueEditing(); }}>{opening ? t.operationBusy : sampleEditing ? t.copyContinue : t.reopenListed}</Button> : <p>{t.rebuildUnavailable}</p>}</>}
      {rebuildError && <JobFeedback error={rebuildError} rig={rig} />}
      {error?.kind === 'continueError' && errorNotice}
    </div>}

    </div>
    <div className="studio-body">

      {(sourceUrl || assets) ? <Splitter className="workspace" style={{ height: '100%' }}>
        <Splitter.Panel defaultSize={260} min={180} max={360} collapsible size={playbackOnly ? 0 : undefined}>
          <div className="parts-container" inert={busy}><PartList rig={rig} visible={visible} selected={selected} onSelect={selectPart} onFocus={group => { selectPart(group); setFocusRequest(current => ({ group, id: (current?.id ?? 0) + 1 })); }} onVisible={setVisible} /></div>
        </Splitter.Panel>
        <Splitter.Panel min={280}>
          <section className="editor-panel" inert={busy}>
            <div className="panel-heading"><Space><span className="section-index">01</span><strong>{t.source}</strong></Space><span className="muted">{rig.image.width} × {rig.image.height} {t.px}</span></div>
            {!playbackOnly ? <div className="canvas-stage"><EditorCanvas sourceUrl={sourceUrl} rig={rig} visible={visible} selected={selected} onSelect={value => { setSelected(value); setInspectorTab('properties'); }} onChange={update} focusRequest={focusRequest} onBegin={() => { history.begin(); setDragStale(changed.length > 0); }} onEnd={() => { history.end(); setRig(structuredClone(history.present)); setDragStale(null); }} />{guide && <FirstGuide onDismiss={dismissGuide} />}</div> : <Empty description={sharing.playbackOnly} />}
          </section>
        </Splitter.Panel>
        <Splitter.Panel defaultSize={340} min={300} max={620} collapsible>
          <div className="inspector-column"><Tabs activeKey={inspectorTab} onChange={setInspectorTab} items={[
            { key: 'preview', label: t.preview, forceRender: true, children: <Preview key={localProject?.name ?? (pickedName || 'sample-miko-qipao')} projectKey={localProject?.name ?? (pickedName || 'sample-miko-qipao')} rig={rig} assets={assets} lipSync={lipSync} onLipSyncChange={setLipSync} hasMouthSprites={mouthSprites} onDrawMouth={playbackOnly ? undefined : () => { setInspectorTab('variants'); setMouthRequest(value => value + 1); }} /> },
            { key: 'properties', label: t.selection, children: <>{!playbackOnly && <aside className="panel inspector" inert={busy}>
          <div className="selection-heading"><h2>{selectedPart?.[0] ?? t.selection}</h2></div>
          {errorNotice}
          {selectedPart ? <><p className="part-description">{selectedPart[1]}</p><p className="part-tip"><strong>{t.tip}</strong> {selectedPart[2]}</p>
            <div className="fields">{selected && <RigFields rig={rig} path={selected} onChange={(path, value) => update(setAt(rig, path, value))} />}</div></>
            : <div className="selection-empty"><p>{t.selectPart}</p><GuideSteps /></div>}
        </aside>}</> },
            { key: 'variants', label: t.variantsTitle, forceRender: true, children: <>{!playbackOnly && <VariantsPanel project={localProject} projectPath={localProject?.relativePath ?? (pickedName ? `<${pickedName}>` : 'samples/miko-qipao')} assets={assets} rootPath={rootPath} busy={busy || saving} stale={changed.length > 0} onRun={runJob} mouthRequest={mouthRequest} onMouthPresence={setMouthSprites} />}</> },
          ]} /></div>
        </Splitter.Panel>
      </Splitter> : <div className="empty-project"><h2>{checking ? t.checking : t.emptyTitle}</h2><p>{t.projectHelp}</p><Button type="primary" onClick={showProjects}>{t.openProject}</Button>{errorNotice}</div>}
    </div>
    <AgentWindow open={agentOpen} onOpenChange={setAgentOpen} status={agentStatus}>
      <AgentDock project={projectPath} selection={selected} onRefresh={refreshAfterAgent} />
    </AgentWindow>
    <footer className="studio-status"><Space><span className="status-dot" />{zh ? '本地工作区' : 'Local workspace'}<span data-testid="project-location">{projectPath}</span>{localProject && <><CopyButton value={localProject.absolutePath} label={t.copyPath} icon /><Button size="small" type="text" onClick={() => { void reveal(); }}>{t.showFolder}</Button></>}</Space><span>{selectedPart?.[0] ?? t.selectPart} · WebGL</span></footer>
  </main>;
}
