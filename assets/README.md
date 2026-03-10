# assets 放什么？

这个网页是静态站点，不会自动生成素材。你需要把音频/视频/图片放在这里，并在 `config.js` 里填对应路径。

建议目录结构（可自行调整）：

- `assets/audio/bgm/menu.mp3`
- `assets/audio/bgm/case1.mp3` ... `case6.mp3`
- `assets/audio/bgm/warm.mp3`
- `assets/video/case1.mp4` ... `case6.mp4`
- `assets/img/photos/01.jpg` ...（配合 `config.js` 里的 `{NN}` 模板）

如果没有放素材，网页仍然可以通关；只是不会播放音乐/视频，相册图片会显示占位。

## 还没来得及准备音乐？

项目默认启用内置的“生日歌旋律”作为回退（不需要任何文件）：

- `config.js` → `media.fallbackBgm = "builtin:happy-birthday"`

等你把真正的 `menu.mp3 / case*.mp3 / warm.mp3` 放进来后，网页会优先播放你自己的音频文件。
