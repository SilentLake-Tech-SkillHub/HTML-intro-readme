# HTML-intro-readme

这是我们后续项目介绍的专用动画制作 SKILL。以项目 README 为核心资料，把“是什么、怎么用、结果是什么”做成可播放、可暂停阅读的中文 HTML 介绍动画，并按项目实际需要提供可复制的安装与启动步骤。

以后制作或更新项目介绍动画，统一使用 `HTML-intro-readme`，复用本仓库的制作流程、质量标准、打包工具和验收方法。内容、视觉风格、播放顺序与时长按具体项目和当次需求确定；oh-my-ntu 是已实现案例。

标准流程：README 核验 → 分镜与文案 → HTML 制作 → HTML 验收与交付 → **（可选）视频导出与验收**。默认成果是 HTML，用户要求视频版时再执行最后一步。

完整技能入口：[SKILL.md](SKILL.md)。包含分镜定稿、真实成品展示、播放器、手机适配、离线打包与浏览器验收标准，以及可运行的本地打包和检查工具。

下载完整仓库，放进 Agent 的技能目录，保留 `SKILL.md`、`agents/`、`references/` 与 `scripts/`。技能标识为 `html-intro-readme`，显示名称为 `HTML-intro-readme`。

```text
使用 $html-intro-readme，按我们的项目介绍动画制作标准，将这个仓库的 README 做成中文 HTML 介绍动画。
仓库：[链接或本地项目]
目标读者：[用户]
播放顺序：[安装与启动 → 可选评分 → 是什么 → 真实成果 → 获取]
交付目录：[本地路径]
```

制作在本地完成；托管、社交发布与 GitHub 同步按用户当次授权执行。

## 可选：HTML 完成后导出视频版

完成 HTML 制作、验收和交付后，用户可选择继续导出 MP4，保留原有文案、播放顺序和动效。支持四种比例（4:3、3:4、16:9、9:16）、三档清晰度（720p、1080p、4K）和三档帧率（30、60、120 fps）自由组合，共 36 种预设。默认 16:9、1080p、30 fps、无配音配乐，可导出整片或指定片段；原网页继续用于复制提示词和放大图片。

```bash
node scripts/export_video.cjs --input /项目/项目介绍.html --output /项目/项目介绍.mp4 --module /依赖/playwright-core --browser /浏览器可执行文件
```

例如竖屏 4K / 60 fps：

```bash
node scripts/export_video.cjs --input /项目/项目介绍.html --output /项目/介绍-竖屏-4K60.mp4 --aspect 9:16 --resolution 4k --fps 60 --module /依赖/playwright-core --browser /浏览器可执行文件
```

`--fit contain` 默认等比保留原 HTML 构图，空余区域留白；`--fit reflow` 按目标比例重新布局，可用 `--css` 提供项目专用排版。

Mac 默认使用原生编码；NVIDIA 电脑可指定 `--encoder nvenc` 调用支持 NVENC 的 FFmpeg。脚本自动完整解码验收并逐屏抽帧，输出视频、来源与参数报告、验收图片。依赖、时间轴接口、片段参数和硬件加速说明见[视频导出流程](references/video-export.md)。

也可以直接对 Agent 说：

```text
使用 $html-intro-readme，把这份已确认的项目介绍 HTML 导出为 MP4。
输入：[本地 HTML 路径]
输出：[本地 MP4 路径]
保留当前版本的顺序、文案和动效，完成视频验收。
```

1.2.0 的组合导出代码已更新；按本次用户要求，未运行新增参数、编码或导出验证。
