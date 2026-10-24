import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../../src/editor/i18n';
import { StudioTheme } from '../../../src/studio/Theme';
import './player.css';
import { PlayerApp } from './PlayerApp';

const language = document.documentElement.lang === 'ja' ? 'ja' : 'en';
createRoot(document.getElementById('root')!).render(<I18nProvider><StudioTheme><PlayerApp language={language} /></StudioTheme></I18nProvider>);
