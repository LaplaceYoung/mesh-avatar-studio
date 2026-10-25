# Mesh Avatar Studio

[English](README.md) · [日本語](README.ja.md)

Mesh Avatar Studio 是一个本地优先的 2D 角色工作台：把一张角色插画变成可编辑、可追踪的虚拟形象。项目保留网格编辑、绑定、Live 预览、摄像头追踪、麦克风口型同步、OBS 输出和 `.mavatar` 归档能力，同时新增图片导入、图层制作、姿态审查和本地 AI 辅助工作流。

这是一个独立 fork 后的二开项目，不是 AITuber OnAir 或上游项目的官方版本。感谢 [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio) 提供原始运行时、编辑器思路、文件格式和示例工作流，为这个工作台奠定基础。

## 当前新增能力

- **Studio 工作台**：使用 Ant Design 6 和 Ant Design X 重做编辑器外壳，提供亮暗双模式、可调整分屏、Inspector 和可拖动 Agent 窗口。
- **本地 Agent 窗口**：通过 ACP 连接 Claude Code、Codex 和 Pi，沿用各自的登录状态、模型、工具和权限策略；网页不会拿到 API key，也不能任意执行命令。
- **插画导入**：本地 PNG 上传会检查签名、CRC、大小和尺寸，合格后保存到私有项目目录。
- **Mosi 生图**：可选地通过本地服务端调用 `moss-image-sft-1.0` 生成适合 Live2D 的角色底图。保留原始生成字节，自动去背景默认关闭，绑定前仍需人工审查。
- **可追踪制作流程**：原图、区域证据、草稿绑定、图层和姿态审查分开显示；不会因为文件存在就假定视觉验收通过。
- **中文口型**：支持直接输入汉字，并提供无声调的普通话发音预览，不要求用户先写拼音或声调。

## 本地启动

需要 Node.js 22.17+ 和 Git。区域证据、图层重建需要 Python 3.10+ 与 `uv`；本地 Agent 还需要分别安装并登录对应 CLI。

```sh
git clone --branch feat/studio-redesign https://github.com/LaplaceYoung/mesh-avatar-studio.git
cd mesh-avatar-studio
npm install
npm run doctor
npm run dev
```

打开终端打印的地址，通常是 `http://127.0.0.1:5173/`。启用 Agent 功能时请保持服务只监听本机，不要使用 `--host 0.0.0.0`。

### 配置 Mosi 生图

在项目根目录创建本地 `.env.local`，不要提交，也不要把 key 写入源码、提示词、浏览器存储、日志或 README：

```dotenv
MOSS_API_KEY=替换为本机私有key
```

key 只由本地 Vite 服务端转发给 Mosi API。浏览器只会拿到经过校验的 PNG，不会拿到 Mosi 下载地址或 key。打开 Studio 的**创建**流程，输入简短的角色描述即可；生成文件保存在 Git 忽略的 `projects/.uploads/` 下。

目前最稳定的提示词方向是：正面或近正面、头肩构图、单角色、眼白和虹膜清楚、嘴部无遮挡、发束可分离、饰物简单、纯白背景。不要只依赖否定词：样本测试表明，即使明确要求“无饰品”，模型仍可能生成发饰。因此，开始区域证据或切图前，必须检查眼睛、头发轮廓、浅色衣服和饰品边界。自动去背景是启发式处理，默认关闭。

## 制作流程

1. **创建或导入原图**：优先使用正面或近正面的插画，头部、脖子和肩膀完整留在画面内。
2. **准备区域证据**：使用 `tools/vision-regions.py` 生成局部裁切和坐标网格。所有证据留在私有项目目录，不要只凭整图估计解剖坐标。
3. **草拟并校验绑定**：运行 `npm run validate-rig`，再按[中文 Agent 指南](docs/agent-guide.zh.md)中的 Python 命令构建图层。
4. **渲染姿态并检查**：运行 `npm run render-poses`，检查眨眼、中文口型、转头、抬头低头、表情和头发摆动。发现裂缝、遮挡或饰物跟随错误时，修正绑定并重新构建。
5. **人工视觉验收**：逐张查看审查图后再确认。制作面板会把“文件已生成”和“人工验收”分开记录，不会自动替用户签字。
6. **进入 Live**：使用摄像头追踪、麦克风口型、光照和 OBS。修改轮廓后先保存并重建，再导出 `.mavatar`。

详细坐标规则和纠错循环见[中文 Agent 指南](docs/agent-guide.zh.md)，架构决策见[Studio 重构记录](docs/studio-redesign.md)。

本轮 Mosi 提示词实验和三张本地样本的人工诊断记录在
[Mosi 生图审查](docs/mosi-generation-review.md)中；样本本身不进入 Git。

## 本地 Agent

浮动 Agent 窗口在用户点击连接或明确提交制作任务后启动已安装的 provider。ACP 事件会展示消息、计划、工具调用、权限请求和文件 diff，不会静默授予权限。原生 CLI 的配置仍然是最终权限来源。请把它视为本地便利层，而不是安全沙箱，只在可信仓库中使用。

## 隐私与 Git 忽略文件

原始插画、生成图片、区域裁切、姿态审查帧和 `.env.local` 都被 Git 忽略，只保存在本机，除非用户明确选择发送到外部服务。不要提交 `projects/`、`work/` 或任何凭据。

## 文档

- [中文 Agent 指南](docs/agent-guide.zh.md) / [English guide](docs/agent-guide.md)
- [Studio 重构记录](docs/studio-redesign.md)
- [参考文档](docs/reference.md)
- [绑定字段说明](docs/rig-fields.md)
- [虚拟形象格式](docs/format.md)

## 许可证与致谢

代码遵循 [MIT License](LICENSE)。Miko 示例不属于 MIT 代码许可，需遵循[单独的使用条款](samples/miko-qipao/MIKO_ASSET_TERMS.md)。Miko 是 AITuber OnAir 的角色，© Yuki Shindo；本项目不是 AITuber OnAir 官方产品。

面部追踪使用依据 Apache License 2.0 授权的 [MediaPipe](https://github.com/google-ai-edge/mediapipe)，详见 `vendor/mediapipe/LICENSE`。

## 当前验证范围与限制

- Claude 和 Codex 已验证一次真实 ACP 工具调用；Pi 已验证初始化，但本机配置的推理账户在诊断时返回余额不足。安装检测不等于模型可用。
- 上传／生图支持可选本地白底处理、原图保留和处理前后对比；贴边白发白衣可能误删，需要检查。
- 姿态审查提供全图、眼部、嘴部总览，逐帧导航和静止帧对比；反馈与验收关联证据版本。文件完整不代表视觉质量通过。
- 自动续跑有回合上限和停滞保护；服务端同项目互斥只覆盖带项目标签的请求，不是文件系统沙箱。
- 完整「新图片上传 → Agent 自动描点／绑定 → 最终视觉验收」尚未验证完成，不能承诺所有画风自动成品。输出是网格角色，不是 Live2D Cubism 工程。
- 诊断命令：`npm run render-poses -- projects/<name> --blink-sequence`；可用 `--blink-sweep` 或 `--hide-eye-creases` 定位问题。诊断输出不能替代正式审查。
