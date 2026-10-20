# 可选：HTML 完成后导出视频

先完成 HTML 制作、浏览器验收与交付。视频导出是这之后的可选步骤：用户要求视频版时，复用已验收的网页、文案、顺序和时间轴，导出本地 MP4。先明确输入版本；桌面旧版和工作区新版分别记录，不能把旧版视频称为新版。网页和视频是两份交付物，原网页的复制、放大等交互继续保留。

## 一条命令调用

需要 Node.js 18+、已安装的 Playwright / playwright-core 和 Chromium。可复用环境现有依赖，脚本不下载浏览器、不安装软件、不上传文件。macOS 原生编码需要可用的 Swift 编译器（Xcode Command Line Tools）；其他平台或显式选择 FFmpeg 编码时，需要可正常运行的 FFmpeg 和 FFprobe。

从技能仓库目录调用，输入建议使用已经验收的离线单文件：

```bash
node scripts/export_video.cjs --input /项目/项目介绍.html --output /项目/项目介绍.mp4 --module /依赖/playwright-core --browser /浏览器可执行文件
```

省略 `--module` 时从 Node 模块解析路径寻找 Playwright；省略 `--browser` 时使用该 Playwright 已安装的 Chromium。所有路径由当前环境提供，脚本不绑定作者机器。

默认导出整片：1920×1080、30 fps、H.264 MP4、约 8 Mbps 目标码率，无配音和配乐。默认自动选择 macOS 原生 AVFoundation；其他平台使用 FFmpeg 的 `libx264`。输出目录须已存在；已有 MP4、同名报告或检查目录时停止，避免覆盖。

先导出一小段检查版式和动效：

```bash
node scripts/export_video.cjs --input /项目/项目介绍.html --output /项目/预览.mp4 --start 25 --duration 10 --module /依赖/playwright-core --browser /浏览器可执行文件
```

`--start` 是源片秒数，`--duration` 是片段长度。实际输出取整为完整帧，时长误差最多半帧，报告同时记录请求长度、帧数和实际长度。不指定 `--duration` 时输出到原片结束。默认裁取 `#screen` 动画区域，移除网页外框；通过 `--selector`、`--viewport-width` 和 `--css` 适配其他布局。更改横竖屏比例时重新审阅排版，不能仅拉伸画面。

## NVIDIA 与 Mac 硬件编码

已有 NVIDIA 显卡的电脑可显式选择 NVENC：

```bash
node scripts/export_video.cjs --input /项目/项目介绍.html --output /项目/项目介绍-nvenc.mp4 --encoder nvenc --ffmpeg /工具/ffmpeg --ffprobe /工具/ffprobe --module /依赖/playwright-core --browser /浏览器可执行文件
```

NVENC 需要实际 GPU、驱动和支持 `h264_nvenc` 的 FFmpeg。指定后不可用就报错，不自动改成软件编码。macOS 可使用 `--encoder avfoundation --hardware require`，要求系统提供硬件编码；`prefer` 为默认，允许系统选择；`off` 禁止原生视频编码器使用硬件编码。FFmpeg 的 `--encoder videotoolbox` 同样要求硬件可用，`--encoder software` 明确使用 `libx264`。

硬件编码主要作用于 MP4 编码阶段。网页排版、逐帧捕获、JPEG 处理和传输仍有开销，不凭显卡型号宣称整体更快或虚构加速倍数。报告中的 `hardwareUsed`：原生 `prefer` 记为 `unknown`；`require` 成功才记为 true；NVENC / 强制 VideoToolbox 成功则记为 true。CPU/GPU 利用率没有采集就不声称已测。

报告的 `renderMs` 包含时间轴定位与画面捕获，`encodeBackpressureMs` 是向编码进程写入时的等待，`exportMs` 是该导出循环及编码收尾的耗时；它们不是 GPU 内核计时，也不含编译和完整解码验收。比较机器时用同一来源、片段、尺寸、帧率、码率和编码模式，同时检查画质。

技术依据：[NVIDIA Video Codec SDK](https://developer.nvidia.com/video-codec-sdk)、[Apple VideoToolbox](https://developer.apple.com/documentation/videotoolbox)。

## 新网页的确定性导出接口

新实现应在播放器闭包内暴露以下接口，复用现有唯一时间轴，不另写一套视频动画：

```js
window.htmlIntroVideo = {
  describe: () => ({
    duration: total,
    scenes: durations.map((seconds, i) => ({
      key: scenes[i].dataset.key, seconds
    }))
  }),
  seek(seconds) {
    // 以下变量来自播放器本身；按实际变量名接入。
    playing = false;
    pace.value = '1';
    pos = Math.max(0, Math.min(total, seconds));
    render(); // 同时定位入场、评分条、过渡箭头等全部效果
  }
};
```

`describe()` 返回总时长与按播放顺序排列的分镜；各屏 `seconds` 之和等于 `duration`。`seek()` 接受源片秒数，停止自动播放，并立即显示该时间点应有的画面，支持异步 Promise。接口不能恢复 CSS 或其他独立动画时钟。新页面有媒体元素时，在 `seek()` 中一并定位和等待媒体画面；当前脚本不录制网页音轨。

现有 oh-my-ntu film-v3 播放器可用兼容模式：脚本只截获名为 `tick` 的 requestAnimationFrame 回调，读取 `#screen[data-durations]`、`.scene` 和 `#pace`，按递增时间驱动原时钟，不写回 HTML。它不适用于任意网页；找不到接口或已知播放器结构时明确报错。用 `--clock api` 可要求新接口，用 `--clock legacy` 可显式选兼容模式。

默认 `--capture cdp` 通过 Chromium 截帧；`--capture playwright` 是显式兼容选项。两种方式均使用固定时间步长，不依赖实际播放和录屏速度。保留全部真实截图、隐私遮挡、字体、图标与许可，不自行改文案、增配音或选背景音乐。

## 自动验收与交付

导出成功会产生：

```text
项目介绍.mp4
项目介绍.video.json      来源文件名与 SHA-256、片段、参数、分镜、编码选项、耗时和视频哈希
项目介绍.checks/
  validation.json       全部帧解码、帧数、时间戳、时长、尺寸和抽帧数量
  scene-001.png         导出范围内每屏的一张抽帧
  ...
```

脚本等待编码退出，再完整解码视频并核对帧数、时长、尺寸、帧率与时间戳，按实际分镜抽帧。macOS 使用原生检查器；FFmpeg 路径使用 FFprobe 的逐帧解码。失败时不发布最终文件，删除本次临时编码产物；原 HTML 与已有交付物不变。中断时关闭本次独立浏览器和编码子进程。Swift 辅助程序按源码哈希缓存到当前用户临时目录，仓库只保留源码。

自动通过后 `visualReview` 仍为 `pending`。Agent 必须实际查看抽帧，重点检查密集安装页、评分数值、成品图原有遮挡、文字裁切和画面方向；再检查一段入场和过渡，确认不是只有静态翻页。没有检查的项标为未检查。最终交付文件路径、实际版本、分辨率、帧率、时长及声音状态；需要桌面副本时新增目录，复制后核对视频哈希。

视频制作不等于获得社交发布、外网托管或 GitHub 上传授权。同步技能时只提交通用脚本与标准，不提交用户视频、课程截图、原始资料或本地验收产物。

## 当前验证范围

本版本已在 macOS + Chrome 上验证既有 film-v3 的 1080p / 30 fps 片段导出、新接口的自定义尺寸与帧率、强制硬件编码、完整解码及分镜抽帧。另检查已有产物不被覆盖、编码器缺失时停止。Windows / Linux 与 NVIDIA NVENC 路径已提供代码和调用参数，尚未在对应硬件上实测，不能将 Mac 上的结果当成其性能数据。
