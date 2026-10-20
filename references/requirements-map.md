# 需求与标准映射

本技能提炼自 oh-my-ntu《动画文案 v1.0.0》及后续“安装和评分前置”要求。原始项目正文以其独立版本化定稿为准；本技能保留制造流程和可复用的验收标准，不将项目专用文案当作其他 README 的默认内容。

| 原始要求 | 技能中的对应位置 |
|---|---|
| 先读 README / SKILL，核实获取、安装、启动和成品 | SKILL.md 工作顺序 1；workflow.md 第 1–2 节 |
| 最新定稿唯一来源，逐字使用，改动升版 | SKILL.md 工作顺序 3；quality-standard.md 文案与信息 |
| 学生视角，保留“我 / 你”和已批准原话，不加防御性备注 | SKILL.md 必须保留的约束；quality-standard.md 文案与信息 |
| 是什么、怎么用、结果是什么都讲清楚 | SKILL.md 工作顺序 2；workflow.md 第 2–3 节 |
| 安装与启动分别给可复制提示词，工具能力、两类路径说清楚 | workflow.md 第 2 节；quality-standard.md 复制验收 |
| 按用户新要求重排安装、启动、评分，再讲其余内容 | workflow.md 稳定 key；oh-my-ntu-example.md 顺序表 |
| 案例 12 屏 / 89 秒，慢速 ×1.5，手动翻屏 | oh-my-ntu-example.md；quality-standard.md 时间轴 |
| 白底 16:9、橙色强调、一主句加一副句 | quality-standard.md 文案与视觉 |
| 390px 单列，路径表变卡片，桌面无屏内滚动 | quality-standard.md 视觉与交付验收 |
| 元素依次淡入上移，暂停和拖动同步 | quality-standard.md 单一动画时钟与代码示例 |
| 结束前约 1.7 秒提示下一段，手动隐藏 | quality-standard.md 时间轴与动效 |
| 当前阶段与七个文件夹卡片颜色对应 | quality-standard.md 视觉；oh-my-ntu-example.md |
| 使用 8 张 README 真实图，保留原遮挡，点击放大 | quality-standard.md 视觉与来源；下列案例素材表 |
| 六个 Agent 图标、深色背景的 KIMI、保留许可 | quality-standard.md 图标可辨识与许可；oh-my-ntu-example.md |
| 评分原值、0–100 横轴、主观综合体验、四个维度、无分项权重 | quality-standard.md 评分与 PNG；oh-my-ntu-example.md 原始评分 |
| 顶栏、页脚、章节、时间码、键盘、全屏 | quality-standard.md 播放器 |
| 点击复制或图片自动暂停，减少动态效果默认手动 | quality-standard.md 播放器与验收清单 |
| 四个锚点、重排后仍定位正确 | workflow.md 稳定 key；quality-standard.md 播放器 |
| 动画、Q&A、指南、提示词、路径与说明保持一致 | SKILL.md 工作顺序 5；workflow.md 同步与交付 |
| 仅一个离线入口，内嵌图片、图标、指南和许可 | workflow.md 第 4 节；bundle_html.py；独立断网验收 |
| 1440×900 与 390×844、24 张截图、无错误 | check_browser.cjs；quality-standard.md 完整验收清单 |
| 本地交付、旧版归档、授权后 GitHub 同步 | SKILL.md 最后两条约束；workflow.md 第 4–5 节 |

## 后续视频能力

| 要求 | 对应位置 |
|---|---|
| HTML 制作、验收与交付完成后，可按用户要求选做视频版 | SKILL.md 视频版；video-export.md |
| 可直接调用脚本导出整片与片段 | scripts/export_video.cjs |
| 保留原文案、顺序、动效，不默认配音配乐 | video-export.md 时间轴接口与交付；quality-standard.md 视频版 |
| 四种比例、720p / 1080p / 4K 与 30 / 60 / 120 fps 自由组合；本次不做验证 | export_video.cjs 预设参数；video_encode.swift 等比合成；video-export.md 参数表 |
| Mac 原生编码、可选 NVIDIA NVENC，不编造加速倍数 | video-export.md 硬件编码；video_encode.swift |
| 完整解码、逐屏抽帧、来源哈希与实际检查结果 | video_check.swift；export_video.cjs；quality-standard.md 交付验收 |

## 案例素材表

下列文件均来自该项目已经公开的 README 示例。技能仓库不附课程原件或截图副本。

| 阶段 | 文件 | 图注 |
|---|---|---|
| 课前 | notebook-translation.png | 03 · 中英对照笔记 |
| 课前 | showcase-01-courseware.png | 01 · 课件按周归档 |
| 平时 | showcase-02-assignment.png | 02 · 大作业要求核对 |
| 平时 | showcase-04-review-notes.png | 04 · 周度复习笔记 |
| 考前 | cheatsheet.png | 05 · 考前速记卡 |
| 考前 | showcase-06-transcripts.png | 06 · 课程信息汇总 |
| 自测 | quiz-locked.png | 模拟卷 · 交卷前 |
| 自测 | quiz-graded.png | 模拟卷 · 交卷后 |

图标为 Codex、Claude、DeepSeek、GLM、KIMI 和 Gemini（Antigravity）。KIMI 图标使用深色底，避免白色标记不可见。采用原图时记录各自来源与许可，不重新生成替代官方标识。

分镜里每个元素的具体入场秒数属于项目定稿数据；重排时整体移动该屏，不改该屏内部的入场秒数。工具脚本检查基础可观察行为，不能把未覆盖的人工验收项声称为自动通过。
