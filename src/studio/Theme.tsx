import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { App, Button, ConfigProvider, theme } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import { useI18n } from '../editor/i18n';
import { readPreference, savePreference } from '../editor/preferences';
import './studio.css';

const Context = createContext({ dark: false, toggle: () => {} });
export const useStudioTheme = () => useContext(Context);
export function StudioTheme({ children }: { children: ReactNode }) {
  const { language } = useI18n();
  const [dark, setDark] = useState(() => readPreference('studio-theme') === 'dark');
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; savePreference('studio-theme', dark ? 'dark' : 'light'); }, [dark]);
  return <Context.Provider value={{ dark, toggle: () => setDark(value => !value) }}>
    <ConfigProvider button={{ autoInsertSpace: false }} locale={{ zh: zhCN, en: enUS, ja: jaJP }[language]} theme={{
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: { colorPrimary: dark ? '#d58a60' : '#b65b37', borderRadius: 4, fontSize: 13, controlHeight: 32,
        fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif',
        colorBgLayout: dark ? '#181b1e' : '#eceeed', colorBgContainer: dark ? '#22262a' : '#fafbf9' },
      components: { Button: { defaultShadow: 'none', primaryShadow: 'none' }, Tabs: { horizontalItemGutter: 20 }, Input: { activeShadow: 'none' }, Select: { activeOutlineColor: 'transparent' } },
    }}><App>{children}</App></ConfigProvider>
  </Context.Provider>;
}
export function ThemeToggle() {
  const { dark, toggle } = useStudioTheme();
  const { language } = useI18n();
  const label = language === 'zh' ? (dark ? '切换浅色模式' : '切换深色模式') : language === 'ja' ? 'テーマ切替' : 'Toggle theme';
  return <Button type="text" icon={dark ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label={label} title={label} />;
}
