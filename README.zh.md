# Mesh Avatar Studio

[English](README.md) · [日本語](README.ja.md)

Mesh Avatar Studio 是一个本地优先的 2D 角色工作台：把一张角色插画变成可编辑、可追踪的网格虚拟形象。它把绑定编辑、Live 预览、摄像头追踪、麦克风口型、OBS 输出、归档导入导出、图片导入、区域证据、图层制作、姿态审查和 ACP 创作助手放在同一个工作台中。

这是由 [LaplaceYoung](https://github.com/LaplaceYoung) 维护的独立产品 fork，不是上游的官方发行版。感谢 [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio) 提供基础运行时、编辑器思路、文件格式和示例工作流。

## 当前方向

- **Studio 工作台**：Ant Design 6 / Ant Design X、亮暗双模式、可调整分屏、Inspector、实时预览和可拖动的 Agent 悬浮窗。
- **本地 ACP Agent**：连接本机已安装的 Claude Code、Codex 或 Pi，不在产品内显示 TUI。浏览器只接收 ACP 事件、工具活动、文件 diff 和权限请求；凭证留在本地 CLI 环境。
- **图片导入**：检查 PNG 签名、CRC、尺寸、像素数、透明度覆盖率、取景和背景风险；可选的连通浅色背景处理只在本机执行，并保留 `original.png`。
- **可追踪制作链路**：原图、区域证据、草稿绑定、正式绑定、图层、动作审查和人工视觉确认分开管理；文件存在不等于视觉通过。
- **证据审查**：源图哈希、区域清单版本、rig 指纹、review 指纹、眼部／嘴部总览、contact sheet、逐帧导航、静止帧对比和连续眨眼诊断。
- **中文口型**：支持汉字、无声调拼音、带声调拼音、`ü`、`ui/ue`、`j/q/x/y` 省略两点形式，并显式提示未解析输入。

## 环境要求

- Node.js 22.17+
- Git
- Python 3.10+ 与 `uv`（区域证据和图层重建）
- 已单独安装并登录的 Claude Code、Codex 或 Pi CLI（ACP Agent）

## 本地运行

```sh
git clone --branch feat/studio-redesign https://github.com/LaplaceYoung/mesh-avatar-studio.git
cd mesh-avatar-studio
npm install
npm run doctor
npm run dev
```

打开 `http://127.0.0.1:5173/`。启用 Agent 时保持开发服务只监听本机，不要使用 `--host 0.0.0.0`。

## 可选 Mosi 生图

在本机创建 `.env.local`，不要提交 key，也不要放进源码、提示词、浏览器存储、日志或文档：

```dotenv
MOSS_API_KEY=replace-with-your-local-key
```

key 只由本地服务端代理使用，浏览器不会收到 provider key 或带权限的 provider URL。生成文件放在 Git 忽略的 `projects/.uploads/` 下。

推荐正面或接近正面、头肩构图、清晰双眼和嘴部、分离的发束、简单饰品、四周留白和纯色背景。去背景是启发式处理，默认关闭；白发、浅色衣服、飘带、边缘和空隙必须人工检查。

## 制作流程

1. 打开 Studio 项目工作台，上传或生成 PNG 底图。
2. 查看源图预检，选择保留原图或启用本地背景处理。
3. 明确授权所选本地 ACP Agent 读取并处理源图。
4. 让 Agent 创建或恢复项目。流程保护源图哈希，不使用 `--force` 覆盖已有项目。
5. 检查区域 `overview`、`detail`、`grid` 证据；眼睛和嘴部需要精细网格。
6. 校验草稿和正式 rig，构建图层，检查眼睛、嘴部、头发、饰品和身体边界。
7. 渲染并检查静止、眨眼、张嘴、转头、视线、倾斜、表情、身体、头发摆动、眼部／嘴部总览和 contact sheet。
8. 把实际缺陷反馈给 Agent。修改后重新渲染；旧证据和旧反馈会被版本指纹拒绝。
9. 亲自查看当前证据后再确认视觉通过，然后打开编辑器或 Live 页面。

输出是数据驱动的网格虚拟形象和 Live2D-style runtime 资源，不是 Live2D Cubism 工程文件。

## ACP Agent 说明

Agent 是悬浮 ACP 窗口，不是终端模拟器。桌面端支持收起、展开、拖动、调整大小，`Esc` 可以关闭。窗口显示 provider、权限、工具调用、文件 diff、制作进度、重连状态和待处理审批。制作回合有上限，旧证据会被拒绝，同一项目的制作提示会在本地 bridge 内串行化。

ACP 初始化成功或工具回合成功，不代表视觉质量或角色制作完成。Pi 是否可用还取决于 provider 账户和余额。项目生产状态、证据图片和人工视觉确认才是当前项目的实际依据。

## 诊断命令

以下命令生成本地证据，不运行 E2E：

```sh
npm run validate-rig -- projects/<name>/rig.json
npm run render-poses -- projects/<name>
npm run render-poses -- projects/<name> --blink-sweep
npm run render-poses -- projects/<name> --blink-sequence
npm run render-poses -- projects/<name> --hide-eye-creases
```

诊断输出不能直接作为视觉通过证据，必须结合当前源图、rig 指纹和 review 版本检查。

## 隐私与 Git 边界

源图、生成图、区域裁剪、review 帧、诊断项目和 `.env.local` 均被 Git 忽略，应放在 `projects/` 或 `work/` 下。不要提交用户图片、provider 凭证、cookie、token 或带权限 URL。产品开发期间应保持 `samples/` 和 `reference/` 不变。

## 文档

- [Agent 指南](docs/agent-guide.zh.md) · [English guide](docs/agent-guide.md)
- [Studio 重构记录](docs/studio-redesign.md)
- [Rig 字段](docs/rig-fields.md)
- [Avatar 格式](docs/format.md)
- [English README](README.md)

## 致谢与许可证

代码使用 [MIT License](LICENSE)。Miko 样例独立于 MIT 代码，遵循 `samples/miko-qipao/MIKO_ASSET_TERMS.md`。人脸追踪使用 Apache License 2.0 的 MediaPipe，见 `vendor/mediapipe/LICENSE`。

感谢 `shinshin86/mesh-avatar-studio` 的作者和贡献者提供基础，本项目在此基础上作为独立 fork 继续开发。
