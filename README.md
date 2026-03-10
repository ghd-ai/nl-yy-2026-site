# 悬疑主题交互式生日网页（静态版）

本目录包含一个可直接运行的 **单页（SPA）** 悬疑解谜生日网页骨架，对应 `prompt.md` 的落地要点：

- 交互闸门（绕过浏览器自动播放限制）
- 6 关卡结构（观察/搜证 → 推理/解码）
- `localStorage` 断点续玩
- 三级提示 + 声望扣分 + 暴力破解惩罚
- 过关彩蛋视频（可选）+ 下一关预加载（可选）
- 内置生日歌旋律回退（未放音频也有音乐）

## 运行

推荐用本地静态服务器打开：

```powershell
cd E:\0204设计
python -m http.server 8000
```

然后浏览器访问：`http://localhost:8000/`

## 部署（让她随时点开）

这是纯静态站点，不需要后端、不需要数据库。把这些文件放到任意静态托管即可：

- **GitHub Pages**
  - 新建仓库 → 把本目录文件推上去
  - GitHub 仓库 `Settings` → `Pages` → 选择 `Deploy from a branch` → `main / (root)`
  - 等待部署完成后，会得到一个 `https://...` 的固定链接，直接发给她即可
- **Netlify**
  - 直接把整个目录拖拽上传（或绑定 Git 仓库自动部署）
- **Vercel**
  - 导入 Git 仓库，框架选 “Other / Static”，无需构建命令

建议用 `https` 访问：移动端（尤其微信/苹果）对音视频限制更严格，走 `https` 兼容性更好。
另外：多数浏览器会限制“自动播放”，通常需要用户第一次点一下页面后音乐才会响，这是正常现象。

## 自定义（最常用）

只需要改 `config.js`：

- `people.recipientName / senderName`：名字
- `people.recipientNickname / birthdayText`：昵称与生日文字
- `final.photoCount / final.photoPattern`：相册照片数量与路径模板（推荐，适合 20–30 张）
- （或）`final.galleryImages`：手动逐张配置相册图片路径
- `final.blessings`：祝福文案
- 每关的 `subtitle / data / solution / hints`：题面、答案、提示
- 每关 `assets.bgm / assets.video`：背景音乐与过关视频（可不填）

素材放到 `assets/`（见 `assets/README.md`）。
