import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../editor/i18n';
import { LiveApp } from './LiveApp';
import { StudioTheme } from '../studio/Theme';
createRoot(document.getElementById('root')!).render(<I18nProvider><StudioTheme><LiveApp /></StudioTheme></I18nProvider>);
