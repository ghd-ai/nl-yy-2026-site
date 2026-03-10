你现在这 5 张“静态 AI 图”，最顺滑的融入方式是：**把它们做成“过关前置片头卡（AI Interlude）”**——每关结案弹窗/结案过场里，在“播放彩蛋视频”按钮上方插入一张图；再用 **CSS 的 Ken Burns（缓慢推近/平移）+ 扫描线/光带** 让它“看起来在动”，但它本质仍是一张图，所以 **不卡、体积小、手机流量友好**。

下面给你一套“可直接丢给 AI 写代码”的完善方案（包含：config 怎么配、app.js 插哪里、CSS 怎么写、动效怎么做、每关怎么放）。

---

## 目标效果（你可以把这段当需求描述）
1. 前 5 关通关后，出现原有结案过场（文字/奖励）不变。
2. 在每关“播放彩蛋视频”之前，新增一个模块：
   - 标题：`AI 小剧场：xxx`
   - 一张 AI 静态图（16:9）
   - 图上有轻微动效：**慢慢推近 + 轻微平移（Ken Burns）**，叠加 **扫描线/光带/微粒闪动**（根据关卡选择不同 fx）。
3. 若用户在设置里打开 `减少动效 reduceMotion`，这些动效全部停掉，图仍正常显示。
4. 若用户打开 `跳过过关彩蛋 skipRewards`，这块也一起跳过（沿用你现有逻辑）。
5. 以后第 6 关要换视频：同一套 interlude 模块支持 `type:"video"`（静音自动播放 loop）。

---

## 第一步：把 5 张图放到固定路径（建议）
建议你统一放这里，文件名全英文数字，减少路径编码坑：

- `assets/ai/interlude/case1.webp`
- `assets/ai/interlude/case2.webp`
- `assets/ai/interlude/case3.webp`
- `assets/ai/interlude/case4.webp`
- `assets/ai/interlude/case5.webp`

格式建议 WebP（或 AVIF），尺寸建议：
- 1600×900 或 1920×1080
- 每张尽量压到 200KB–600KB（手机流量体验会非常明显）

---

## 第二步：在 `config.js` 给每关加 `assets.interlude`
你现在每关已经有 `assets: { bgm, video }`，直接加一个 `interlude` 对象即可。

示例（每关都照这个结构写）：

```js
assets: {
  bgm: "...",
  video: "...",
  interlude: {
    type: "image",                         // 先都是 image
    src: "assets/ai/interlude/case1.webp", // 你的AI图路径
    title: "AI 小剧场：许愿光回收",
    text: "WISHLIGHT TRACE · LOCKED",
    fx: "scan"                              // 可选：scan | holo | uv | sparkle
  }
}
```

我建议你 5 关的 fx 分配：
- case1：`scan`（证据扫描）
- case2：`holo`（全息闪光）
- case3：`uv`（紫外扫光）
- case4：`scan`（检视台扫光）
- case5：`sparkle`（星光微粒）

> `title/text/fx` 都是可选字段，不写也能用。

---

## 第三步：app.js 新增一个“AI interlude 渲染器”，再把它插到 5 关结案 UI 里

### 3.1 在 app.js 里新增这 2 个函数（放在 `renderVideo()` 附近最合适）
你已经有 `escapeHtml/escapeAttr`、`makeCase2Rng()` 这些工具函数，下面代码会用到它们。

把这段放到 `renderVideo(caseDef)` 函数下面（或上面，保证同作用域即可）：

```js
function getCaseInterlude(caseDef) {
  const it = caseDef?.assets?.interlude;
  if (!it || typeof it !== "object") return null;
  const type = String(it.type || "image").trim().toLowerCase();
  const src = String(it.src || "").trim();
  if (!src) return null;
  const fx = String(it.fx || "").trim().toLowerCase(); // scan | holo | uv | sparkle
  return {
    type: type === "video" ? "video" : "image",
    src,
    title: String(it.title || "AI 小剧场").trim(),
    text: String(it.text || "").trim(),
    poster: String(it.poster || "").trim(),
    fx,
  };
}

function renderCaseInterlude(caseDef, opts = {}) {
  const it = getCaseInterlude(caseDef);
  if (!it) return "";

  // stable random motion vars (same case => same motion)
  const rng = typeof makeCase2Rng === "function"
    ? makeCase2Rng(`interlude:${String(caseDef?.id || "")}:${it.src}`)
    : Math.random;

  const ox = (25 + rng() * 50).toFixed(1);     // 25%..75%
  const oy = (28 + rng() * 44).toFixed(1);     // 28%..72%
  const fromS = (1.01 + rng() * 0.03).toFixed(3);
  const toS = (1.06 + rng() * 0.05).toFixed(3);
  const fromX = ((rng() * 2 - 1) * 2.2).toFixed(2);
  const toX = ((rng() * 2 - 1) * 2.2).toFixed(2);
  const fromY = ((rng() * 2 - 1) * 1.6).toFixed(2);
  const toY = ((rng() * 2 - 1) * 1.6).toFixed(2);
  const dur = Math.round(5200 + rng() * 2600); // 5200..7800ms

  const compact = !!opts.compact;
  const variant = String(opts.variant || "").trim(); // 可选：paper 等
  const cls = `ai-interlude${compact ? " ai-interlude--compact" : ""}${variant ? ` ai-interlude--${variant}` : ""}`;

  const motionStyle = [
    `--kb-ox:${ox}%`,
    `--kb-oy:${oy}%`,
    `--kb-from-s:${fromS}`,
    `--kb-to-s:${toS}`,
    `--kb-from-x:${fromX}%`,
    `--kb-to-x:${toX}%`,
    `--kb-from-y:${fromY}%`,
    `--kb-to-y:${toY}%`,
    `--kb-dur:${dur}ms`,
  ].join(";");

  const media =
    it.type === "video"
      ? `
        <video class="ai-interlude__media"
          src="${escapeAttr(it.src)}"
          ${it.poster ? `poster="${escapeAttr(it.poster)}"` : ""}
          muted playsinline loop autoplay preload="metadata"></video>
      `
      : `
        <img class="ai-interlude__media"
          src="${escapeAttr(it.src)}"
          alt="${escapeAttr(it.title || "AI 插画")}"
          loading="eager" decoding="async" />
      `;

  const fxAttr = it.fx ? ` data-fx="${escapeAttr(it.fx)}"` : "";

  return `
    <div class="${cls}">
      <div class="ai-interlude__head">
        <span class="badge">AI</span>
        <div class="mono ai-interlude__title">${escapeHtml(it.title || "")}</div>
      </div>

      <div class="ai-interlude__frame vhs" style="${escapeAttr(motionStyle)}"${fxAttr}>
        ${media}
        <div class="ai-interlude__glow" aria-hidden="true"></div>
      </div>

      ${it.text ? `<div class="ai-interlude__text mono">${escapeHtml(it.text)}</div>` : ""}
    </div>
  `;
}
```

> 这段做了两件关键事：
> - **统一读取** `caseDef.assets.interlude`
> - 给图片生成一组**稳定的随机动效参数**（同一关每次看都差不多，不会乱跳）

---

## 第四步：把 interlude 插进“每关播放视频按钮之前”
你现在 5 关的结案界面分两种：
- case1/2/3/5：走各自 cinematic 的 message/letter 页面
- case4：走通用 modal（`completeCase()` 里那段 `openOverlayHtml(...)`）

下面是最少改动的插入点。

### 4.1 Case4（通用 modal）——最简单
在 `completeCase(caseDef, revealText)` 里，你的通用弹窗 HTML 目前是：

```js
${renderRewardText(caseDef)}
${renderCompletionFx(caseDef)}
${renderVideo(caseDef)}
```

改成：

```js
${renderRewardText(caseDef)}
${renderCompletionFx(caseDef)}
${renderCaseInterlude(caseDef)}
${renderVideo(caseDef)}
```

这样 case4 立刻会在视频前出现 AI 图。

---

### 4.2 Case1（letter 页）
在 `renderCase1CinematicLetter(caseDef, info, revealText)` 的模板里，找到这段结构：

```html
<div class="letter-card__meta">...</div>
<div class="letter-card__actions">...</div>
```

在 meta 和 actions 中间插入（建议 compact 关掉，让它大一点）：

```js
${renderCaseInterlude(caseDef)}
```

---

### 4.3 Case2（mp-message 页）
`mp-message-card` 高度比较紧，我建议用 compact 版本，避免手机上整张卡被图片撑满。

在 `renderCase2CinematicMessage(caseDef, revealText)` 里，放在 actions 之前：

```js
${renderCaseInterlude(caseDef, { compact: true })}
```

---

### 4.4 Case3（wish-message 页，白底纸张风格）
建议用 `variant:"paper"`（下面 CSS 我会给白底适配）。

在 `renderCase3CinematicMessage(caseDef, revealText)` 里，你的 `.wish-card` 内部放到 actions 之前：

```js
${renderCaseInterlude(caseDef, { variant: "paper" })}
```

---

### 4.5 Case5（case5-garden message 页）
`renderCase5CinematicMessage(caseDef, revealText)` 里，把它放到滚动区 `.case5-caption__scroll` 里、在文字前面：

```js
${renderCaseInterlude(caseDef, { compact: true })}
```

---

## 第五步：styles.css 写“让照片动起来”的核心动效（Ken Burns + FX）
你问的“让照片动起来”本质就是：

- **对 `<img>` 做 transform 动画**（scale + translate），视觉上像一个短视频在推镜头
- 再叠加一层 **扫描线、光带、微粒**，增加“动态质感”

把下面这段 CSS 追加到 `styles.css` 最后即可：

```css
.ai-interlude{
  margin-top: 12px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 16px;
  padding: 12px;
  background: rgba(0,0,0,.14);
}

.ai-interlude__head{
  display:flex;
  gap:10px;
  align-items:center;
  justify-content:flex-start;
}

.ai-interlude__title{
  opacity:.88;
  font-size:12px;
  letter-spacing:.2px;
}

.ai-interlude__frame{
  margin-top: 10px;
  border-radius: 14px;
  overflow:hidden;
  position: relative;
  /* 关键：给一个稳定的画面比例 */
  aspect-ratio: 16 / 9;
  background: rgba(0,0,0,.25);
}

.ai-interlude--compact .ai-interlude__frame{
  /* 手机/小卡片用 */
  aspect-ratio: 16 / 9;
  max-height: min(200px, 26vh);
}

.ai-interlude__media{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;

  /* Ken Burns：慢推近+平移 */
  transform-origin: var(--kb-ox, 50%) var(--kb-oy, 45%);
  transform: translate3d(var(--kb-from-x, 0%), var(--kb-from-y, 0%), 0) scale(var(--kb-from-s, 1.02));
  will-change: transform;
}

body:not(.reduce-motion) .ai-interlude__media{
  animation: ai-kenburns var(--kb-dur, 6500ms) ease-in-out infinite alternate;
}

@keyframes ai-kenburns{
  from{
    transform: translate3d(var(--kb-from-x, 0%), var(--kb-from-y, 0%), 0) scale(var(--kb-from-s, 1.02));
  }
  to{
    transform: translate3d(var(--kb-to-x, 0%), var(--kb-to-y, 0%), 0) scale(var(--kb-to-s, 1.08));
  }
}

/* 叠一层“光晕+轻微漂移”，让静态图更像在呼吸 */
.ai-interlude__glow{
  position:absolute;
  inset:-20%;
  pointer-events:none;
  opacity:.18;
  background:
    radial-gradient(circle 380px at 20% 20%, rgba(139,233,253,.22), transparent 62%),
    radial-gradient(circle 420px at 80% 60%, rgba(255,121,198,.18), transparent 64%);
  filter: blur(10px);
}

body:not(.reduce-motion) .ai-interlude__glow{
  animation: ai-glow 7.2s ease-in-out infinite;
}

@keyframes ai-glow{
  0%,100%{ transform: translateY(0); opacity:.16; }
  50%{ transform: translateY(10px); opacity:.22; }
}

.ai-interlude__text{
  margin-top: 10px;
  color: rgba(226,232,240,.78);
  line-height: 1.7;
  font-size: 12px;
}

/* —— 可选 FX：按 data-fx 不同叠加不同“动态质感” —— */

/* scan：一条扫描光带 */
.ai-interlude__frame[data-fx="scan"]::after{
  content:"";
  position:absolute;
  left:-20%;
  right:-20%;
  top:-60%;
  height:42%;
  pointer-events:none;
  background: linear-gradient(180deg, transparent, rgba(139,233,253,.10), transparent);
  opacity:.35;
  animation: ai-scan 3.6s linear infinite;
}
@keyframes ai-scan{
  from{ transform: translateY(0); }
  to{ transform: translateY(220%); }
}

/* holo：斜向全息闪光 */
.ai-interlude__frame[data-fx="holo"]::after{
  content:"";
  position:absolute;
  inset:-20%;
  pointer-events:none;
  background: linear-gradient(135deg, rgba(255,255,255,.0) 35%, rgba(255,214,240,.18) 50%, rgba(255,255,255,0) 65%);
  opacity:.28;
  animation: ai-holo 2.8s ease-in-out infinite;
}
@keyframes ai-holo{
  0%,100%{ transform: translateX(-12%) translateY(6%); opacity:.18; }
  50%{ transform: translateX(10%) translateY(-6%); opacity:.32; }
}

/* uv：紫外“光斑”移动（更像扫描） */
.ai-interlude__frame[data-fx="uv"]::after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background: radial-gradient(circle 140px at var(--uvx, 30%) var(--uvy, 45%),
    rgba(189,147,249,.22), rgba(139,233,253,.10) 45%, rgba(0,0,0,0) 70%);
  mix-blend-mode: screen;
  opacity:.55;
  animation: ai-uv 3.4s ease-in-out infinite;
}
@keyframes ai-uv{
  0%{ --uvx: 22%; --uvy: 48%; }
  50%{ --uvx: 72%; --uvy: 42%; }
  100%{ --uvx: 22%; --uvy: 48%; }
}

/* sparkle：星光点点闪 */
.ai-interlude__frame[data-fx="sparkle"]::after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px),
    radial-gradient(rgba(189,147,249,.9) 1px, transparent 1px),
    radial-gradient(rgba(139,233,253,.9) 1px, transparent 1px);
  background-size: 140px 140px, 220px 220px, 320px 320px;
  background-position: 10px 18px, 70px 90px, 20px 120px;
  opacity:.10;
}
body:not(.reduce-motion) .ai-interlude__frame[data-fx="sparkle"]::after{
  animation: ai-stars 8.8s linear infinite;
}
@keyframes ai-stars{
  from{ transform: translateY(0); }
  to{ transform: translateY(40px); }
}

/* paper 变体：给白底卡片更“证物” */
.ai-interlude--paper{
  background: rgba(0,0,0,.03);
  border-color: rgba(0,0,0,.10);
}
.ai-interlude--paper .ai-interlude__text{
  color: rgba(15,23,42,.72);
}
```

> 这就是“让静态照片动起来”的操作：**不做视频**，用 CSS 让它像视频一样在缓慢推镜头 + 叠动态质感层。

---

## 给你一段可以直接丢给 AI 写代码的“指令稿”
你把下面整段发给你常用的代码 AI，它就能按你的项目结构去改：

> 请在一个静态网页项目中实现“通关后 AI 小剧场插图（静态图但带动效）”。项目已有 `app.js / config.js / styles.css`，并且通关逻辑在 `completeCase(caseDef, revealText)`；case1/2/3/5 有各自 cinematic success 视图（`renderCase1CinematicLetter`、`renderCase2CinematicMessage`、`renderCase3CinematicMessage`、`renderCase5CinematicMessage`），case4 走通用 `openOverlayHtml` 弹窗。
> 需求：
> 1) 在 `config.js` 中为 case1~case5 的 `assets` 增加 `interlude` 字段：`{type:"image", src, title, text, fx}`。
> 2) 在 `app.js` 新增 `getCaseInterlude(caseDef)` 与 `renderCaseInterlude(caseDef, opts)`，读取 `caseDef.assets.interlude` 并渲染 HTML（含 `.ai-interlude`、`.ai-interlude__frame.vhs`、`.ai-interlude__media`）。用稳定随机参数生成 CSS 变量 `--kb-*` 做 Ken Burns 动效。
> 3) 插入点：
> - 通用弹窗：在 `${renderVideo(caseDef)}` 之前插入 `${renderCaseInterlude(caseDef)}`
> - case1 letter：在 `.letter-card__meta` 与 `.letter-card__actions` 之间插入 `${renderCaseInterlude(caseDef)}`
> - case2 mp-message：在 `.mp-message-card__actions` 之前插入 `${renderCaseInterlude(caseDef,{compact:true})}`
> - case3 wish-message：在 `.wish-card__actions` 之前插入 `${renderCaseInterlude(caseDef,{variant:"paper"})}`
> - case5 garden：在 `.case5-caption__scroll` 内部插入 `${renderCaseInterlude(caseDef,{compact:true})}`
> 4) 在 `styles.css` 新增 `.ai-interlude` 样式与动效：Ken Burns（scale+translate），并支持 `data-fx="scan|holo|uv|sparkle"` 的伪元素动画。`body.reduce-motion` 时禁用所有动画。
> 5) 输出修改后的三个文件内容或 patch/diff，确保不破坏现有功能。

---

如果你把你那 5 张图片的实际路径/文件名（你存在哪个目录、是什么后缀）贴一下，我可以按你真实路径把 `config.js` 的 5 段 `interlude` 配置直接给你写成可复制粘贴版本，并顺手给每关配一条更贴合你文案的 `title/text`。