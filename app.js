(function () {
  "use strict";

  const CONFIG = window.MYSTERY_BIRTHDAY_CONFIG;
  const viewEl = document.getElementById("view");
  const overlayEl = document.getElementById("overlay");
  const toastEl = document.getElementById("toast");

  const brandTitleEl = document.getElementById("brandTitle");
  const brandSubtitleEl = document.getElementById("brandSubtitle");
  const scoreValueEl = document.getElementById("scoreValue");
  const audioNowEl = document.getElementById("audioNow");
  const audioTrackEl = document.getElementById("audioTrack");
  const audioTimeEl = document.getElementById("audioTime");
  const audioProgressEl = document.getElementById("audioProgress");
  const btnAudioEl = document.getElementById("btnAudio");
  const btnSettingsEl = document.getElementById("btnSettings");
  const btnResetEl = document.getElementById("btnReset");

  if (!CONFIG) {
    if (viewEl) viewEl.textContent = "缺少 config.js：window.MYSTERY_BIRTHDAY_CONFIG 未定义。";
    return;
  }

  document.title = CONFIG.meta?.title || document.title;
  if (brandTitleEl) brandTitleEl.textContent = CONFIG.meta?.title || "零点档案";
  if (brandSubtitleEl) brandSubtitleEl.textContent = CONFIG.meta?.subtitle || "悬疑主题 · 生日特别篇";

  const STORAGE_KEY = CONFIG.storageKey || "mystery_birthday_v1";

  let state = normalizeLoadedState(loadState()) || initState();
  let activeInterval = null;
  let activeHold = null;
  let overlayScrollLock = null;

  const audio = createAudioManager();
  observeMediaPlayback();
  window.setInterval(syncTopbar, 500);
  document.addEventListener("visibilitychange", syncTopbar);

  if (btnAudioEl) {
    btnAudioEl.addEventListener("click", async () => {
      if (!state.audio?.unlocked) {
        toast("先点击“接受委托”解锁音轨。");
        return;
      }
      state.audio.muted = !state.audio.muted;
      persist();
      audio.sync();
      syncTopbar();
      toast(state.audio.muted ? "已静音" : "已开启音乐");
    });
  }

  if (btnResetEl) {
    btnResetEl.addEventListener("click", () => {
      const ok = window.confirm("确定要重置进度吗？（会清空关卡与声望）");
      if (!ok) return;
      stopActiveWork();
      state = initState();
      persist();
      document.body.classList.remove("warm");
      audio.stop();
      syncTopbar();
      renderGate();
    });
  }

  if (btnSettingsEl) {
    btnSettingsEl.addEventListener("click", () => openSettings());
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayEl && !overlayEl.classList.contains("hidden")) closeOverlay();
  });

  applySettings();
  syncTopbar();
  routeToInitialView();
  armFirstGestureAudioStart();

  function initState() {
    const vol = Number(CONFIG.settings?.volume);
    return {
      version: 1,
      hasPassedGate: false,
      points: CONFIG.scoring?.startPoints ?? 100,
      completedCaseIds: [],
      perCase: {},
      warmMode: false,
      audio: { unlocked: false, muted: false },
      fx: { dawnShown: false, finalReelShown: false },
      settings: {
        volume: Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.7,
        subtitles: CONFIG.settings?.subtitles ?? true,
        reduceMotion: CONFIG.settings?.reduceMotion ?? false,
        skipRewards: CONFIG.settings?.skipRewards ?? false,
      },
      route: { name: "gate", caseId: null },
    };
  }

  function normalizeLoadedState(s) {
    if (!s || typeof s !== "object") return null;
    if (s.version !== 1) return null;
    const base = initState();
    const out = {
      ...base,
      ...s,
      completedCaseIds: Array.isArray(s.completedCaseIds) ? s.completedCaseIds : [],
      perCase: s.perCase && typeof s.perCase === "object" ? s.perCase : {},
      audio: { ...base.audio, ...(s.audio || {}) },
      fx: { ...(base.fx || {}), ...((s.fx && typeof s.fx === "object" ? s.fx : {}) || {}) },
      settings: { ...base.settings, ...(s.settings || {}) },
      route: s.route && typeof s.route === "object" ? s.route : base.route,
    };
    // Migration: older builds used MOON13; keep user progress but update the passphrase.
    const oldPass = String(out.perCase?.case2?.data?.passphrase || "").trim();
    if (oldPass === "MOON13") {
      out.perCase.case2 = out.perCase.case2 && typeof out.perCase.case2 === "object" ? out.perCase.case2 : {};
      out.perCase.case2.data =
        out.perCase.case2.data && typeof out.perCase.case2.data === "object" ? out.perCase.case2.data : {};
      out.perCase.case2.data.passphrase = "MOON22";
    }
    return out;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function stopActiveWork() {
    if (activeInterval) {
      window.clearInterval(activeInterval);
      activeInterval = null;
    }
    if (activeHold) {
      activeHold.stop();
      activeHold = null;
    }
  }

  function lockScrollForOverlay() {
    if (overlayScrollLock) return;
    const y = window.scrollY || 0;
    const x = window.scrollX || 0;
    const scrollbarW = Math.max(0, window.innerWidth - (document.documentElement?.clientWidth || window.innerWidth));
    overlayScrollLock = { x, y, paddingRight: document.body.style.paddingRight || "" };
    document.body.classList.add("overlay-lock");
    document.body.style.position = "fixed";
    document.body.style.top = `-${y}px`;
    document.body.style.left = `-${x}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    if (scrollbarW) document.body.style.paddingRight = `${scrollbarW}px`;
  }

  function unlockScrollForOverlay() {
    if (!overlayScrollLock) return;
    const { x, y, paddingRight } = overlayScrollLock;
    overlayScrollLock = null;
    document.body.classList.remove("overlay-lock");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.paddingRight = paddingRight;
    window.scrollTo(x, y);
  }

  function applySettings() {
    state.settings = state.settings || {};
    const vol = Number(state.settings.volume);
    state.settings.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.7;
    state.settings.subtitles = state.settings.subtitles ?? true;
    state.settings.reduceMotion = !!state.settings.reduceMotion;
    state.settings.skipRewards = !!state.settings.skipRewards;

    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
    audio.applyVolume?.();
    persist();
  }

  function syncTopbar() {
    if (scoreValueEl) scoreValueEl.textContent = String(state.points ?? 0);
    if (btnAudioEl) {
      if (!state.audio?.unlocked) btnAudioEl.textContent = "音乐";
      else btnAudioEl.textContent = state.audio?.muted ? "开启音乐" : "关闭音乐";
    }
    const status = audio.getStatus?.() || {};
    const locked = !state.audio?.unlocked;
    const muted = !!state.audio?.muted;
    const total = Math.max(0, Number(status.playlistTotal) || 0);
    const idx = Math.max(0, Number(status.playlistIndex) || 0);
    let label = "点击“接受委托”后开启";
    let timeText = "--:-- / --:--";
    let progress = 0;

    if (!locked) {
      const current = Number(status.currentTime);
      const duration = Number(status.duration);
      const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

      label = String(status.label || "").trim() || "等待播放";
      if (total > 1 && idx > 0) label += ` · ${idx}/${total}`;
      if (muted) label += " · 已静音";

      if (safeDuration > 0) {
        timeText = `${formatClock(safeCurrent)} / ${formatClock(safeDuration)}`;
        progress = Math.max(0, Math.min(100, (safeCurrent / safeDuration) * 100));
      } else if (status.playing) {
        timeText = `${formatClock(safeCurrent)} / --:--`;
      } else if (muted) {
        timeText = "静音中";
      }
    }

    if (audioNowEl) audioNowEl.classList.toggle("is-muted", muted);
    if (audioTrackEl) audioTrackEl.textContent = label;
    if (audioTimeEl) audioTimeEl.textContent = timeText;
    if (audioProgressEl) audioProgressEl.style.width = `${progress.toFixed(1)}%`;
  }

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    window.clearTimeout(toastEl.__t);
    toastEl.__t = window.setTimeout(() => toastEl.classList.add("hidden"), 2400);
  }

  function flashDanger() {
    if (state.settings?.reduceMotion) return;
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;
    topbar.classList.remove("flash");
    // eslint-disable-next-line no-unused-expressions
    topbar.offsetWidth;
    topbar.classList.add("flash");
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (ch) => {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === '"') return "&quot;";
      return "&#39;";
    });
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/\n/g, " ");
  }

  function drawCase1BoardLines(selectedIds) {
    const board = document.getElementById("case1Board");
    const svg = document.getElementById("case1Lines");
    if (!board || !svg) return;
    const rect = board.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const pts = (Array.isArray(selectedIds) ? selectedIds : [])
      .map((id) => {
        const el = board.querySelector(`[data-ev="${String(id)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
      })
      .filter(Boolean);

    if (pts.length < 2) {
      svg.innerHTML = "";
      return;
    }

    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const circles = pts.map((p) => `<circle cx="${escapeAttr(p.x.toFixed(1))}" cy="${escapeAttr(p.y.toFixed(1))}" r="4.1"></circle>`).join("");
    svg.innerHTML = `
      <path class="glow" d="${escapeAttr(d)}"></path>
      <path class="main" d="${escapeAttr(d)}"></path>
      ${circles}
    `;
  }

  function normalize(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();
  }

  function sleep(ms) {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  function createHappyBirthdaySynthBgm() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const NOTES = {
      C4: 261.63,
      D4: 293.66,
      E4: 329.63,
      F4: 349.23,
      G4: 392.0,
      A4: 440.0,
      B4: 493.88,
      C5: 523.25,
      D5: 587.33,
      E5: 659.25,
      F5: 698.46,
      G5: 783.99,
    };

    const Q = 0.48; // quarter note (sec) - slightly slower / more BGM-like
    const E = Q / 2;
    const H = Q * 2;

    const seq = [
      // Happy birthday to you
      { f: NOTES.G4, d: E },
      { f: NOTES.G4, d: E },
      { f: NOTES.A4, d: Q },
      { f: NOTES.G4, d: Q },
      { f: NOTES.C5, d: Q },
      { f: NOTES.B4, d: H },
      { f: 0, d: E },
      // Happy birthday to you
      { f: NOTES.G4, d: E },
      { f: NOTES.G4, d: E },
      { f: NOTES.A4, d: Q },
      { f: NOTES.G4, d: Q },
      { f: NOTES.D5, d: Q },
      { f: NOTES.C5, d: H },
      { f: 0, d: E },
      // Happy birthday dear ...
      { f: NOTES.G4, d: E },
      { f: NOTES.G4, d: E },
      { f: NOTES.G5, d: Q },
      { f: NOTES.E5, d: Q },
      { f: NOTES.C5, d: Q },
      { f: NOTES.B4, d: Q },
      { f: NOTES.A4, d: H },
      { f: 0, d: E },
      // Happy birthday to you
      { f: NOTES.F5, d: E },
      { f: NOTES.F5, d: E },
      { f: NOTES.E5, d: Q },
      { f: NOTES.C5, d: Q },
      { f: NOTES.D5, d: Q },
      { f: NOTES.C5, d: H },
      { f: 0, d: H },
    ];

    let ctx = null;
    let masterGain = null;
    let osc = null;
    let noteGain = null;
    let loopTimer = null;
    let running = false;
    let volume = 0;

    const clamp01 = (n) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return 0;
      return Math.max(0, Math.min(1, x));
    };

    function ensure() {
      if (!AudioContextCtor) return false;
      if (ctx && masterGain) return true;
      ctx = new AudioContextCtor();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
      return true;
    }

    function setVolume(v) {
      volume = clamp01(v);
      if (masterGain) masterGain.gain.value = volume;
    }

    function stop() {
      running = false;
      if (loopTimer) window.clearTimeout(loopTimer);
      loopTimer = null;
      try {
        noteGain?.disconnect();
      } catch {
        // ignore
      }
      noteGain = null;
      if (osc) {
        try {
          osc.stop();
        } catch {
          // ignore
        }
        try {
          osc.disconnect();
        } catch {
          // ignore
        }
      }
      osc = null;
    }

    function scheduleOnce(startAt) {
      if (!ctx || !osc || !noteGain) return startAt;
      const attack = 0.01;
      const release = 0.09;
      let t = startAt;
      for (const ev of seq) {
        const end = t + ev.d;
        if (!ev.f) {
          noteGain.gain.setValueAtTime(0, t);
          t = end;
          continue;
        }
        osc.frequency.setValueAtTime(ev.f, t);
        noteGain.gain.setValueAtTime(0, t);
        noteGain.gain.linearRampToValueAtTime(1, t + attack);
        noteGain.gain.linearRampToValueAtTime(0, Math.max(t + attack, end - release));
        noteGain.gain.setValueAtTime(0, end);
        t = end;
      }
      return t;
    }

    function scheduleLoop() {
      if (!running || !ctx || !osc || !noteGain) return;
      const now = ctx.currentTime;
      const startAt = now + 0.05;
      const endAt = scheduleOnce(startAt);
      const delayMs = Math.max(0, (endAt - now) * 1000);
      loopTimer = window.setTimeout(scheduleLoop, Math.max(200, Math.floor(delayMs)));
    }

    async function start() {
      if (running) return;
      if (!ensure()) throw new Error("AudioContext not supported");
      try {
        await ctx.resume();
      } catch {
        // ignore
      }

      stop();
      running = true;

      osc = ctx.createOscillator();
      osc.type = "triangle";
      noteGain = ctx.createGain();
      noteGain.gain.value = 0;
      osc.connect(noteGain);
      noteGain.connect(masterGain);
      masterGain.gain.value = volume;
      osc.start();
      scheduleLoop();
    }

    function isRunning() {
      return running;
    }

    return { start, stop, setVolume, isRunning };
  }

  function createAudioManager() {
    let bgmSeq = 0;
    let bgm = new Audio();
    bgm.loop = true;
    bgm.preload = "auto";
    bgm.volume = 0;
    bgm.autoplay = false;
    bgm.playsInline = true;

    const builtinHappy = createHappyBirthdaySynthBgm();
    let activeBackend = "audio"; // "audio" | "builtin"
    let activeBuiltinName = "";
    let activeAudioSrc = "";

    let currentVolume = 0;
    let fadeSeq = 0;
    let targetTrack = null;
    let playlist = [];
    let playlistIndex = 0;
    let playlistEnabled = false;
    let warnedPlaylistSkip = false;
    let playlistFadeTimer = null;
    let playlistFadeArmedFor = "";
    let playlistAdvanceTimer = null;
    let volumeGuardTimer = null;
    let volumeGuardFor = "";
    let playlistKickTimerA = null;
    let playlistKickTimerB = null;
    let playlistKickSeq = 0;
    let playlistWatchdogTimer = null;
    const cache = new Map();
    const BGM_MAX = 0.35;
    let duck = 1;
    let videoDuck = 1;
    let suspended = false;
    let warnedFallback = false;
    let warnedAutoplay = false;

    function handleBgmError() {
      if (!state.audio?.unlocked || state.audio?.muted) return;
      if (isPlaylistActive()) {
        if (!warnedPlaylistSkip) {
          warnedPlaylistSkip = true;
          toast("有一首音乐没加载成功：自动切到下一首。");
        }
        advancePlaylist(1);
        return;
      }
      const fallback = String(CONFIG.media?.fallbackBgm || "").trim();
      if (!fallback) return;
      if (targetTrack === fallback) return;
      if (!warnedFallback) {
        warnedFallback = true;
        toast("未找到音乐素材：先用内置生日歌（可在 assets/ 里替换）。");
      }
      targetTrack = fallback;
      void tryStart(fallback);
    }

    function handleBgmEnded() {
      if (!state.audio?.unlocked || state.audio?.muted) return;
      if (!isPlaylistActive()) return;
      clearPlaylistAdvance();
      playlistAdvanceTimer = window.setTimeout(() => {
        playlistAdvanceTimer = null;
        advancePlaylist(1);
      }, 60);
    }

    function attachBgmListeners(el, seq) {
      el.addEventListener("error", () => {
        if (seq !== bgmSeq) return;
        handleBgmError();
      });
      el.addEventListener("ended", () => {
        if (seq !== bgmSeq) return;
        handleBgmEnded();
      });
      el.addEventListener("playing", () => {
        if (seq !== bgmSeq) return;
        warnedAutoplay = false;
      });
    }

    function recycleBgm(loopValue = true) {
      const old = bgm;
      bgm = new Audio();
      bgm.loop = !!loopValue;
      bgm.preload = "auto";
      bgm.volume = 0;
      bgm.autoplay = false;
      bgm.playsInline = true;
      attachBgmListeners(bgm, ++bgmSeq);
      if (!old || old === bgm) return bgm;
      try {
        old.pause();
      } catch {
        // ignore
      }
      try {
        old.removeAttribute("src");
      } catch {
        // ignore
      }
      try {
        while (old.firstChild) old.removeChild(old.firstChild);
      } catch {
        // ignore
      }
      try {
        old.load();
      } catch {
        // ignore
      }
      return bgm;
    }

    attachBgmListeners(bgm, ++bgmSeq);

    function normalizeSrc(v) {
      return String(v || "").trim();
    }

    function normalizePlaylist(list) {
      if (!Array.isArray(list)) return [];
      return list.map(normalizeSrc).filter(Boolean);
    }

    function isPlaylistActive() {
      return playlistEnabled && Array.isArray(playlist) && playlist.length > 0;
    }

    function isSamePlaylist(next) {
      if (!isPlaylistActive()) return false;
      if (!Array.isArray(next) || next.length !== playlist.length) return false;
      for (let i = 0; i < next.length; i++) if (next[i] !== playlist[i]) return false;
      return true;
    }

    function clearPlaylist() {
      playlist = [];
      playlistIndex = 0;
      playlistEnabled = false;
      bgm.loop = true;
      warnedPlaylistSkip = false;
      clearPlaylistFade();
      clearPlaylistAdvance();
      clearVolumeGuard();
      clearPlaylistKick();
      clearPlaylistWatchdog();
    }

    function clearPlaylistFade() {
      if (playlistFadeTimer) window.clearTimeout(playlistFadeTimer);
      playlistFadeTimer = null;
      playlistFadeArmedFor = "";
    }

    function clearPlaylistAdvance() {
      if (playlistAdvanceTimer) window.clearTimeout(playlistAdvanceTimer);
      playlistAdvanceTimer = null;
    }

    function clearVolumeGuard() {
      if (volumeGuardTimer) window.clearTimeout(volumeGuardTimer);
      volumeGuardTimer = null;
      volumeGuardFor = "";
    }

    function clearPlaylistKick() {
      if (playlistKickTimerA) window.clearTimeout(playlistKickTimerA);
      if (playlistKickTimerB) window.clearTimeout(playlistKickTimerB);
      playlistKickTimerA = null;
      playlistKickTimerB = null;
      playlistKickSeq += 1;
    }

    function clearPlaylistWatchdog() {
      if (playlistWatchdogTimer) window.clearInterval(playlistWatchdogTimer);
      playlistWatchdogTimer = null;
    }

    function kickPlaylist(src) {
      clearPlaylistKick();
      if (!isPlaylistActive()) return;
      if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
      const s = normalizeSrc(src || targetTrack);
      if (!s) return;
      const seq = playlistKickSeq;

      const retry = () => {
        if (seq !== playlistKickSeq) return;
        if (!isPlaylistActive()) return;
        if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
        if (targetTrack !== s) return;
        void tryStart(s);
      };

      playlistKickTimerA = window.setTimeout(retry, 260);
      playlistKickTimerB = window.setTimeout(retry, 920);
    }

    function armPlaylistWatchdog() {
      clearPlaylistWatchdog();
      if (!isPlaylistActive()) return;
      playlistWatchdogTimer = window.setInterval(() => {
        if (!isPlaylistActive()) return;
        if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
        if (activeBackend !== "audio") return;
        const s = normalizeSrc(targetTrack);
        if (!s) return;
        if (bgm.loop) {
          try {
            bgm.loop = false;
          } catch {
            // ignore
          }
        }
        if (bgm.muted || bgm.defaultMuted) {
          try {
            bgm.muted = false;
            bgm.defaultMuted = false;
          } catch {
            // ignore
          }
        }
        if (normalizeSrc(activeAudioSrc) !== s) {
          void tryStart(s);
          return;
        }
        if (bgm.paused || bgm.ended) {
          void tryStart(s);
          return;
        }
        const overlayOpen = !!overlayEl && !overlayEl.classList.contains("hidden");
        if (!overlayOpen && duck < 0.98) duck = 1;
        const target = getTargetVolume();
        if (!(target > 0.004)) return;
        const cur = Number(currentVolume) || 0;
        const real = Number(bgm.volume) || 0;
        if (cur < target * 0.55 || real < target * 0.55) {
          void fadeTo(target, 220);
        }
      }, 1400);
    }

    function armVolumeGuard(src) {
      clearVolumeGuard();
      if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
      const s = normalizeSrc(src || targetTrack);
      if (!s) return;
      volumeGuardFor = s;

      volumeGuardTimer = window.setTimeout(() => {
        if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
        if (volumeGuardFor !== s) return;
        if (targetTrack !== s) return;
        if (activeBackend !== "audio") return;
        if (bgm.muted || bgm.defaultMuted) {
          try {
            bgm.muted = false;
            bgm.defaultMuted = false;
          } catch {
            // ignore
          }
        }
        if (bgm.paused) {
          void tryStart(s);
          return;
        }

        const target = getTargetVolume();
        if (!(target > 0.004)) return;
        const cur = Number(currentVolume) || 0;
        if (cur >= target * 0.6) return;
        void fadeTo(target, 240);
      }, 720);
    }

    function armPlaylistFade(src) {
      clearPlaylistFade();
      if (!isPlaylistActive()) return;
      if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
      const s = normalizeSrc(src || targetTrack);
      if (!s) return;
      playlistFadeArmedFor = s;

      const FADE_MS = 900;
      const LEAD_SEC = 1.05;
      const ADVANCE_LEAD_SEC = 0.12;

      const fire = () => {
        if (!isPlaylistActive()) return;
        if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
        if (playlistFadeArmedFor !== s) return;
        if (targetTrack !== s) return;
        void fadeTo(0, FADE_MS);
      };

      const fireAdvance = () => {
        playlistAdvanceTimer = null;
        if (!isPlaylistActive()) return;
        if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
        if (playlistFadeArmedFor !== s) return;
        if (targetTrack !== s) return;
        advancePlaylist(1);
      };

      const schedule = () => {
        if (!isPlaylistActive()) return;
        if (playlistFadeArmedFor !== s) return;
        const dur = Number(bgm.duration);
        const cur = Number(bgm.currentTime);
        if (!Number.isFinite(dur) || dur <= 0) return;
        const remain = dur - cur;
        if (!(remain > 0.05)) return;
        if (remain > LEAD_SEC + 0.05) {
          const fadeDelayMs = Math.max(0, Math.floor((remain - LEAD_SEC) * 1000));
          playlistFadeTimer = window.setTimeout(fire, fadeDelayMs);
        }
        clearPlaylistAdvance();
        const advanceDelayMs = Math.max(0, Math.floor((remain - ADVANCE_LEAD_SEC) * 1000));
        playlistAdvanceTimer = window.setTimeout(fireAdvance, advanceDelayMs);
      };

      const dur = Number(bgm.duration);
      if (Number.isFinite(dur) && dur > 0) {
        schedule();
      } else {
        bgm.addEventListener("loadedmetadata", schedule, { once: true });
        bgm.addEventListener("durationchange", schedule, { once: true });
      }
    }

    function advancePlaylist(step = 1) {
      if (!isPlaylistActive()) return;
      if (!state.audio?.unlocked || state.audio?.muted || suspended) return;
      clearPlaylistFade();
      clearPlaylistAdvance();
      clearVolumeGuard();
      clearPlaylistKick();
      const len = playlist.length;
      if (!len) return;
      playlistIndex = ((playlistIndex + step) % len + len) % len;
      const next = playlist[playlistIndex];
      if (!next) return;
      targetTrack = next;
      void tryStart(next);
      kickPlaylist(next);
      armPlaylistWatchdog();
    }

    function parseBuiltin(src) {
      const raw = String(src || "").trim();
      if (!raw) return "";
      if (!raw.startsWith("builtin:")) return "";
      return raw.slice("builtin:".length).trim();
    }

    function stopBackends() {
      try {
        bgm.pause();
      } catch {
        // ignore
      }
      try {
        bgm.currentTime = 0;
      } catch {
        // ignore
      }
      activeAudioSrc = "";
      clearPlaylistFade();
      clearPlaylistAdvance();
      clearVolumeGuard();
      try {
        builtinHappy.stop();
      } catch {
        // ignore
      }
    }

    function applyVolumeImmediate(v) {
      const end = Math.max(0, Math.min(1, Number(v) || 0));
      currentVolume = end;
      if (activeBackend === "builtin") {
        try {
          bgm.volume = 0;
        } catch {
          // ignore
        }
        builtinHappy.setVolume(end);
        return;
      }
      builtinHappy.setVolume(0);
      try {
        bgm.volume = end;
      } catch {
        // ignore
      }
    }

    function getTargetVolume() {
      const user = Number(state.settings?.volume);
      const v = Number.isFinite(user) ? Math.max(0, Math.min(1, user)) : 0.7;
      return BGM_MAX * v * duck * videoDuck;
    }

    async function tryStart(src) {
      if (suspended) return;
      if (!state.audio?.unlocked || state.audio?.muted) return;
      const s = src || targetTrack || CONFIG.media?.menuBgm || CONFIG.media?.fallbackBgm;
      if (!s) return;
      if (isSameTrack(s)) {
        void fadeTo(getTargetVolume(), 160);
        return;
      }
      targetTrack = s;
      await swapTrack(s, !isPlaylistActive());
    }

    function isSameTrack(src) {
      const builtinName = parseBuiltin(src);
      if (builtinName) return activeBackend === "builtin" && activeBuiltinName === builtinName && builtinHappy.isRunning();
      return activeBackend === "audio" && activeAudioSrc === src && !bgm.paused && !bgm.ended;
    }

    function preload(src) {
      if (!src || cache.has(src)) return;
      if (parseBuiltin(src)) return;
      const a = new Audio();
      a.preload = "auto";
      a.playsInline = true;
      a.src = src;
      cache.set(src, a);
      try {
        a.load();
      } catch {
        // ignore
      }
    }

    function setTargetTrack(src) {
      if (!state.audio?.unlocked) return;
      const s = String(src || "").trim();
      if (!s) return;
      clearPlaylist();
      videoDuck = 1;
      targetTrack = s;
      warnedAutoplay = false;
      if (state.audio?.muted || suspended) return;
      void tryStart(s);
    }

    function setTargetPlaylist(list) {
      if (!state.audio?.unlocked) return;
      const next = normalizePlaylist(list).filter((s) => !parseBuiltin(s));
      if (!next.length) return;

      clearPlaylistFade();
      clearPlaylistAdvance();
      clearVolumeGuard();
      clearPlaylistKick();
      clearPlaylistWatchdog();

      if (!isSamePlaylist(next)) {
        playlist = next;
        playlistIndex = 0;
      } else {
        const curIdx = Math.max(0, playlist.indexOf(targetTrack));
        playlistIndex = curIdx >= 0 ? curIdx : 0;
      }

      playlistEnabled = true;
      bgm.loop = false;
      warnedPlaylistSkip = false;
      warnedAutoplay = false;
      videoDuck = 1;

      next.forEach((src) => preload(src));

      const cur = playlist[playlistIndex] || playlist[0];
      targetTrack = cur;
      duck = 1;
      if (state.audio?.muted || suspended) return;
      void tryStart(cur);
      kickPlaylist(cur);
      armPlaylistWatchdog();
    }

    async function startBuiltin(name) {
      activeBackend = "builtin";
      activeBuiltinName = name || "happy-birthday";
      try {
        await builtinHappy.start();
      } catch {
        // ignore
      }
    }

    function guessAudioMime(src) {
      const s = String(src || "")
        .trim()
        .split(/[?#]/)[0]
        .toLowerCase();
      if (s.endsWith(".aac")) return "audio/aac";
      if (s.endsWith(".m4a") || s.endsWith(".mp4")) return "audio/mp4";
      if (s.endsWith(".mp3")) return "audio/mpeg";
      if (s.endsWith(".ogg")) return "audio/ogg";
      if (s.endsWith(".wav")) return "audio/wav";
      if (s.endsWith(".flac")) return "audio/flac";
      if (s.endsWith(".webm")) return "audio/webm";
      return "";
    }

    function setAudioSrcWithType(el, src) {
      const next = normalizeSrc(src);
      if (!next) return;
      try {
        el.pause();
      } catch {
        // ignore
      }
      try {
        el.removeAttribute("src");
      } catch {
        // ignore
      }
      try {
        el.src = "";
      } catch {
        // ignore
      }
      try {
        while (el.firstChild) el.removeChild(el.firstChild);
      } catch {
        // ignore
      }
      try {
        el.load();
      } catch {
        // ignore
      }
      el.src = next;
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
      try {
        el.load();
      } catch {
        // ignore
      }
    }

    async function waitUntilPlayable(el, timeoutMs = 1200) {
      if (!el) return;
      if (Number(el.readyState) >= 2) return;
      await new Promise((resolve) => {
        let done = false;
        let timer = null;
        const finish = () => {
          if (done) return;
          done = true;
          if (timer) window.clearTimeout(timer);
          el.removeEventListener("loadeddata", onReady);
          el.removeEventListener("canplay", onReady);
          el.removeEventListener("canplaythrough", onReady);
          el.removeEventListener("error", onReady);
          resolve();
        };
        const onReady = () => finish();
        timer = window.setTimeout(finish, timeoutMs);
        el.addEventListener("loadeddata", onReady, { once: true });
        el.addEventListener("canplay", onReady, { once: true });
        el.addEventListener("canplaythrough", onReady, { once: true });
        el.addEventListener("error", onReady, { once: true });
      });
    }

    async function startAudio(src) {
      activeBackend = "audio";
      activeBuiltinName = "";
      const el = bgm;
      el.loop = !isPlaylistActive();
      activeAudioSrc = src;
      setAudioSrcWithType(el, src);
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
      try {
        el.muted = false;
        el.defaultMuted = false;
      } catch {
        // ignore
      }
      await waitUntilPlayable(el);
      await el.play();
    }

    async function fadeTo(v, ms) {
      const seq = (fadeSeq += 1);
      const start = currentVolume;
      const end = Math.max(0, Math.min(1, v));
      const steps = Math.max(1, Math.floor(ms / 30));
      for (let i = 1; i <= steps; i++) {
        if (seq !== fadeSeq) return;
        applyVolumeImmediate(start + ((end - start) * i) / steps);
        // eslint-disable-next-line no-await-in-loop
        await sleep(30);
      }
      if (seq !== fadeSeq) return;
      applyVolumeImmediate(end);
    }

    async function swapTrack(src, allowFallback = true) {
      if (!state.audio?.unlocked || state.audio?.muted) return;
      const builtinName = parseBuiltin(src);
      const fallback = String(CONFIG.media?.fallbackBgm || "").trim();

      try {
        clearPlaylistFade();
        clearVolumeGuard();
        stopBackends();
        applyVolumeImmediate(0);

        if (builtinName) {
          await startBuiltin(builtinName);
        } else {
          await startAudio(src);
        }

        void fadeTo(getTargetVolume(), 420);
        armPlaylistFade(src);
        armVolumeGuard(src);
        armPlaylistWatchdog();
      } catch (err) {
        const name = String(err?.name || "");
        const isAutoplayBlocked = name === "NotAllowedError" || /NotAllowed/i.test(String(err));
        if (isAutoplayBlocked) {
          if (!warnedAutoplay) {
            warnedAutoplay = true;
            toast("浏览器限制自动播放：点击任意位置或右上角“音乐”即可开始。");
          }
          return;
        }
        if (!allowFallback) return;
        if (!fallback || fallback === src) return;
        if (!warnedFallback) {
          warnedFallback = true;
          toast("未找到音乐素材：先用内置生日歌（可在 assets/ 里替换）。");
        }
        targetTrack = fallback;
        await swapTrack(fallback, false);
      }
    }

    function sync() {
      if (!state.audio?.unlocked) return;
      if (suspended) {
        stop();
        return;
      }
      if (state.audio?.muted) {
        void fadeTo(0, 180).then(() => stop());
      } else {
        void tryStart(targetTrack || CONFIG.media?.menuBgm || CONFIG.media?.fallbackBgm);
      }
    }

    function applyVolume() {
      if (suspended) return;
      if (!state.audio?.unlocked || state.audio?.muted) return;
      void fadeTo(getTargetVolume(), 160);
    }

    function setDuck(factor) {
      const n = Number(factor);
      duck = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
      applyVolume();
    }

    function setVideoDuck(factor) {
      const n = Number(factor);
      videoDuck = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
      applyVolume();
    }

    function decodeAudioLabel(value) {
      try {
        return decodeURIComponent(String(value || ""));
      } catch {
        return String(value || "");
      }
    }

    function cleanAudioLabel(value) {
      return decodeAudioLabel(value)
        .replace(/\.[^.]+$/u, "")
        .replace(/^[\d\s._-]+/u, "")
        .replace(/[_-]+/gu, " ")
        .replace(/[“”"'`]/gu, "")
        .replace(/\s{2,}/gu, " ")
        .trim();
    }

    function getTrackLabel(src) {
      const raw = String(src || "").trim();
      if (!raw) return "";
      if (parseBuiltin(raw)) return "生日快乐";
      const segs = raw.split(/[?#]/)[0].split("/").filter(Boolean);
      const file = cleanAudioLabel(segs[segs.length - 1] || "");
      const folder = cleanAudioLabel(segs[segs.length - 2] || "");
      if (folder && !/^(assets|audio|bgm|media|music)$/iu.test(folder)) return folder;
      return file || "背景音乐";
    }

    function getStatus() {
      const playing =
        activeBackend === "builtin"
          ? !!builtinHappy.isRunning?.()
          : activeBackend === "audio" && !bgm.paused && !bgm.ended;
      const playlistTotal = isPlaylistActive() ? playlist.length : 0;
      return {
        unlocked: !!state.audio?.unlocked,
        muted: !!state.audio?.muted,
        playing,
        label: getTrackLabel(activeAudioSrc || targetTrack || CONFIG.media?.menuBgm || CONFIG.media?.fallbackBgm),
        currentTime: activeBackend === "audio" ? Number(bgm.currentTime) || 0 : 0,
        duration: activeBackend === "audio" ? Number(bgm.duration) || 0 : 0,
        playlistIndex: playlistTotal ? playlistIndex + 1 : 0,
        playlistTotal,
      };
    }

    function stop() {
      clearPlaylistAdvance();
      clearPlaylistKick();
      clearPlaylistWatchdog();
      videoDuck = 1;
      stopBackends();
      applyVolumeImmediate(0);
    }

    function setSuspended(value) {
      suspended = !!value;
      if (suspended) {
        stop();
      }
    }

    return {
      tryStart,
      preload,
      setTargetTrack,
      setTargetPlaylist,
      sync,
      applyVolume,
      setDuck,
      setVideoDuck,
      getStatus,
      stop,
      setSuspended,
    };
  }

  function armFirstGestureAudioStart() {
    let armed = true;
    const handler = () => {
      if (!armed) return;
      armed = false;
      try {
        if (state.audio?.unlocked && !state.audio?.muted) audio.sync();
      } finally {
        window.removeEventListener("pointerdown", handler, true);
        window.removeEventListener("keydown", handler, true);
      }
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("keydown", handler, true);
  }

  function openOverlayHtml(html) {
    if (!overlayEl) return;
    lockScrollForOverlay();
    overlayEl.innerHTML = html;
    overlayEl.classList.remove("hidden");
    overlayEl.setAttribute("aria-hidden", "false");
    overlayEl.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeOverlay));
    bindTypewriters(overlayEl);
    overlayEl.addEventListener(
      "click",
      (e) => {
        if (e.target === overlayEl) closeOverlay();
      },
      { once: true },
    );
  }

  function closeOverlay() {
    if (!overlayEl) return;
    audio.setDuck?.(1);
    audio.setVideoDuck?.(1);
    overlayEl.classList.add("hidden");
    overlayEl.setAttribute("aria-hidden", "true");
    overlayEl.innerHTML = "";
    unlockScrollForOverlay();
  }

  function hasAudibleVideo(root) {
    if (!root?.querySelectorAll) return false;
    return Array.from(root.querySelectorAll("video")).some((video) => {
      if (!document.body.contains(video)) return false;
      if (video.paused || video.ended) return false;
      if (video.muted || video.defaultMuted) return false;
      if ((Number(video.volume) || 0) <= 0.01) return false;
      return true;
    });
  }

  function syncPlaybackAwareVideoDuck() {
    const playingAudibleVideo = hasAudibleVideo(overlayEl) || hasAudibleVideo(viewEl);
    audio.setVideoDuck?.(playingAudibleVideo ? 0 : 1);
  }

  function bindPlaybackAwareVideos(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("video").forEach((video) => {
      if (video.__duckBound) return;
      video.__duckBound = true;
      const sync = () => syncPlaybackAwareVideoDuck();
      ["play", "playing", "pause", "ended", "volumechange", "emptied", "abort", "error"].forEach((type) => {
        video.addEventListener(type, sync);
      });
    });
    syncPlaybackAwareVideoDuck();
  }

  function observeMediaPlayback() {
    const attach = (root) => {
      if (!root || typeof MutationObserver !== "function") return;
      const sync = () => {
        bindPlaybackAwareVideos(root);
        syncPlaybackAwareVideoDuck();
      };
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(root, { childList: true, subtree: true });
    };

    attach(viewEl);
    attach(overlayEl);
  }

  function bindTypewriters(root) {
    if (!root) return;
    bindPlaybackAwareVideos(root);
    root.querySelectorAll("[data-typewriter]").forEach((wrap) => {
      if (wrap.__twBound) return;
      wrap.__twBound = true;

      const srcEl = wrap.querySelector(".typewriter__src");
      const outEl = wrap.querySelector(".typewriter__out");
      if (!srcEl || !outEl) return;
      const full = srcEl.textContent || "";

      const finish = () => {
        window.clearTimeout(wrap.__twT);
        outEl.textContent = full;
        wrap.classList.add("done");
      };

      if (state.settings?.reduceMotion) {
        finish();
        return;
      }

      outEl.textContent = "";
      wrap.classList.remove("done");
      const speed = Math.max(6, Math.min(40, Number(wrap.getAttribute("data-speed")) || 18));
      let i = 0;

      const tick = () => {
        if (!document.body.contains(outEl)) return;
        i = Math.min(full.length, i + 1);
        outEl.textContent = full.slice(0, i);
        if (i < full.length) wrap.__twT = window.setTimeout(tick, speed);
        else wrap.classList.add("done");
      };

      tick();
      wrap.addEventListener("click", finish, { once: true });
    });
  }

  function openSettings() {
    const volPct = Math.round((Number(state.settings?.volume) || 0) * 100);
    const checked = (v) => (v ? "checked" : "");

    openOverlayHtml(`
      <div class="modal">
        <div class="modal__header">
          <div class="modal__title">设置</div>
          <button class="btn btn-ghost tiny" type="button" data-close>关闭</button>
        </div>
        <div class="modal__body">
          <div class="kv">
            <div class="badge">音量</div>
            <div>
              <input id="setVolume" type="range" min="0" max="100" step="1" value="${escapeAttr(String(volPct))}" style="width:100%" />
              <div style="margin-top:8px;color:var(--muted)">当前：<span class="mono" id="setVolumeLabel">${escapeHtml(String(volPct))}%</span></div>
            </div>
          </div>

          <div class="hintbox" style="margin-top:12px">
            <label style="display:flex;gap:10px;align-items:center;cursor:pointer">
              <input id="setSubtitles" type="checkbox" ${checked(state.settings?.subtitles)} />
              <span>显示彩蛋字幕（没视频也能看到祝福）</span>
            </label>
            <label style="display:flex;gap:10px;align-items:center;cursor:pointer;margin-top:10px">
              <input id="setReduceMotion" type="checkbox" ${checked(state.settings?.reduceMotion)} />
              <span>减少动效（低端机/易晕眩友好）</span>
            </label>
            <label style="display:flex;gap:10px;align-items:center;cursor:pointer;margin-top:10px">
              <input id="setSkipRewards" type="checkbox" ${checked(state.settings?.skipRewards)} />
              <span>跳过过关彩蛋（网络差时更顺畅）</span>
            </label>
          </div>

          <div class="row" style="margin-top:12px">
            <button class="btn btn-primary" type="button" data-close>完成</button>
          </div>
        </div>
      </div>
    `);

    const volEl = document.getElementById("setVolume");
    const volLabel = document.getElementById("setVolumeLabel");
    if (volEl) {
      volEl.addEventListener("input", () => {
        const v = Number(volEl.value);
        state.settings.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.7;
        if (volLabel) volLabel.textContent = `${Math.round(state.settings.volume * 100)}%`;
        applySettings();
      });
    }

    const subEl = document.getElementById("setSubtitles");
    if (subEl) {
      subEl.addEventListener("change", () => {
        state.settings.subtitles = !!subEl.checked;
        applySettings();
      });
    }

    const rmEl = document.getElementById("setReduceMotion");
    if (rmEl) {
      rmEl.addEventListener("change", () => {
        state.settings.reduceMotion = !!rmEl.checked;
        applySettings();
      });
    }

    const skipEl = document.getElementById("setSkipRewards");
    if (skipEl) {
      skipEl.addEventListener("change", () => {
        state.settings.skipRewards = !!skipEl.checked;
        applySettings();
      });
    }
  }

  function routeToInitialView() {
    if (state.completedCaseIds.includes("case6")) {
      state.warmMode = true;
      persist();
      renderFinal();
      return;
    }
    if (!state.hasPassedGate) {
      renderGate();
      return;
    }
    renderCaseSelect();
  }

  function navigate(route) {
    stopActiveWork();
    state.route = route;
    persist();
    if (route.name === "gate") return renderGate();
    if (route.name === "cases") return renderCaseSelect();
    if (route.name === "case") return renderCase(route.caseId, { preserveScroll: false });
    if (route.name === "final") return renderFinal();
  }

  function getCaseDef(caseId) {
    return (CONFIG.cases || []).find((c) => c.id === caseId) || null;
  }

  function getCaseStatus(caseDef) {
    if (state.completedCaseIds.includes(caseDef.id)) return "completed";
    if (caseDef.order === 1) return "unlocked";
    const prev = (CONFIG.cases || []).find((c) => c.order === caseDef.order - 1);
    if (!prev) return "unlocked";
    return state.completedCaseIds.includes(prev.id) ? "unlocked" : "locked";
  }

  function ensurePerCase(caseId) {
    if (!state.perCase[caseId]) {
      state.perCase[caseId] = {
        phase: "observation",
        observationStartedAt: null,
        deductionStartedAt: null,
        wrongAttempts: 0,
        hintCooldownUntil: 0,
        hintsUsed: { tier1: 0, tier2: 0, tier3: 0 },
        data: {},
      };
    }
    return state.perCase[caseId];
  }

  function recoverCaseValue(caseId, dataKey, fallbackFactory) {
    if (!state.completedCaseIds.includes(caseId)) return "";
    const current = String(state.perCase?.[caseId]?.data?.[dataKey] || "").trim();
    if (current) return current;
    const fallbackRaw = typeof fallbackFactory === "function" ? fallbackFactory() : fallbackFactory;
    const fallback = String(fallbackRaw || "").trim();
    if (!fallback) return "";
    const cs = ensurePerCase(caseId);
    cs.data = cs.data && typeof cs.data === "object" ? cs.data : {};
    if (cs.data[dataKey] !== fallback) {
      cs.data[dataKey] = fallback;
      persist();
    }
    return fallback;
  }

  function getRecoveredCase2Passphrase() {
    return recoverCaseValue("case2", "passphrase", () => getCaseDef("case2")?.solution?.passphrase);
  }

  function getRecoveredCase3Number() {
    return recoverCaseValue("case3", "caseNumber", () => getCaseDef("case3")?.solution?.caseNumber);
  }

  function getRecoveredCase5Fragment() {
    return recoverCaseValue("case5", "fragment", () => getCaseDef("case5")?.solution?.fragment);
  }

  function getRecoveredCase3Fragment() {
    return recoverCaseValue("case3", "fragment", () => {
      const case3 = getCaseDef("case3");
      return case3?.solution?.fragment || case3?.solution?.letters;
    });
  }

  function softenNarrativeCopy(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    return raw
      .replace(/AI\s*小剧场[:：]\s*/gi, "")
      .replace(/AI\s*INTERLUDE/gi, "章节过场")
      .replace(/STATUS:\s*CLASSIFIED\s*\/\/\s*ACCESS LEVEL:\s*OMEGA/gi, "今夜档案 / 只给月月看的那一页")
      .replace(/ACCESS GRANTED/gi, "暖光已亮")
      .replace(/TRACE/gi, "线索")
      .replace(/【系统提示】/g, "【下一步】");
  }

  function softenNarrativeHtml(text) {
    return softenNarrativeCopy(text);
  }

  function beginPhase(caseState, phase) {
    const now = Date.now();
    caseState.phase = phase;
    if (phase === "observation" && !caseState.observationStartedAt) caseState.observationStartedAt = now;
    if (phase === "deduction" && !caseState.deductionStartedAt) caseState.deductionStartedAt = now;
    persist();
  }

  function getPhaseRemainingSec(caseDef, caseState) {
    const now = Date.now();
    if (caseState.phase === "observation") {
      const total = caseDef.observationSec ?? 90;
      const started = caseState.observationStartedAt ?? now;
      return Math.max(0, total - Math.floor((now - started) / 1000));
    }
    if (caseState.phase === "deduction") {
      const total = caseDef.deductionSec ?? 240;
      const started = caseState.deductionStartedAt ?? now;
      return Math.max(0, total - Math.floor((now - started) / 1000));
    }
    return 0;
  }

  function formatClock(sec) {
    const s = Math.max(0, sec | 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function canUseHint(caseState, tier) {
    const now = Date.now();
    if (now < (caseState.hintCooldownUntil || 0)) return { ok: false, reason: "提示冷却中" };
    if (tier === "tier1") return { ok: true };
    const cost = CONFIG.scoring?.hintCosts?.[tier] ?? 0;
    if ((state.points ?? 0) < cost) return { ok: false, reason: "声望不足" };
    return { ok: true, cost };
  }

  function deductPoints(amount, reason) {
    if (!amount) return;
    state.points = Math.max(0, (state.points ?? 0) - amount);
    persist();
    syncTopbar();
    if (reason) toast(`${reason}：-${amount}`);
  }

  function useHint(caseDef, caseState, tier) {
    const check = canUseHint(caseState, tier);
    if (!check.ok) return toast(check.reason);
    const text = caseDef.hints?.[tier];
    if (!text) return toast("这关没有配置提示。");

    if (tier === "tier1") {
      const cd = (CONFIG.scoring?.tier1CooldownSec ?? 60) * 1000;
      caseState.hintCooldownUntil = Date.now() + cd;
    } else {
      deductPoints(check.cost || 0, `使用提示 ${tier.replace("tier", "")}`);
    }
    caseState.hintsUsed[tier] = (caseState.hintsUsed[tier] || 0) + 1;
    persist();

    openOverlayHtml(renderHintOverlay(tier, text));
  }

  function registerWrongAttempt(caseState, message) {
    caseState.wrongAttempts = (caseState.wrongAttempts || 0) + 1;
    const threshold = CONFIG.scoring?.wrongAttemptThreshold ?? 3;
    if (caseState.wrongAttempts % threshold === 0) {
      deductPoints(CONFIG.scoring?.wrongAttemptPenalty ?? 2, "暴力破解惩罚");
      flashDanger();
    }
    persist();
    toast(message || "不对。再想想。");
  }

  function renderHintOverlay(tier, text) {
    const cost = CONFIG.scoring?.hintCosts?.[tier] ?? 0;
    const extra =
      tier === "tier1"
        ? `（免费，但有 ${CONFIG.scoring?.tier1CooldownSec ?? 60}s 冷却）`
        : `（消耗声望 -${cost}）`;
    return `
      <div class="modal">
        <div class="modal__header">
          <div class="modal__title">${escapeHtml(`提示 ${tier.replace("tier", "")}`)} ${escapeHtml(extra)}</div>
          <button class="btn btn-ghost tiny" type="button" data-close>关闭</button>
        </div>
        <div class="modal__body">
          <div class="hintbox">${escapeHtml(text)}</div>
          <div class="row" style="margin-top:12px">
            <button class="btn btn-primary" type="button" data-close>知道了</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderGate() {
    stopActiveWork();
    document.body.classList.remove("case6-immersive");
    document.body.classList.remove("warm");
    const nick = CONFIG.people?.recipientNickname;
    const name = CONFIG.people?.recipientName;
    const displayName = nick && name ? `${nick}（${name}）` : nick || name || "TA";
    const birthday = CONFIG.people?.birthdayText ? ` · ${CONFIG.people.birthdayText}` : "";
    viewEl.innerHTML = `
      <section class="panel gate-hero">
        <div class="panel__header gate-hero__header">
          <div class="gate-hero__eyebrow">00:00 · 私人生日委托</div>
          <h1 class="panel__title gate-hero__title">把零点祝福送回 ${escapeHtml(displayName)}</h1>
          <p class="panel__subtitle gate-hero__subtitle">
            今晚真正失窃的不是证物，而是属于 <span class="mono">${escapeHtml(displayName)}</span> 的生日惊喜${escapeHtml(birthday)}。
            六个房间、六段记忆、六次推理——你要做的，是把她这一年的光一点点找回来。
          </p>
        </div>
        <div class="panel__body">
          <div class="gate-hero__grid">
            <div class="gate-hero__letter">
              <div class="gate-hero__card-eyebrow">委托便签</div>
              <div class="gate-hero__letter-title">收件人：${escapeHtml(displayName)}</div>
              <div class="gate-hero__letter-body">
                这不是一张功能入口页，而是一份只会送达一次的零点委托。
                先接过它，再按自己的节奏去破案、找回记忆、把祝福送到她面前。
              </div>
            </div>
            <div class="gate-hero__tips">
              <div class="gate-hero__tip"><span class="badge">玩法</span><span>观察、推理、解码都保留，提示按钮也会一直在。</span></div>
              <div class="gate-hero__tip"><span class="badge">音轨</span><span>先点一次按钮解锁音乐，后面的背景音乐才会稳定接上。</span></div>
              <div class="gate-hero__tip"><span class="badge">形式</span><span>这是纯静态网页，之后直接点开就能看，不需要后端常驻。</span></div>
            </div>
          </div>
          <div class="row gate-hero__actions">
            <div class="badge">先点击按钮，顺手把浏览器的自动播放限制一起解开。</div>
            <button id="btnEnter" class="btn btn-primary" type="button">接过这份委托（解锁音乐）</button>
          </div>
        </div>
      </section>
      `;

    document.getElementById("btnEnter").addEventListener("click", async () => {
      state.hasPassedGate = true;
      state.audio.unlocked = true;
      persist();
      syncTopbar();
      void audio.tryStart(CONFIG.media?.menuBgm || CONFIG.media?.fallbackBgm);
      navigate({ name: "cases", caseId: null });
    });
  }

  function renderCaseSelect() {
    stopActiveWork();
    document.body.classList.remove("case6-immersive");
    document.body.classList.toggle("warm", !!state.warmMode);
    audio.setSuspended?.(false);
    audio.setDuck?.(1);
    audio.setTargetTrack(CONFIG.media?.menuBgm);

    const nick = CONFIG.people?.recipientNickname;
    const name = CONFIG.people?.recipientName;
    const displayName = nick && name ? `${nick}（${name}）` : nick || name || "TA";
    const doneCount = state.completedCaseIds?.length || 0;
    const totalCount = (CONFIG.cases || []).length || 6;
    const nextCase = (CONFIG.cases || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .find((c) => getCaseStatus(c) === "unlocked");
    const summaryPairs = [
      { k: "路线口令", v: getRecoveredCase2Passphrase() },
      { k: "案号", v: getRecoveredCase3Number() },
      { k: "关键碎片", v: getRecoveredCase5Fragment() },
    ].filter((x) => x.v);
    const summaryHtml = summaryPairs.length
      ? summaryPairs
          .map((x) => `<span class="badge" style="margin:4px 6px 0 0">${escapeHtml(x.k)}：<span class="mono">${escapeHtml(String(x.v))}</span></span>`)
          .join("")
      : `<span class="badge locked">还没有收集到可用碎片</span>`;

    const cards = (CONFIG.cases || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const status = getCaseStatus(c);
        const badge =
          status === "completed"
            ? `<span class="badge ok">已结案</span>`
            : status === "locked"
              ? `<span class="badge locked">未解锁</span>`
              : `<span class="badge">可进入</span>`;
        const disabled = status === "locked" ? `aria-disabled="true"` : "";
        return `
          <article class="case-card" data-case="${c.id}" ${disabled}>
            <div class="row">
              <div class="case-card__kicker">第 ${c.order} 关</div>
              <div>${badge}</div>
            </div>
            <div class="case-card__title">${escapeHtml(c.title)}</div>
            <div class="case-card__desc">${escapeHtml(c.subtitle || "")}</div>
          </article>
        `;
      })
      .join("");

    const leadText = doneCount
      ? `已经找回 ${doneCount} / ${totalCount} 段记忆，继续往前走。`
      : `${displayName} 的零点派对刚刚开场，先挑一间亮着灯的房间。`;
    const nextText = nextCase
      ? `当前亮灯：第 ${nextCase.order} 关 · ${nextCase.title}`
      : "六段委托都已完成，门已经为你打开。";

    viewEl.innerHTML = `
      <section class="panel case-select-shell">
        <div class="panel__header">
          <div class="case-select__eyebrow">生日委托已签收</div>
          <h2 class="panel__title">今晚要找回的，是她这一整年的星光</h2>
          <p class="panel__subtitle">
            玩法还是观察、推理和解码，但每一关其实都是写给 <span class="mono">${escapeHtml(displayName)}</span> 的一张回执。
          </p>
        </div>
        <div class="panel__body">
          <section class="case-brief" aria-label="委托概览">
            <div class="case-brief__lead">
              <div class="case-brief__title">${escapeHtml(leadText)}</div>
              <div class="case-brief__text">${escapeHtml(nextText)}</div>
              <div class="case-brief__chips">${summaryHtml}</div>
            </div>
            <div class="case-brief__stat">
              <span class="badge">调查对象</span>
              <span class="mono">${escapeHtml(displayName)}</span>
            </div>
            <div class="case-brief__stat">
              <span class="badge">进度</span>
              <span class="mono">${escapeHtml(String(doneCount))}</span> / <span class="mono">${escapeHtml(String(totalCount))}</span>
            </div>
          </section>
          <div class="hintbox case-select__hint">喜欢推理就按自己的节奏来。卡住时再点提示，不会破坏整体流程。</div>
          <div class="grid cols-3">${cards}</div>
        </div>
      </section>
    `;

    viewEl.querySelectorAll(".case-card").forEach((el) => {
      el.addEventListener("click", () => {
        const caseId = el.getAttribute("data-case");
        const def = getCaseDef(caseId);
        if (!def) return;
        if (getCaseStatus(def) === "locked") return toast("该关卡未解锁。");
        navigate({ name: "case", caseId });
      });
    });
  }

  function renderCase(caseId, opts = {}) {
    stopActiveWork();
    const preserveScroll = opts.preserveScroll !== false;
    const caseDef = getCaseDef(caseId);
    if (!caseDef) return navigate({ name: "cases", caseId: null });
    if (getCaseStatus(caseDef) === "locked") {
      toast("该关卡未解锁。");
      return navigate({ name: "cases", caseId: null });
    }

    document.body.classList.toggle("warm", !!state.warmMode);
    const cs = ensurePerCase(caseId);
    if (!cs.observationStartedAt) beginPhase(cs, "observation");
    document.body.classList.toggle("case6-immersive", caseDef.id === "case6" && cs.phase === "observation");
    const suspendBgm = caseDef.id === "case6" && cs.phase === "observation" && !cs.data?.silenceDone;
    audio.setSuspended?.(suspendBgm);
    audio.setDuck?.(1);
    audio.setTargetTrack(caseDef.assets?.bgm);
    if (
      caseDef.id === "case2" &&
      state.audio?.unlocked &&
      !state.audio?.muted &&
      !cs.data?.bgmToastShown &&
      String(caseDef.assets?.bgm || "").trim()
    ) {
      cs.data.bgmToastShown = true;
      persist();
      toast("本关 BGM：时间煮雨");
    }

    const remaining = getPhaseRemainingSec(caseDef, cs);
    const phaseLabel = cs.phase === "observation" ? "搜证/观察" : "推理/解码";
    const showCaseTimer = caseDef.id !== "case6";

    viewEl.innerHTML = `
      <section class="panel" data-case-root="${escapeAttr(caseDef.id)}">
        <div class="panel__header">
          <div class="row">
            <div class="badge">第 ${caseDef.order} 关 · ${escapeHtml(caseDef.title)}</div>
            ${showCaseTimer ? `<div class="timer">阶段：${phaseLabel} · 剩余：<span id="timer">${formatClock(remaining)}</span></div>` : ""}
          </div>
          <div class="hintbox" style="margin-top:10px">
            <div style="color:var(--muted)">${escapeHtml(caseDef.subtitle || "")}</div>
            <div class="hintbar" style="margin-top:10px">
              <button class="btn btn-ghost tiny" type="button" data-hint="tier1">提示 1（轻推）</button>
              <button class="btn btn-ghost tiny" type="button" data-hint="tier2">提示 2（强推）</button>
              <button class="btn btn-ghost tiny" type="button" data-hint="tier3">提示 3（揭底）</button>
            </div>
          </div>
        </div>
        <div class="panel__body">
          <div class="row" style="margin-bottom:12px">
            <button id="btnBack" class="btn btn-ghost" type="button">返回关卡室</button>
          </div>
          ${renderCaseBody(caseDef, cs)}
        </div>
      </section>
    `;

    document.getElementById("btnBack").addEventListener("click", () => navigate({ name: "cases", caseId: null }));
    viewEl.querySelectorAll("[data-hint]").forEach((btn) => {
      btn.addEventListener("click", () => useHint(caseDef, cs, btn.getAttribute("data-hint")));
    });
    bindCaseInteractions(caseDef, cs);

    activeInterval = window.setInterval(() => {
      const left = getPhaseRemainingSec(caseDef, cs);
      const t = document.getElementById("timer");
      if (t) t.textContent = formatClock(left);
    }, 400);

    if (!preserveScroll) viewEl.scrollIntoView({ block: "start" });
  }

  function renderCaseBody(caseDef, cs) {
    if (caseDef.type === "wishlight-einstein" || caseDef.type === "einstein-logic") return renderCase1Einstein(caseDef, cs);
    if (caseDef.type === "wishlight-board") return renderCase1Wishlight(caseDef, cs);
    if (caseDef.type === "evidence-select") return renderCase1(caseDef, cs);
    if (caseDef.type === "mind-palace") return renderCase2(caseDef, cs);
    if (caseDef.type === "alchemy-wish") return renderCase3Alchemy(caseDef, cs);
    if (caseDef.type === "cardano-grille") return renderCase4CardanoGrille(caseDef, cs);
    if (caseDef.type === "count-decode") return renderCase4(caseDef, cs);
    if (caseDef.type === "jump-and-jump") return renderCase5Jump(caseDef, cs);
    if (caseDef.type === "floor-map") return renderCase5FloorMap(caseDef, cs);
    if (caseDef.type === "silence-final") return renderCase6(caseDef, cs);
    return `<div class="hintbox">该关卡类型尚未实现：<span class="mono">${escapeHtml(caseDef.type || "")}</span></div>`;
  }

  function bindCaseInteractions(caseDef, cs) {
    if (caseDef.type === "wishlight-einstein" || caseDef.type === "einstein-logic") return bindCase1Einstein(caseDef, cs);
    if (caseDef.type === "wishlight-board") return bindCase1Wishlight(caseDef, cs);
    if (caseDef.type === "evidence-select") return bindCase1(caseDef, cs);
    if (caseDef.type === "mind-palace") return bindCase2(caseDef, cs);
    if (caseDef.type === "alchemy-wish") return bindCase3Alchemy(caseDef, cs);
    if (caseDef.type === "cardano-grille") return bindCase4CardanoGrille(caseDef, cs);
    if (caseDef.type === "count-decode") return bindCase4(caseDef, cs);
    if (caseDef.type === "jump-and-jump") return bindCase5Jump(caseDef, cs);
    if (caseDef.type === "floor-map") return bindCase5FloorMap(caseDef, cs);
    if (caseDef.type === "silence-final") return bindCase6(caseDef, cs);
  }

  // Case 1: wishlight-einstein
  function renderCase1Einstein(caseDef, cs) {
    const data = caseDef.data || {};
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const items = Array.isArray(data.items) ? data.items : [];

    const roomAssignments = ensureEinsteinRoomAssignments(caseDef, cs);
    const usage = computeEinsteinUsage(roomAssignments);

    const activeToken =
      cs.data.activeToken && typeof cs.data.activeToken === "object" ? cs.data.activeToken : null;
    const accusedId = String(cs.data.accusedId || "");

    const suspectById = Object.fromEntries(suspects.map((s) => [s.id, s]));
    const itemById = Object.fromEntries(items.map((t) => [t.id, t]));

    const filledRooms = rooms.filter((r) => !!roomAssignments[r.id]?.personId).length;
    const filledItems = rooms.filter((r) => !!roomAssignments[r.id]?.itemId).length;
    const allFilled =
      rooms.length > 0 &&
      rooms.every((r) => {
        const a = roomAssignments[r.id] || {};
        return !!a.personId && !!a.itemId;
      });

    const stableTiltDeg = (key) => {
      const s = String(key || "");
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const n = (h >>> 0) % 9; // 0..8
      const deg = (n - 4) * 0.85; // -3.4..3.4
      return deg.toFixed(2);
    };

    const renderPerson = (s, opts = {}) => {
      const usedIn = usage.personToRoom[s.id] || "";
      const isUsed = !!usedIn && usedIn !== opts.inRoomId;
      const isActive = !!activeToken && activeToken.type === "person" && activeToken.id === s.id;
      const isAccused = cs.phase === "deduction" && accusedId === s.id;
      const cls = `polaroid${opts.placed ? " placed" : ""}${isUsed ? " used" : ""}${isActive ? " active" : ""}${isAccused ? " accused" : ""}`;
      const title = isUsed ? `已放入：${rooms.find((r) => r.id === usedIn)?.name || usedIn}` : "拖拽 / 点击选择";
      const tilt = stableTiltDeg(s.id);
      const placedAttr = opts.placed ? `data-placed-person="${escapeAttr(s.id)}"` : "";
        return `
          <div class="${cls}"
            style="--tilt:${escapeAttr(String(tilt))}deg"
            draggable="true"
            data-token-type="person"
            data-token-id="${escapeAttr(s.id)}"
            ${placedAttr}
            role="button" tabindex="0"
            title="${escapeAttr(title)}">
            <button class="polaroid__talk" type="button" data-talk="${escapeAttr(s.id)}" aria-label="${escapeAttr(`${s.name || ""} 发言`)}">💬</button>
            <div class="polaroid__img" aria-hidden="true">${escapeHtml(s.avatar || "🧩")}</div>
            <div class="polaroid__cap">
              <div class="polaroid__name">${escapeHtml(s.name || "")}</div>
              <div class="polaroid__role">${escapeHtml(s.role || "")}</div>
            </div>
            <div class="speech" aria-hidden="true"></div>
          </div>
        `;
      };

    const renderItem = (t, opts = {}) => {
      const usedIn = usage.itemToRoom[t.id] || "";
      const isUsed = !!usedIn && usedIn !== opts.inRoomId;
      const isActive = !!activeToken && activeToken.type === "item" && activeToken.id === t.id;
      const cls = `evidence-chip${opts.placed ? " placed" : ""}${isUsed ? " used" : ""}${isActive ? " active" : ""}`;
      const title = isUsed ? `已放入：${rooms.find((r) => r.id === usedIn)?.name || usedIn}` : "拖拽 / 点击选择";
      return `
        <div class="${cls}"
          draggable="true"
          data-token-type="item"
          data-token-id="${escapeAttr(t.id)}"
          role="button" tabindex="0"
          title="${escapeAttr(title)}">
          <span class="evidence-chip__icon" aria-hidden="true">${escapeHtml(t.icon || "🧩")}</span>
          <span class="evidence-chip__name">${escapeHtml(t.name || "")}</span>
          ${isUsed ? `<span class="evidence-chip__dot" aria-hidden="true">●</span>` : ""}
        </div>
      `;
    };

    const renderDropzone = ({ type, roomId, contentHtml }) => {
      const has = !!contentHtml;
      const label = type === "person" ? "人物" : "道具";
      const placeholder = type === "person" ? "拖拽人物拍立得到这里" : "拖拽道具标签到这里";
      const clearBtn = has
        ? `<button class="dropzone__clear" type="button" data-clear="${escapeAttr(`${type}:${roomId}`)}" aria-label="清空">×</button>`
        : "";
      return `
        <div class="dropzone ${type === "person" ? "dz-person" : "dz-item"}"
          data-drop="${escapeAttr(`${type}:${roomId}`)}"
          data-drop-type="${escapeAttr(type)}"
          data-room="${escapeAttr(roomId)}"
          role="button" tabindex="0">
          <div class="dropzone__top">
            <span class="badge">${escapeHtml(label)}</span>
            ${clearBtn}
          </div>
          <div class="dropzone__body">
            ${has ? contentHtml : `<div class="dropzone__placeholder">${escapeHtml(placeholder)}</div>`}
          </div>
        </div>
      `;
    };

    const roomSlots = rooms
      .map((r, idx) => {
        const a = roomAssignments[r.id] || {};
        const person = a.personId ? suspectById[a.personId] : null;
        const item = a.itemId ? itemById[a.itemId] : null;
        const personHtml = person ? renderPerson(person, { placed: true, inRoomId: r.id }) : "";
        const itemHtml = item ? renderItem(item, { placed: true, inRoomId: r.id }) : "";
        return `
          <section class="room-slot" data-room-slot="${escapeAttr(r.id)}">
            <div class="room-slot__header">
              <div class="room-slot__kicker">房间 ${escapeHtml(String(idx + 1))}</div>
              <div class="room-slot__name"><span aria-hidden="true">${escapeHtml(r.icon || "🏠")}</span> ${escapeHtml(r.name || r.id)}</div>
              <div class="room-slot__note mono">${escapeHtml(r.note || "")}</div>
            </div>
            ${renderDropzone({ type: "person", roomId: r.id, contentHtml: personHtml })}
            ${renderDropzone({ type: "item", roomId: r.id, contentHtml: itemHtml })}
          </section>
        `;
      })
      .join("");

    const peoplePool = suspects
      .map((s) => {
        const usedIn = usage.personToRoom[s.id] || "";
        return `<div class="pool__cell${usedIn ? " faded" : ""}">${renderPerson(s)}</div>`;
      })
      .join("");
    const itemsPool = items
      .map((t) => {
        const usedIn = usage.itemToRoom[t.id] || "";
        return `<div class="pool__cell${usedIn ? " faded" : ""}">${renderItem(t)}</div>`;
      })
      .join("");

    const canVote = cs.phase === "deduction" && allFilled && !!accusedId;
    const accusedName = accusedId ? suspectById[accusedId]?.name || accusedId : "";
    const voteLabel = String(data.voteButtonText || "金色鸟笼 · 去检举").trim() || "金色鸟笼 · 去检举";

    const actions =
      cs.phase === "observation"
        ? `<button id="btnToDeduceEin1" class="btn btn-primary" type="button" ${allFilled ? "" : "disabled"}>进入推理</button>`
        : `
           <div class="wish-actions">
             <button id="btnBackEin1" class="btn btn-ghost" type="button">返回搜证</button>
             <button id="btnVoteEin1" class="cage-btn" type="button" ${canVote ? "" : "disabled"}>
              ${escapeHtml(voteLabel)}
             </button>
           </div>
         `;

    const headerText =
      cs.phase === "deduction"
        ? `点选你认为“拿着月光烛台的人”，再点击「${voteLabel}」校验。`
        : "点击线索本查看线索，把人物与道具拖进 5 个房间。";

    return `
      <div class="wish-scene">
        <div class="wish-scene__top">
          <div class="wish-meta">
            <div class="badge">案件名</div>
            <div class="mono" style="margin-left:8px">${escapeHtml(data.caseName || caseDef.title || "")}</div>
          </div>
          <button id="btnNotebookEin1" class="notebook-fab" type="button">
            ${escapeHtml(data.notebookButtonText || "皮质线索本")}
          </button>
        </div>

        <div class="hintbox wish-hint" style="margin-top:12px">
          <div class="badge">指令</div>
          <div style="margin-top:8px">${escapeHtml(headerText)}</div>
          ${
            cs.phase === "deduction"
              ? `<div style="margin-top:8px;color:var(--muted)">当前检举：<span class="mono">${escapeHtml(accusedName || "—")}</span></div>`
              : ""
          }
        </div>

        <div class="board wish-board case1-board" id="case1WishBoard" style="margin-top:12px">
          <svg id="case1WishLines" class="board-lines" aria-hidden="true"></svg>
          <div id="case1Danmaku" class="danmaku" aria-hidden="true"></div>

          <div class="room-row" aria-label="房间排列">
            ${roomSlots}
          </div>

          <div class="pool" style="margin-top:14px">
            <div class="pool__header">
              <div class="badge">人物拍立得</div>
              <div class="pool__sub">拖拽/点选 → 再点房间</div>
            </div>
            <div class="pool__grid">${peoplePool}</div>
          </div>

          <div class="pool" style="margin-top:12px">
            <div class="pool__header">
              <div class="badge">道具标签</div>
              <div class="pool__sub">拖拽/点选 → 再点房间</div>
            </div>
            <div class="pool__grid">${itemsPool}</div>
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <div class="badge">已放置：人物 <span class="mono">${escapeHtml(String(filledRooms))}</span> / ${escapeHtml(String(rooms.length || 5))}，道具 <span class="mono">${escapeHtml(String(filledItems))}</span> / ${escapeHtml(String(rooms.length || 5))}</div>
          ${actions}
        </div>
      </div>
    `;
  }

  function bindCase1Einstein(caseDef, cs) {
    const data = caseDef.data || {};
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const clues = Array.isArray(data.clues) ? data.clues : [];
    const roomAssignments = ensureEinsteinRoomAssignments(caseDef, cs);

    const boardEl = document.getElementById("case1WishBoard");

    const decodeDragPayload = (raw) => {
      const s = String(raw || "").trim();
      const m = s.match(/^(person|item):(.+)$/);
      if (!m) return null;
      return { type: m[1], id: m[2] };
    };

    const setRoomToken = ({ roomId, type, tokenId }) => {
      for (const r of rooms) {
        const a = roomAssignments[r.id];
        if (!a) continue;
        if (type === "person" && a.personId === tokenId) a.personId = "";
        if (type === "item" && a.itemId === tokenId) a.itemId = "";
      }
      const a = roomAssignments[roomId] || (roomAssignments[roomId] = { personId: "", itemId: "" });
      if (type === "person") a.personId = tokenId;
      else a.itemId = tokenId;
    };

    const clearRoomToken = ({ roomId, type }) => {
      const a = roomAssignments[roomId];
      if (!a) return;
      if (type === "person") a.personId = "";
      else a.itemId = "";
    };

    const isAllFilled = () =>
      rooms.length > 0 &&
      rooms.every((r) => {
        const a = roomAssignments[r.id] || {};
        return !!a.personId && !!a.itemId;
      });

    const openNotebook = () => {
      const list = clues.length
        ? `<ol class="clue-list clue-list--paper">${clues.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ol>`
        : `<div class="hintbox">未配置线索。</div>`;

      openOverlayHtml(`
        <div class="modal notebook-modal">
          <div class="modal__header">
            <div class="modal__title">${escapeHtml(data.notebookTitle || "线索本")}</div>
            <button class="btn btn-ghost tiny" type="button" data-close>合上</button>
          </div>
          <div class="modal__body notebook-modal__body">
            <div class="notebook-paper">
              <div class="badge">只展示线索，不剧透答案</div>
              <div style="margin-top:10px;color:rgba(0,0,0,0.72);line-height:1.75;font-family:var(--mono)">
                ${escapeHtml(String(data.setup || "").trim())}
              </div>
              ${list}
            </div>
          </div>
        </div>
      `);
    };

    document.getElementById("btnNotebookEin1")?.addEventListener("click", openNotebook);

    viewEl.querySelectorAll("[data-token-id][data-token-type]").forEach((el) => {
      const tokenId = el.getAttribute("data-token-id");
      const tokenType = el.getAttribute("data-token-type");
      if (!tokenId || !tokenType) return;

      el.addEventListener("dragstart", (e) => {
        try {
          e.dataTransfer?.setData("text/plain", `${tokenType}:${tokenId}`);
          e.dataTransfer.effectAllowed = "move";
        } catch {
          // ignore
        }
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("dragging"));

      const onClick = () => {
        const isPlaced = tokenType === "person" && el.hasAttribute("data-placed-person");
        if (isPlaced && cs.phase === "deduction") {
          cs.data.accusedId = cs.data.accusedId === tokenId ? "" : tokenId;
          persist();
          renderCase(caseDef.id);
          return;
        }
        cs.data.activeToken = { type: tokenType, id: tokenId };
        persist();
        renderCase(caseDef.id);
      };

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      });
    });

    viewEl.querySelectorAll("[data-drop][data-drop-type][data-room]").forEach((dz) => {
      const type = dz.getAttribute("data-drop-type");
      const roomId = dz.getAttribute("data-room");
      if (!type || !roomId) return;

      const applyToken = (token) => {
        if (!token) return;
        if (token.type !== type) {
          showWishlightDanmaku("放错啦：这个格子不收它。", "danger");
          toast("类型不匹配。");
          return;
        }
        setRoomToken({ roomId, type, tokenId: token.id });
        cs.data.activeToken = null;
        persist();
        renderCase(caseDef.id);
      };

      dz.addEventListener("click", (e) => {
        e.stopPropagation();
        applyToken(cs.data.activeToken);
      });
      dz.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          applyToken(cs.data.activeToken);
        }
      });

      dz.addEventListener("dragover", (e) => {
        e.preventDefault();
        dz.classList.add("over");
      });
      dz.addEventListener("dragleave", () => dz.classList.remove("over"));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove("over");
        const raw = e.dataTransfer?.getData("text/plain") || e.dataTransfer?.getData("text") || "";
        applyToken(decodeDragPayload(raw));
      });
    });

    viewEl.querySelectorAll("[data-clear]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-clear");
        const m = String(key || "").match(/^(person|item):(.+)$/);
        if (!m) return;
        clearRoomToken({ roomId: m[2], type: m[1] });
        persist();
        renderCase(caseDef.id);
      });
    });

    viewEl.querySelectorAll("[data-talk]").forEach((btn) => {
      const personId = btn.getAttribute("data-talk");
      if (!personId) return;
      const speak = () => {
        const quote = suspects.find((s) => s.id === personId)?.line || "";
        const card = btn.closest(".polaroid");
        const bubble = card?.querySelector(".speech");
        if (!bubble || !quote) return;
        bubble.textContent = quote;
        bubble.classList.remove("show");
        // eslint-disable-next-line no-unused-expressions
        bubble.offsetWidth;
        bubble.classList.add("show");
        window.clearTimeout(bubble.__t);
        bubble.__t = window.setTimeout(() => bubble.classList.remove("show"), 1600);
      };
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        speak();
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          speak();
        }
      });
    });

    document.getElementById("btnToDeduceEin1")?.addEventListener("click", () => {
      if (!isAllFilled()) return toast("先把每个房间的“人物+道具”都放好。");
      beginPhase(cs, "deduction");
      renderCase(caseDef.id);
    });

    document.getElementById("btnBackEin1")?.addEventListener("click", () => {
      cs.phase = "observation";
      persist();
      renderCase(caseDef.id);
    });

    document.getElementById("btnVoteEin1")?.addEventListener("click", () => {
      const verdict = validateEinstein(caseDef, cs);
      if (verdict.ok) {
        cs.data.keyOrder = caseDef.solution?.keyOrder || null;
        cs.data.memoryKey = data.memoryKey || null;
        persist();
        completeCase(caseDef, caseDef.solution?.revealText);
        return;
      }
      if (!state.settings?.reduceMotion) {
        try {
          navigator.vibrate?.(120);
        } catch {
          // ignore
        }
      }
      registerWrongAttempt(cs, verdict.reason || "侦探，这个推理有点离谱哦~");
      showWishlightDanmaku("侦探，这个推理有点离谱哦~", "danger");
      triggerShake(boardEl);
    });

    window.requestAnimationFrame(() => drawEinsteinLines(caseDef, cs));
  }

  function ensureEinsteinRoomAssignments(caseDef, cs) {
    const data = caseDef.data || {};
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const items = Array.isArray(data.items) ? data.items : [];

    cs.data.roomAssignments = cs.data.roomAssignments || {};
    const roomMap = cs.data.roomAssignments;

    const validRooms = new Set(rooms.map((r) => String(r.id || "").trim()).filter(Boolean));
    const validPeople = new Set(suspects.map((s) => String(s.id || "").trim()).filter(Boolean));
    const validItems = new Set(items.map((t) => String(t.id || "").trim()).filter(Boolean));

    // Remove stale rooms from older configurations.
    for (const k of Object.keys(roomMap)) {
      if (!validRooms.has(k)) delete roomMap[k];
    }

    // migrate older schema: cs.data.assignments[suspectId] = { locationId, itemId }
    if (cs.data.assignments && typeof cs.data.assignments === "object" && !Object.keys(roomMap).length) {
      for (const s of suspects) {
        const old = cs.data.assignments?.[s.id];
        const roomId = String(old?.locationId || "").trim();
        if (!roomId) continue;
        roomMap[roomId] = roomMap[roomId] || { personId: "", itemId: "" };
        roomMap[roomId].personId = s.id;
        if (old?.itemId) roomMap[roomId].itemId = String(old.itemId);
      }
      delete cs.data.assignments;
      persist();
    }

    for (const r of rooms) {
      roomMap[r.id] = roomMap[r.id] || { personId: "", itemId: "" };
      roomMap[r.id].personId = String(roomMap[r.id].personId || "");
      roomMap[r.id].itemId = String(roomMap[r.id].itemId || "");
      if (roomMap[r.id].personId && !validPeople.has(roomMap[r.id].personId)) roomMap[r.id].personId = "";
      if (roomMap[r.id].itemId && !validItems.has(roomMap[r.id].itemId)) roomMap[r.id].itemId = "";
    }

    const at = cs.data.activeToken;
    const okType = at && typeof at === "object" && (at.type === "person" || at.type === "item");
    if (!okType) cs.data.activeToken = null;
    else {
      const id = String(at.id || "").trim();
      const ok =
        (at.type === "person" && validPeople.has(id)) || (at.type === "item" && validItems.has(id));
      if (!ok) cs.data.activeToken = null;
    }

    const accusedId = String(cs.data.accusedId || "").trim();
    if (accusedId && !validPeople.has(accusedId)) cs.data.accusedId = "";

    return roomMap;
  }

  function computeEinsteinUsage(roomAssignments) {
    const personToRoom = {};
    const itemToRoom = {};
    const m = roomAssignments && typeof roomAssignments === "object" ? roomAssignments : {};
    for (const roomId of Object.keys(m)) {
      const a = m[roomId] || {};
      if (a.personId) personToRoom[a.personId] = roomId;
      if (a.itemId) itemToRoom[a.itemId] = roomId;
    }
    return { personToRoom, itemToRoom };
  }

  function validateEinstein(caseDef, cs) {
    const data = caseDef.data || {};
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const culpritId = String(caseDef.solution?.culpritId || "");
    const accusedId = String(cs.data.accusedId || "");
    const roomAssignments = cs.data.roomAssignments || {};

    if (!accusedId) return { ok: false, reason: "先点选你要检举的人（房间里的拍立得）。" };

    for (const r of rooms) {
      const a = roomAssignments[r.id] || {};
      if (!a.personId || !a.itemId) return { ok: false, reason: "证据链不完整：每个房间都要放入“人物+道具”。" };
    }

    const expectedPersonByRoom = {};
    const expectedItemByRoom = {};
    for (const s of suspects) {
      const roomId = String(s.correctRoomId || s.correctLocationId || "").trim();
      if (!roomId) continue;
      expectedPersonByRoom[roomId] = s.id;
      expectedItemByRoom[roomId] = s.correctItemId;
    }

    for (const r of rooms) {
      const a = roomAssignments[r.id] || {};
      if (a.personId !== expectedPersonByRoom[r.id] || a.itemId !== expectedItemByRoom[r.id]) {
        return { ok: false, reason: "证据链不闭环：人物/道具与线索对不上。" };
      }
    }

    if (culpritId && accusedId !== culpritId) return { ok: false, reason: "检举对象不对。再回线索本看看“紧挨着/右边/不是最右”。" };
    return { ok: true };
  }

  function drawEinsteinLines(caseDef, cs) {
    const board = document.getElementById("case1WishBoard");
    const svg = document.getElementById("case1WishLines");
    if (!board || !svg) return;
    const rect = board.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const data = caseDef.data || {};
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const roomAssignments = cs.data.roomAssignments || {};

    const paths = [];
    const circles = [];
    const connect = (aEl, bEl, seed) => {
      if (!aEl || !bEl) return;
      const ar = aEl.getBoundingClientRect();
      const br = bEl.getBoundingClientRect();
      const ax = ar.left - rect.left + ar.width / 2;
      const ay = ar.top - rect.top + ar.height / 2;
      const bx = br.left - rect.left + br.width / 2;
      const by = br.top - rect.top + br.height / 2;
      const dx = bx - ax;
      const dy = by - ay;
      const bend = ((seed * 11) % 10) - 5;
      const c1x = ax + dx * 0.25 + bend;
      const c1y = ay + dy * 0.18;
      const c2x = ax + dx * 0.75 - bend;
      const c2y = ay + dy * 0.82;
      const d = `M ${ax.toFixed(1)} ${ay.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
      paths.push(d);
      circles.push({ x: ax, y: ay }, { x: bx, y: by });
    };

    let idx = 0;
    for (const r of rooms) {
      const a = roomAssignments[r.id] || {};
      if (!a.personId || !a.itemId) continue;
      const personDz = board.querySelector(`[data-drop=\"person:${String(r.id)}\"]`);
      const itemDz = board.querySelector(`[data-drop=\"item:${String(r.id)}\"]`);
      connect(personDz, itemDz, idx++);
    }

    if (!paths.length) {
      svg.innerHTML = "";
      return;
    }

    const pathHtml = paths
      .map((d) => `<path class="glow" d="${escapeAttr(d)}"></path><path class="main" d="${escapeAttr(d)}"></path>`)
      .join("");
    const circleHtml = circles
      .map((p) => `<circle cx="${escapeAttr(p.x.toFixed(1))}" cy="${escapeAttr(p.y.toFixed(1))}" r="3.6"></circle>`)
      .join("");
    svg.innerHTML = `${pathHtml}${circleHtml}`;
  }

  // Case 1: wishlight-board
  function renderCase1Wishlight(caseDef, cs) {
    const data = caseDef.data || {};
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const items = Array.isArray(data.items) ? data.items : [];
    const locations = Array.isArray(data.locations) ? data.locations : [];
    const clues = Array.isArray(data.clues) ? data.clues : [];

    const assignments = cs.data.assignments || (cs.data.assignments = {});
    const accusedId = String(cs.data.accusedId || "");
    const activeToken =
      cs.data.activeToken && typeof cs.data.activeToken === "object" ? cs.data.activeToken : null;

    const suspectById = Object.fromEntries(suspects.map((s) => [s.id, s]));
    const itemById = Object.fromEntries(items.map((t) => [t.id, t]));
    const locById = Object.fromEntries(locations.map((t) => [t.id, t]));

    const usage = computeWishlightTokenUsage(assignments);

    const totalSlots = suspects.length * 2;
    let filledSlots = 0;
    for (const s of suspects) {
      const a = assignments[s.id] || {};
      if (a.itemId) filledSlots++;
      if (a.locationId) filledSlots++;
    }
    const allFilled = totalSlots > 0 && filledSlots >= totalSlots;

    const renderToken = (t, type) => {
      const usedBy = usage[type]?.[t.id] || "";
      const usedName = usedBy ? suspectById[usedBy]?.name || usedBy : "";
      const isActive = !!activeToken && activeToken.type === type && activeToken.id === t.id;
      const cls = `token${usedBy ? " used" : ""}${isActive ? " active" : ""}`;
      const title = usedBy ? `已连接到：${usedName}` : "点击选择 / 拖拽连接";
      return `
        <div class="${cls}" draggable="true"
          data-token-type="${escapeAttr(type)}"
          data-token-id="${escapeAttr(t.id)}"
          role="button" tabindex="0"
          title="${escapeAttr(title)}">
          <span class="token__icon" aria-hidden="true">${escapeHtml(t.icon || "🧩")}</span>
          <span class="token__name">${escapeHtml(t.name || "")}</span>
          ${usedBy ? `<span class="token__used" aria-hidden="true">●</span>` : ""}
        </div>
      `;
    };

    const renderSlot = ({ suspectId, slotType, label, token }) => {
      const has = !!token;
      const placeholder = slotType === "item" ? "拖拽/点选下方道具" : "拖拽/点选下方位置";
      const value = has
        ? `<span class="slot__chip"><span aria-hidden="true">${escapeHtml(token.icon || "🧩")}</span> ${escapeHtml(token.name || "")}</span>`
        : `<span class="slot__placeholder">${escapeHtml(placeholder)}</span>`;
      const clearBtn = has
        ? `<button class="slot__clear" type="button" data-clear="${escapeAttr(`${suspectId}:${slotType}`)}" aria-label="清空">×</button>`
        : "";
      return `
        <div class="slot" data-slot="${escapeAttr(`${suspectId}:${slotType}`)}"
          data-slot-type="${escapeAttr(slotType)}"
          data-suspect="${escapeAttr(suspectId)}"
          role="button" tabindex="0">
          <div class="slot__top">
            <span class="badge">${escapeHtml(label)}</span>
            ${clearBtn}
          </div>
          <div class="slot__value">${value}</div>
        </div>
      `;
    };

    const suspectCards = suspects
      .map((s) => {
        const a = assignments[s.id] || {};
        const itemToken = a.itemId ? itemById[a.itemId] : null;
        const locToken = a.locationId ? locById[a.locationId] : null;
        const accused = cs.phase === "deduction" && accusedId === s.id;
        const cls = `suspect-card${accused ? " accused" : ""}`;
        const aria = cs.phase === "deduction" ? `选择检举对象：${s.name}` : `角色卡：${s.name}`;
        return `
          <article class="${cls}" data-suspect-card="${escapeAttr(s.id)}" role="button" tabindex="0" aria-label="${escapeAttr(aria)}">
            <div class="suspect__head">
              <button class="suspect__avatar" type="button" data-quote="${escapeAttr(s.line || "")}" aria-label="${escapeAttr(`${s.name} 发言`)}">${escapeHtml(s.avatar || "🧩")}</button>
              <div class="suspect__meta">
                <div class="suspect__name">${escapeHtml(s.name || "")}</div>
                <div class="suspect__role">${escapeHtml(s.role || "")}</div>
                <div class="suspect__line">${escapeHtml(s.line || "")}</div>
              </div>
              ${cs.phase === "deduction" ? `<div class="suspect__pick">${accused ? "已选" : "点选"}</div>` : ""}
            </div>
            <div class="suspect__slots">
              ${renderSlot({ suspectId: s.id, slotType: "location", label: "位置", token: locToken })}
              ${renderSlot({ suspectId: s.id, slotType: "item", label: "道具", token: itemToken })}
            </div>
            <div class="speech" aria-hidden="true"></div>
          </article>
        `;
      })
      .join("");

    const itemTokens = items.map((t) => renderToken(t, "item")).join("");
    const locTokens = locations.map((t) => renderToken(t, "location")).join("");

    const notebook = `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">${escapeHtml(data.notebookTitle || "搜证板")}</h3>
          <p class="panel__subtitle">${escapeHtml(data.setup || "")}</p>
        </div>
        <div class="panel__body">
          <div class="hintbox" style="margin-top:0">
            <div><span class="badge">案件名</span> <span class="mono">${escapeHtml(data.caseName || caseDef.title || "")}</span></div>
            <div style="margin-top:8px"><span class="badge">侦探</span> <span class="mono">${escapeHtml(data.detective || "")}</span></div>
          </div>
          <ol class="clue-list">
            ${clues.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
          </ol>
          <div class="hintbox" style="margin-top:12px">
            拖拽不方便时：先点选下方图标 → 再点角色卡槽位。<br/>
            点击头像会弹出“花字气泡”。
          </div>
        </div>
      </div>
    `;

    const boardHeaderText =
      cs.phase === "deduction"
        ? "选择嫌疑人，然后点击右下角金色鸟笼进行检举。"
        : "把“道具”和“位置”拖到对应角色卡上，整理出证据链。";
    const accusedName = accusedId ? suspectById[accusedId]?.name || accusedId : "";
    const canVote = allFilled && !!accusedId;
    const voteBtn = `
      <button id="btnVoteWish1" class="cage-btn" type="button" ${canVote ? "" : "disabled"}>
        ${escapeHtml(data.voteButtonText || "去检举")}
      </button>
    `;

    const board = `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">案情板 · 角色与红线</h3>
          <p class="panel__subtitle">${escapeHtml(boardHeaderText)}</p>
        </div>
        <div class="panel__body">
          <div class="board wish-board" id="case1WishBoard">
            <svg id="case1WishLines" class="board-lines" aria-hidden="true"></svg>
            <div id="case1Danmaku" class="danmaku" aria-hidden="true"></div>
            <div class="suspects-grid">${suspectCards}</div>
            <div class="inventory">
              <div class="inventory__group">
                <div class="inventory__title"><span class="badge">道具</span></div>
                <div class="token-row">${itemTokens}</div>
              </div>
              <div class="inventory__group">
                <div class="inventory__title"><span class="badge">位置</span></div>
                <div class="token-row">${locTokens}</div>
              </div>
            </div>
            ${cs.phase === "deduction" ? voteBtn : ""}
          </div>
          <div class="row" style="margin-top:12px">
            <div class="badge">已连接：<span class="mono">${escapeHtml(String(filledSlots))}</span> / ${escapeHtml(String(totalSlots || 10))}</div>
            ${
              cs.phase === "observation"
                ? `<button id="btnToDeduceWish1" class="btn btn-primary" type="button" ${allFilled ? "" : "disabled"}>进入检举</button>`
                : `<button id="btnBackWish1" class="btn btn-ghost" type="button">返回搜证</button>`
            }
          </div>
          ${
            cs.phase === "deduction"
              ? `<div class="hintbox" style="margin-top:12px">
                  当前检举：<span class="mono">${escapeHtml(accusedName || "—")}</span>。
                  （提示：先选中嫌疑人，再点鸟笼）
                </div>`
              : ""
          }
        </div>
      </div>
    `;

    return `
      <div class="wishlight-layout">
        ${notebook}
        ${board}
      </div>
    `;
  }

  function bindCase1Wishlight(caseDef, cs) {
    const data = caseDef.data || {};
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const assignments = cs.data.assignments || (cs.data.assignments = {});

    const boardEl = document.getElementById("case1WishBoard");

    const decodeDragPayload = (raw) => {
      const s = String(raw || "").trim();
      const m = s.match(/^(item|location):(.+)$/);
      if (!m) return null;
      return { type: m[1], id: m[2] };
    };

    const getAllFilled = () => {
      const totalSlots = suspects.length * 2;
      let filled = 0;
      for (const s of suspects) {
        const a = assignments[s.id] || {};
        if (a.itemId) filled++;
        if (a.locationId) filled++;
      }
      return totalSlots > 0 && filled >= totalSlots;
    };

    const setAssignment = ({ suspectId, slotType, tokenId }) => {
      const slotKey = slotType === "location" ? "locationId" : "itemId";
      if (!assignments[suspectId]) assignments[suspectId] = {};
      for (const sid of Object.keys(assignments)) {
        if (sid === suspectId) continue;
        if (assignments[sid]?.[slotKey] === tokenId) assignments[sid][slotKey] = "";
      }
      assignments[suspectId][slotKey] = tokenId;
    };

    const clearAssignment = ({ suspectId, slotType }) => {
      const slotKey = slotType === "location" ? "locationId" : "itemId";
      if (!assignments[suspectId]) return;
      assignments[suspectId][slotKey] = "";
    };

    viewEl.querySelectorAll("[data-token-id][data-token-type]").forEach((el) => {
      const tokenId = el.getAttribute("data-token-id");
      const tokenType = el.getAttribute("data-token-type");
      if (!tokenId || !tokenType) return;

      el.addEventListener("dragstart", (e) => {
        try {
          e.dataTransfer?.setData("text/plain", `${tokenType}:${tokenId}`);
          e.dataTransfer.effectAllowed = "move";
        } catch {
          // ignore
        }
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("dragging"));

      const onPick = () => {
        cs.data.activeToken = { type: tokenType, id: tokenId };
        persist();
        renderCase(caseDef.id);
      };
      el.addEventListener("click", onPick);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onPick();
      });
    });

    viewEl.querySelectorAll("[data-slot][data-slot-type][data-suspect]").forEach((slot) => {
      const suspectId = slot.getAttribute("data-suspect");
      const slotType = slot.getAttribute("data-slot-type");
      if (!suspectId || !slotType) return;

      const applyToken = (token) => {
        if (!token) return;
        if (token.type !== slotType) {
          showWishlightDanmaku("放错位置啦~ 这个槽位不收它。", "danger");
          toast("槽位类型不匹配。");
          return;
        }
        setAssignment({ suspectId, slotType, tokenId: token.id });
        cs.data.activeToken = null;
        persist();
        renderCase(caseDef.id);
      };

      slot.addEventListener("click", (e) => {
        e.stopPropagation();
        applyToken(cs.data.activeToken);
      });
      slot.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          applyToken(cs.data.activeToken);
        }
      });

      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("over"));
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove("over");
        const raw = e.dataTransfer?.getData("text/plain") || e.dataTransfer?.getData("text") || "";
        applyToken(decodeDragPayload(raw));
      });
    });

    viewEl.querySelectorAll("[data-clear]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-clear");
        const m = String(key || "").match(/^([^:]+):(item|location)$/);
        if (!m) return;
        clearAssignment({ suspectId: m[1], slotType: m[2] });
        persist();
        renderCase(caseDef.id);
      });
    });

    viewEl.querySelectorAll("[data-quote]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = btn.closest(".suspect-card");
        const bubble = card?.querySelector(".speech");
        if (!bubble) return;
        bubble.textContent = btn.getAttribute("data-quote") || "……";
        bubble.classList.remove("show");
        // eslint-disable-next-line no-unused-expressions
        bubble.offsetWidth;
        bubble.classList.add("show");
        window.clearTimeout(bubble.__t);
        bubble.__t = window.setTimeout(() => bubble.classList.remove("show"), 1800);
      });
    });

    viewEl.querySelectorAll("[data-suspect-card]").forEach((card) => {
      const suspectId = card.getAttribute("data-suspect-card");
      if (!suspectId) return;
      const pick = () => {
        if (cs.phase !== "deduction") return toast("先完成搜证并进入检举。");
        cs.data.accusedId = cs.data.accusedId === suspectId ? "" : suspectId;
        persist();
        renderCase(caseDef.id);
      };
      card.addEventListener("click", pick);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") pick();
      });
    });

    const btnToDeduce = document.getElementById("btnToDeduceWish1");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        if (!getAllFilled()) return toast("证据链还没连完整：先把每个人的道具和位置都填上。");
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    const btnBack = document.getElementById("btnBackWish1");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        cs.phase = "observation";
        persist();
        renderCase(caseDef.id);
      });
    }

    const btnVote = document.getElementById("btnVoteWish1");
    if (btnVote) {
      btnVote.addEventListener("click", () => {
        const verdict = validateWishlightBoard(caseDef, cs);
        if (verdict.ok) {
          cs.data.keyOrder = caseDef.solution?.keyOrder || null;
          cs.data.memoryKey = data.memoryKey || null;
          persist();
          completeCase(caseDef, caseDef.solution?.revealText);
          return;
        }
        if (!state.settings?.reduceMotion) {
          try {
            navigator.vibrate?.(120);
          } catch {
            // ignore
          }
        }
        registerWrongAttempt(cs, verdict.reason || "侦探，这个推理有点离谱哦~");
        showWishlightDanmaku("侦探，这个推理有点离谱哦~", "danger");
        triggerShake(boardEl);
      });
    }

    window.requestAnimationFrame(() => drawWishlightBoardLines(caseDef, cs));
  }

  function computeWishlightTokenUsage(assignments) {
    const used = { item: {}, location: {} };
    const a = assignments && typeof assignments === "object" ? assignments : {};
    for (const sid of Object.keys(a)) {
      const row = a[sid] || {};
      if (row.itemId) used.item[row.itemId] = sid;
      if (row.locationId) used.location[row.locationId] = sid;
    }
    return used;
  }

  function validateWishlightBoard(caseDef, cs) {
    const data = caseDef.data || {};
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const culpritId = String(caseDef.solution?.culpritId || "");
    const accusedId = String(cs.data.accusedId || "");
    const assignments = cs.data.assignments || {};

    if (!accusedId) return { ok: false, reason: "先选择一位嫌疑人，再检举。" };

    for (const s of suspects) {
      const a = assignments[s.id] || {};
      if (!a.itemId || !a.locationId) return { ok: false, reason: "证据链不完整：每个人都需要道具与位置。" };
    }

    for (const s of suspects) {
      const a = assignments[s.id] || {};
      if (a.itemId !== s.correctItemId || a.locationId !== s.correctLocationId) {
        return { ok: false, reason: "证据链不闭环：道具/位置还对不上。" };
      }
    }

    if (culpritId && accusedId !== culpritId) return { ok: false, reason: "检举目标不对。再看看证词 A/B 与真相拼图。" };
    return { ok: true };
  }

  function drawWishlightBoardLines(caseDef, cs) {
    const board = document.getElementById("case1WishBoard");
    const svg = document.getElementById("case1WishLines");
    if (!board || !svg) return;
    const rect = board.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const data = caseDef.data || {};
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];
    const assignments = cs.data.assignments || {};

    const paths = [];
    const circles = [];
    const connect = (slotSel, tokenSel, seed) => {
      const slotEl = board.querySelector(slotSel);
      const tokenEl = board.querySelector(tokenSel);
      if (!slotEl || !tokenEl) return;
      const sr = slotEl.getBoundingClientRect();
      const tr = tokenEl.getBoundingClientRect();
      const sx = sr.left - rect.left + sr.width / 2;
      const sy = sr.top - rect.top + sr.height / 2;
      const tx = tr.left - rect.left + tr.width / 2;
      const ty = tr.top - rect.top + tr.height / 2;
      const dx = tx - sx;
      const dy = ty - sy;
      const bend = ((seed * 13) % 14) - 7;
      const c1x = sx + dx * 0.25;
      const c1y = sy + dy * 0.12 + bend;
      const c2x = sx + dx * 0.75;
      const c2y = sy + dy * 0.88 - bend;
      const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
      paths.push(d);
      circles.push({ x: sx, y: sy }, { x: tx, y: ty });
    };

    let idx = 0;
    for (const s of suspects) {
      const a = assignments[s.id] || {};
      if (a.locationId) {
        connect(
          `[data-slot="${String(s.id)}:location"]`,
          `[data-token-type="location"][data-token-id="${String(a.locationId)}"]`,
          idx++,
        );
      }
      if (a.itemId) {
        connect(
          `[data-slot="${String(s.id)}:item"]`,
          `[data-token-type="item"][data-token-id="${String(a.itemId)}"]`,
          idx++,
        );
      }
    }

    if (!paths.length) {
      svg.innerHTML = "";
      return;
    }

    const pathHtml = paths
      .map((d) => `<path class="glow" d="${escapeAttr(d)}"></path><path class="main" d="${escapeAttr(d)}"></path>`)
      .join("");
    const circleHtml = circles
      .map((p) => `<circle cx="${escapeAttr(p.x.toFixed(1))}" cy="${escapeAttr(p.y.toFixed(1))}" r="3.9"></circle>`)
      .join("");
    svg.innerHTML = `${pathHtml}${circleHtml}`;
  }

  function showWishlightDanmaku(text, tone) {
    const el = document.getElementById("case1Danmaku");
    if (!el) return;
    el.textContent = String(text || "");
    el.classList.remove("show", "danger", "ok");
    if (tone) el.classList.add(String(tone));
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add("show");
    window.clearTimeout(el.__t);
    el.__t = window.setTimeout(() => el.classList.remove("show"), 1800);
  }

  function triggerShake(el) {
    if (!el || state.settings?.reduceMotion) return;
    el.classList.remove("shake");
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add("shake");
    window.setTimeout(() => el.classList.remove("shake"), 520);
  }

  // Case 1: evidence-select
  function renderCase1(caseDef, cs) {
    const required = caseDef.data?.requiredCount ?? 6;
    const selected = cs.data.selectedIds || [];
    const cards = (caseDef.data?.evidenceCards || [])
      .map((c) => {
        const isSel = selected.includes(c.id);
        return `
          <div class="evidence ${isSel ? "selected" : ""}" data-ev="${escapeHtml(c.id)}" role="button" tabindex="0">
            <div class="row" style="gap:8px">
              <div class="evidence__title">${escapeHtml(c.title)}</div>
              <div class="badge">${escapeHtml(c.id)}</div>
            </div>
            <div class="evidence__text">${escapeHtml(c.text)}</div>
          </div>
        `;
      })
      .join("");

    const obs = `
      <div class="split">
        <div class="panel" style="box-shadow:none">
          <div class="panel__header">
            <h3 class="panel__title">委托书</h3>
            <p class="panel__subtitle">从 12 张证物里找出 ${required} 张真线索。</p>
          </div>
            <div class="panel__body">
              <div class="board" id="case1Board">
                <svg id="case1Lines" class="board-lines" aria-hidden="true"></svg>
                <div class="grid cols-3" id="case1Grid">${cards}</div>
              </div>
              <div class="row" style="margin-top:12px">
                <div class="badge">已选择：<span class="mono">${selected.length}</span> / ${required}</div>
                <button id="btnToDeduce1" class="btn btn-primary" type="button" ${selected.length === required ? "" : "disabled"}>进入推理</button>
              </div>
            </div>
        </div>
        <div class="panel" style="box-shadow:none">
          <div class="panel__header">
            <h3 class="panel__title">线索板</h3>
            <p class="panel__subtitle">你选中的证物会出现在这里。</p>
          </div>
          <div class="panel__body">
            ${selected.length ? selected.map((id) => `<span class="badge" style="margin:4px 6px 0 0">${escapeHtml(id)}</span>`).join("") : `<div class="hintbox">还没有线索。</div>`}
          </div>
        </div>
      </div>
    `;

    const deduce = `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">确认：这 ${required} 张就是“真线索”吗？</h3>
          <p class="panel__subtitle">提交错误会累计“暴力破解惩罚”。</p>
        </div>
        <div class="panel__body">
          <div class="hintbox">你提交的组合：${selected.map((id) => `<span class="mono">${escapeHtml(id)}</span>`).join(" · ")}</div>
          <div class="row" style="margin-top:12px">
            <button id="btnBack1" class="btn btn-ghost" type="button">返回搜证</button>
            <button id="btnSubmit1" class="btn btn-primary" type="button">提交真相</button>
          </div>
        </div>
      </div>
    `;

    return cs.phase === "observation" ? obs : deduce;
  }

  function bindCase1(caseDef, cs) {
    const required = caseDef.data?.requiredCount ?? 6;
    const selected = cs.data.selectedIds || (cs.data.selectedIds = []);

    viewEl.querySelectorAll("[data-ev]").forEach((card) => {
      const onToggle = () => {
        if (cs.phase !== "observation") return;
        const id = card.getAttribute("data-ev");
        const idx = selected.indexOf(id);
        if (idx >= 0) selected.splice(idx, 1);
        else {
          if (selected.length >= required) return toast(`最多只能选择 ${required} 张证物。`);
          selected.push(id);
        }
        persist();
        renderCase(caseDef.id);
      };
      card.addEventListener("click", onToggle);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onToggle();
      });
    });

    const btnToDeduce = document.getElementById("btnToDeduce1");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    const btnBack = document.getElementById("btnBack1");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        cs.phase = "observation";
        persist();
        renderCase(caseDef.id);
      });
    }

    const btnSubmit = document.getElementById("btnSubmit1");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        const truth = (caseDef.data?.truthIds || []).slice().sort().join(",");
        const pick = selected.slice().sort().join(",");
        if (truth === pick) {
          cs.data.keyOrder = caseDef.solution?.keyOrder || null;
          persist();
          completeCase(caseDef, caseDef.solution?.revealText);
          return;
        }
        registerWrongAttempt(cs, "证物组合不对。注意排除“看起来合理但时间对不上”的干扰项。");
      });
    }

    if (cs.phase === "observation") {
      window.requestAnimationFrame(() => drawCase1BoardLines(selected));
    }
  }

  // Case 2: mind-palace
  function parseCase2Ymd(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) {
      const y = Math.max(1970, Math.min(2100, Number(m[1]) || 0));
      const mon = Math.max(1, Math.min(12, Number(m[2]) || 0));
      const d = Math.max(1, Math.min(31, Number(m[3]) || 0));
      const ts = Date.UTC(y, mon - 1, d);
      const pad2 = (n) => String(n).padStart(2, "0");
      return { y, mon, d, ts, stamp: `${y}.${pad2(mon)}.${pad2(d)}` };
    }
    const t = Date.parse(s);
    if (Number.isFinite(t)) {
      const dt = new Date(t);
      const y = dt.getFullYear();
      const mon = dt.getMonth() + 1;
      const d = dt.getDate();
      const pad2 = (n) => String(n).padStart(2, "0");
      return { y, mon, d, ts: t, stamp: `${y}.${pad2(mon)}.${pad2(d)}` };
    }
    return { y: 0, mon: 0, d: 0, ts: NaN, stamp: s || "—" };
  }

  function makeCase2Tag(id) {
    const s = String(id || "M").trim() || "M";
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const n = (h >>> 0) % (26 * 26 * 100);
    const a = String.fromCharCode(65 + Math.floor(n / 2600));
    const b = String.fromCharCode(65 + Math.floor((n % 2600) / 100));
    const d = String(n % 100).padStart(2, "0");
    return `${a}${b}-${d}`;
  }

  function getCase2WarmTag(id) {
    const warmTags = {
      P01: "烛光",
      P02: "奶油",
      P03: "彩带",
      P04: "礼物",
      P05: "气球",
      P06: "花束",
      P07: "心愿",
      P08: "月色",
      P09: "晚风",
      P10: "星灯",
      P11: "笑眼",
      P12: "零点",
    };
    return String(warmTags[String(id || "").trim()] || "").trim();
  }

  function sampleCase2Polyline(pts, count) {
    const points = Array.isArray(pts) ? pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
    const n = Math.max(0, count | 0);
    if (n <= 0) return [];
    if (points.length < 2) return Array.from({ length: n }, () => ({ x: 50, y: 50 }));
    if (n === 1) return [{ x: points[0].x, y: points[0].y }];

    const segLens = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segLens.push(len);
      total += len;
    }
    if (total <= 0) return Array.from({ length: n }, () => ({ x: points[0].x, y: points[0].y }));

    const out = [];
    for (let i = 0; i < n; i++) {
      const dist = (total * i) / (n - 1);
      let acc = 0;
      let seg = 0;
      while (seg < segLens.length && acc + segLens[seg] < dist) {
        acc += segLens[seg];
        seg += 1;
      }
      const a = points[Math.min(seg, points.length - 2)];
      const b = points[Math.min(seg + 1, points.length - 1)];
      const len = segLens[Math.min(seg, segLens.length - 1)] || 1;
      const t = Math.max(0, Math.min(1, (dist - acc) / len));
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  }

  function layoutCase2MindPalacePoints(count) {
    const n = Math.max(0, count | 0);
    if (!n) return [];

    const digit2 = [
      { x: 18, y: 18 },
      { x: 42, y: 18 },
      { x: 42, y: 44 },
      { x: 18, y: 44 },
      { x: 18, y: 70 },
      { x: 42, y: 70 },
    ];

    if (n <= 7) {
      const minX = Math.min(...digit2.map((p) => p.x));
      const maxX = Math.max(...digit2.map((p) => p.x));
      const centerX = (minX + maxX) / 2;
      const offsetX = 50 - centerX;
      const single = sampleCase2Polyline(digit2, n).map((p) => ({ x: p.x + offsetX, y: p.y }));
      return single;
    }

    const n1 = Math.ceil(n / 2);
    const n2 = n - n1;
    const left = sampleCase2Polyline(digit2, n1);
    const right = sampleCase2Polyline(digit2, Math.max(2, n2)).map((p) => ({ x: p.x + 44, y: p.y }));
    return right.length > n2 ? left.concat(right.slice(0, n2)) : left.concat(right);
  }

  function makeCase2Rng(seed) {
    const s = String(seed || "case2");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function renderCase2FieldFx(memories) {
    const count = Array.isArray(memories) ? memories.length : 0;
    const rand = makeCase2Rng(`case2:${count}`);
    const cols = Math.max(7, Math.min(11, Math.round(count * 0.75)));
    const particles = Math.max(18, Math.min(34, Math.round(count * 2.2)));

    const colText = "010101001100101001011010010101001010110010101010";
    const rain = Array.from({ length: cols }, (_, i) => {
      const x = (i + 0.5) * (100 / cols) + (rand() - 0.5) * 8;
      const dur = 6 + rand() * 5.5;
      const delay = -rand() * dur;
      const size = 9 + rand() * 2.5;
      const op = 0.06 + rand() * 0.08;
      const sliceStart = Math.floor(rand() * 10);
      const text = colText.slice(sliceStart) + colText.slice(0, sliceStart);
      return `<span class="mp-rain__col mono" style="--x:${x.toFixed(2)}%;--dur:${dur.toFixed(2)}s;--delay:${delay.toFixed(
        2,
      )}s;--fs:${size.toFixed(2)}px;--op:${op.toFixed(3)}">${escapeHtml(
        text,
      )}</span>`;
    }).join("");

    const dust = Array.from({ length: particles }, (_, i) => {
      const x = rand() * 100;
      const y = rand() * 100;
      const s = 1 + rand() * 2.2;
      const o = 0.22 + rand() * 0.38;
      const drift = 10 + rand() * 22;
      const dur = 4.6 + rand() * 6.8;
      const delay = -rand() * dur;
      const tint = rand() < 0.25 ? "violet" : "cyan";
      return `<span class="mp-p mp-p--${tint}" style="--x:${x.toFixed(2)}%;--y:${y.toFixed(2)}%;--s:${s.toFixed(
        2,
      )}px;--o:${o.toFixed(3)};--drift:${drift.toFixed(2)}px;--dur:${dur.toFixed(2)}s;--delay:${delay.toFixed(
        2,
      )}s"></span>`;
    }).join("");

    return `
      <div class="mp-fx" aria-hidden="true">
        <div class="mp-rain">${rain}</div>
        <div class="mp-particles">${dust}</div>
      </div>
    `;
  }

  function getCase2Memories(caseDef) {
    const raw = Array.isArray(caseDef.data?.memories) ? caseDef.data.memories : [];
    const items = raw
      .map((m, i) => {
        const id = String(m?.id || `M${i + 1}`).trim() || `M${i + 1}`;
        const parsed = parseCase2Ymd(m?.date);
        const x = Number(m?.x);
        const y = Number(m?.y);
        const ord = Number(m?.order);
        const hasOrder = Number.isFinite(ord) && ord > 0;
        const ts = Number.isFinite(parsed.ts) ? parsed.ts : i;
        const sort = hasOrder ? ord : ts;

        const mon = parsed.mon;
        const label = String(m?.label || m?.monthLabel || "").trim() || (mon ? `${mon}月` : "");
        const tag = String(m?.tag || getCase2WarmTag(id) || "").trim() || makeCase2Tag(id);
        return {
          id,
          sort,
          order: hasOrder ? ord : null,
          ts,
          stamp: String(m?.stamp || parsed.stamp || m?.date || "").trim() || "—",
          label,
          tag,
          img: String(m?.img || "").trim(),
          letter: String(m?.letter || "").trim(),
          x: Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : NaN,
          y: Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : NaN,
        };
      })
      .filter((m) => m.id);

    const sorted = items.slice().sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    const layout = layoutCase2MindPalacePoints(sorted.length);
    for (let i = 0; i < sorted.length; i++) {
      const p = layout[i] || { x: 50, y: 50 };
      if (!Number.isFinite(sorted[i].x)) sorted[i].x = p.x;
      if (!Number.isFinite(sorted[i].y)) sorted[i].y = p.y;
    }
    return sorted;
  }

  function renderCase2(caseDef, cs) {
    const intro = String(caseDef.data?.intro || "").trim();
    const nodeLabelMode = String(caseDef.data?.nodeLabelMode || "none").toLowerCase(); // none | tag | label
    const showStamp = !!caseDef.data?.showStamp;
    const showKicker = !!caseDef.data?.showKicker;
    const memories = getCase2Memories(caseDef);
    if (!memories.length) {
      return `<div class="hintbox">第 2 关未配置 <span class="mono">data.memories</span>。</div>`;
    }

    cs.data.chain = Array.isArray(cs.data.chain) ? cs.data.chain : [];
    const byId = Object.fromEntries(memories.map((m) => [m.id, m]));
    const expected = memories.map((m) => m.id);

    const chain = [];
    for (const id of cs.data.chain) {
      if (!byId[id]) continue;
      if (chain.includes(id)) continue;
      if (expected[chain.length] !== id) break;
      chain.push(id);
    }
    if (chain.length !== cs.data.chain.length) {
      cs.data.chain = chain;
      persist();
    }

    const points = chain.map((id) => byId[id]).filter(Boolean);
    const pathD = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${Number(p.x).toFixed(2)} ${Number(p.y).toFixed(2)}`)
      .join(" ");

    const partialPass = chain.map((id) => byId[id]?.letter || "").join("");
    const progress = `${chain.length} / ${expected.length}`;

    const nodeHtml = memories
      .map((m, idx) => {
        const done = chain.includes(m.id);
        const tail = cs.phase === "deduction" && chain.length && chain[chain.length - 1] === m.id && chain.length < expected.length;
        // Popover card is large; flip only for very-low nodes to avoid clipping at the top.
        const flip = Number(m.y) > 62;
        const cls = `mem-node${done ? " done" : ""}${tail ? " tail" : ""}${flip ? " flip" : ""}`;
        const imgVar = m.img ? `--img:url("${m.img}")` : "--img:none";
        const xPct = Number(m.x);
        const popShift = Number.isFinite(xPct)
          ? xPct < 25
            ? Math.round(Math.min(200, (25 - xPct) * 10))
            : xPct > 75
              ? -Math.round(Math.min(200, (xPct - 75) * 10))
              : 0
          : 0;
        const aria = `记忆胶囊 ${m.tag || ""}`.trim();
        const labelText =
          nodeLabelMode === "label" ? (m.label || m.tag || "") : nodeLabelMode === "tag" ? (m.tag || "") : "";
        return `
          <button class="${cls}" type="button"
            data-mem="${escapeAttr(m.id)}"
            data-x="${escapeAttr(String(m.x))}"
            data-y="${escapeAttr(String(m.y))}"
            style="left:${escapeAttr(String(m.x))}%;top:${escapeAttr(String(m.y))}%;--pop-x:${escapeAttr(String(popShift))}px"
            aria-label="${escapeAttr(aria)}">
            <span class="mem-node__ring" aria-hidden="true"></span>
            <span class="mem-node__core" aria-hidden="true"></span>
            ${labelText ? `<span class="mem-node__label mono">${escapeHtml(labelText)}</span>` : ""}
            ${showKicker ? `<span class="mem-node__kicker mono">MEM_${escapeHtml(String(idx + 1).padStart(2, "0"))}</span>` : ""}
            <span class="mem-pop" aria-hidden="true">
              <span class="mem-pop__card" style="${escapeAttr(imgVar)}">
                ${showStamp ? `<span class="mem-pop__stamp mono">${escapeHtml(m.stamp)}</span>` : ""}
              </span>
            </span>
          </button>
        `;
      })
      .join("");

    const palace = `
      <div class="mindpalace">
        <div class="mindpalace__top">
          <div class="badge">进度</div>
          <div class="mono">${escapeHtml(progress)}</div>
          <div class="badge">口令碎片</div>
          <div class="mono">${escapeHtml(partialPass || "—")}</div>
        </div>
        <div class="mindpalace__field" id="case2Field" data-phase="${escapeAttr(String(cs.phase || ""))}" aria-label="思维殿堂：记忆胶囊连线区">
          ${renderCase2FieldFx(memories)}
          <div class="mp-alert" aria-hidden="true"></div>
          <svg class="mind-svg" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="mindLaser" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="rgba(255, 121, 198, 0.18)"></stop>
                <stop offset="0.35" stop-color="rgba(255, 121, 198, 0.92)"></stop>
                <stop offset="0.7" stop-color="rgba(255, 214, 240, 0.62)"></stop>
                <stop offset="1" stop-color="rgba(255, 121, 198, 0.25)"></stop>
              </linearGradient>
            </defs>
            <path class="mind-path mind-path--glow" d="${escapeAttr(pathD)}"></path>
            <path class="mind-path" d="${escapeAttr(pathD)}"></path>
            <path id="case2Live" class="mind-live" d=""></path>
          </svg>
          ${nodeHtml}
        </div>
      </div>
    `;

    if (cs.phase === "observation") {
      return `
        <div class="panel panel--popovers" style="box-shadow:none">
              <div class="panel__header">
                <h3 class="panel__title">思维殿堂 · 全息记忆</h3>
                <p class="panel__subtitle">先观察：点击胶囊看照片（电脑端可悬停快速预览），找出最早和最晚的两张。</p>
              </div>
          <div class="panel__body">
            ${intro ? `<div class="hintbox">${escapeHtml(intro)}</div>` : ""}
            ${palace}
            <div class="row" style="margin-top:12px">
              <div class="badge">提示：按照片先后顺序连接</div>
              <button id="btnToDeduce2" class="btn btn-primary" type="button">进入推理（开始连线）</button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="panel panel--popovers" style="box-shadow:none">
          <div class="panel__header">
            <h3 class="panel__title">推理：时间线连线</h3>
            <p class="panel__subtitle">按照片的先后顺序从早到晚连接：按住端点拖到下一颗，或直接点下一颗。连错会触发“时序警报”。</p>
          </div>
        <div class="panel__body">
          ${palace}
          <div class="row" style="margin-top:12px">
            <button id="btnBack2" class="btn btn-ghost" type="button">返回观察</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
              <button id="btnReset2" class="btn btn-ghost" type="button">重置连线</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function pickCase2WittyWarning(need, got, tries) {
    const g = String(got || "").trim();
    const k = (tries || 0) % 6;
    const tail = g ? `（你点了「${g}」）` : "";
    if (k === 0) return `时间线冲突：这一步像穿越，已重置。${tail}`;
    if (k === 1) return `侦探警告：你刚刚那一笔太超前了，已重置。${tail}`;
    if (k === 2) return `警报：时空管理局已上线。你的连线被打回重做。${tail}`;
    if (k === 3) return `这条线连得很浪漫，但逻辑不允许。已重置。${tail}`;
    if (k === 4) return `你成功发明了“时间折叠”。很酷，但不算。已重置。${tail}`;
    return `时序警报：顺序不对，已重置。${tail}`;
  }

  function bindCase2(caseDef, cs) {
    const memories = getCase2Memories(caseDef);
    if (!memories.length) return;

    const byId = Object.fromEntries(memories.map((m) => [m.id, m]));
    const expected = memories.map((m) => m.id);
    cs.data.chain = Array.isArray(cs.data.chain) ? cs.data.chain : [];

    const field = document.getElementById("case2Field");
    const live = document.getElementById("case2Live");

    const resetChain = (withToast) => {
      cs.data.chain = [];
      cs.data.passphrase = "";
      persist();
      if (withToast) toast("已重置连线。");
      renderCase(caseDef.id);
    };

    const chainRef = () => (Array.isArray(cs.data.chain) ? cs.data.chain : (cs.data.chain = []));
    const nextId = () => expected[chainRef().length] || "";

    const clearLive = () => {
      if (!live) return;
      live.setAttribute("d", "");
    };

    const updateLiveWithRect = (fromId, clientX, clientY, rect) => {
      if (!live) return;
      const from = byId[fromId];
      if (!from) return;
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
      live.setAttribute("d", `M ${Number(from.x).toFixed(2)} ${Number(from.y).toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`);
    };

    let dragRect = null;
    let liveRaf = null;
    let liveFrom = "";
    let liveX = 0;
    let liveY = 0;

    const scheduleLive = () => {
      if (!dragRect || !liveFrom) return;
      if (liveRaf) return;
      liveRaf = window.requestAnimationFrame(() => {
        liveRaf = null;
        if (!dragRect || !liveFrom) return;
        updateLiveWithRect(liveFrom, liveX, liveY, dragRect);
      });
    };

    const flashFieldErrorAfterRender = () => {
      if (state.settings?.reduceMotion) return;
      window.requestAnimationFrame(() => {
        const f = document.getElementById("case2Field");
        if (!f) return;
        f.classList.remove("mp-error");
        // eslint-disable-next-line no-unused-expressions
        f.offsetWidth;
        f.classList.add("mp-error");
        window.setTimeout(() => f.classList.remove("mp-error"), 420);
      });
    };

    const wrong = (gotId) => {
      const got = byId[gotId];
      cs.data.chain = [];
      cs.data.passphrase = "";
      persist();
      registerWrongAttempt(cs, pickCase2WittyWarning("", got?.tag || got?.label || got?.stamp || gotId, cs.wrongAttempts || 0));
      renderCase(caseDef.id);
      flashFieldErrorAfterRender();
    };

    const commitChain = (arr) => {
      cs.data.chain = Array.isArray(arr) ? arr : [];
      cs.data.passphrase = cs.data.chain.map((x) => byId[x]?.letter || "").join("");
      persist();
    };

    const completeIfDone = () => {
      const chain = chainRef();
      if (chain.length < expected.length) return false;
      const full = memories.map((m) => m.letter || "").join("").trim() || String(caseDef.solution?.passphrase || "").trim();
      cs.data.passphrase = full;
      persist();
      const tpl = String(caseDef.solution?.revealText || "").trim();
      const reveal = tpl ? tpl.replace("{passphrase}", full) : `时间线闭环已构建。你得到口令：${full}`;
      completeCase(caseDef, reveal);
      return true;
    };

    const pick = (id) => {
      const chain = chainRef();
      if (chain.includes(id)) return toast("这段记忆已连接。");
      const need = nextId();
      if (!need) return;
      if (id !== need) return wrong(id);
      chain.push(id);
      commitChain(chain);
      if (completeIfDone()) return;
      renderCase(caseDef.id);
    };

    const link = (fromId, toId) => {
      if (!fromId || !toId) return;
      const chain = chainRef();
      const last = chain[chain.length - 1] || "";
      if (chain.length && fromId !== last) return toast("从当前端点继续连线。");

      if (!chain.length) {
        const needFrom = expected[0] || "";
        const needTo = expected[1] || "";
        if (!needFrom) return;
        if (fromId !== needFrom) return wrong(fromId);
        if (toId === fromId) {
          chain.push(fromId);
          commitChain(chain);
          renderCase(caseDef.id);
          return;
        }
        if (needTo && toId !== needTo) return wrong(toId);
        chain.push(fromId, toId);
        commitChain(chain);
        if (completeIfDone()) return;
        renderCase(caseDef.id);
        return;
      }

      const need = nextId();
      if (!need) return;
      if (toId !== need) return wrong(toId);
      chain.push(toId);
      commitChain(chain);
      if (completeIfDone()) return;
      renderCase(caseDef.id);
    };

    viewEl.querySelectorAll("[data-mem]").forEach((btn) => {
      const id = btn.getAttribute("data-mem");
      if (!id) return;

      const onPreview = () => {
        const mem = byId[id];
        if (cs.phase !== "deduction") {
          if (!mem?.img) return toast("这颗胶囊是空的。");
          audio.setDuck?.(0.12);
          openOverlayHtml(`
            <div class="modal">
              <div class="modal__header">
                <div class="modal__title">${escapeHtml(mem.tag ? `记忆胶囊 ${mem.tag}` : "记忆胶囊")}</div>
                <button class="btn btn-ghost tiny" type="button" data-close>关闭</button>
              </div>
              <div class="modal__body">
                <img
                  src="${escapeAttr(mem.img)}"
                  alt="${escapeAttr(mem.tag ? `记忆照片 ${mem.tag}` : "记忆照片")}"
                  style="width:100%;max-height:min(60vh,620px);object-fit:contain;border-radius:12px;border:1px solid var(--border);background:rgba(0,0,0,0.3)"
                  loading="lazy"
                />
              </div>
            </div>
          `);
          return;
        }
      };

      if (cs.phase !== "deduction") {
        btn.addEventListener("click", onPreview);
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPreview();
          }
        });
        return;
      }

      let pid = null;
      let fromId = "";
      let mode = "";
      let startX = 0;
      let startY = 0;
      let moved = false;

      const begin = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const chain = chainRef();
        const last = chain[chain.length - 1] || "";
        const need = nextId();
        if (chain.length) {
          if (id === last) mode = "drag";
          else if (id === need) mode = "pick";
          else return toast("从端点继续连线，或直接点下一颗。");
        } else {
          mode = "drag";
        }
        pid = e.pointerId;
        fromId = id;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        if (mode === "drag") {
          field?.classList.add("mp-dragging");
          dragRect = field?.getBoundingClientRect?.() || null;
          liveFrom = fromId;
          liveX = e.clientX;
          liveY = e.clientY;
          scheduleLive();
        }
        e.preventDefault();
      };

      const move = (e) => {
        if (pid !== e.pointerId) return;
        if (mode !== "drag") return;
        if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) moved = true;
        liveX = e.clientX;
        liveY = e.clientY;
        scheduleLive();
      };

      const end = (e) => {
        if (pid !== e.pointerId) return;
        const wasMoved = moved;
        const src = fromId;
        const kind = mode;
        pid = null;
        fromId = "";
        mode = "";
        moved = false;
        field?.classList.remove("mp-dragging");
        clearLive();
        dragRect = null;
        liveFrom = "";
        if (liveRaf) {
          window.cancelAnimationFrame(liveRaf);
          liveRaf = null;
        }

        if (kind === "pick") return pick(src);
        if (!wasMoved) return pick(src);
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const drop = el && typeof el.closest === "function" ? el.closest("[data-mem]") : null;
        const to = drop?.getAttribute?.("data-mem") || "";
        if (!to || to === src) {
          if (!chainRef().length) pick(src);
          return;
        }
        link(src, to);
      };

      const cancel = () => {
        pid = null;
        fromId = "";
        mode = "";
        moved = false;
        field?.classList.remove("mp-dragging");
        clearLive();
        dragRect = null;
        liveFrom = "";
        if (liveRaf) {
          window.cancelAnimationFrame(liveRaf);
          liveRaf = null;
        }
      };

      btn.addEventListener("pointerdown", begin);
      btn.addEventListener("pointermove", move);
      btn.addEventListener("pointerup", end);
      btn.addEventListener("pointercancel", cancel);
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(id);
        }
      });
    });

    document.getElementById("btnReset2")?.addEventListener("click", () => resetChain(true));

    document.getElementById("btnToDeduce2")?.addEventListener("click", () => {
      beginPhase(cs, "deduction");
      renderCase(caseDef.id);
    });

    document.getElementById("btnBack2")?.addEventListener("click", () => {
      cs.phase = "observation";
      persist();
      renderCase(caseDef.id);
    });
  }

  // Case 3: alchemy-wish (UV scan)
  function getCase3AlchemyEvidences(caseDef) {
    const raw = Array.isArray(caseDef.data?.evidences) ? caseDef.data.evidences : [];
    return raw
      .map((e, i) => {
        const id = String(e?.id || `EV_${i + 1}`).trim() || `EV_${i + 1}`;
        const letter = String(e?.letter || "").trim();
        return {
          id,
          code: String(e?.code || "").trim(),
          letter,
          x: String(e?.x || "").trim(),
          y: String(e?.y || "").trim(),
          xSm: String(e?.xSm || e?.x_sm || "").trim(),
          ySm: String(e?.ySm || e?.y_sm || "").trim(),
          rotate: String(e?.rotate || e?.r || "").trim(),
          w: String(e?.w || e?.width || "").trim(),
          wSm: String(e?.wSm || e?.w_sm || "").trim(),
          z: Number.isFinite(Number(e?.z)) ? Number(e?.z) : null,
          coldWord: String(e?.coldWord || "").trim(),
          warmWord: String(e?.warmWord || "").trim(),
          name: String(e?.name || "").trim(),
          nameEn: String(e?.nameEn || "").trim(),
          icon: String(e?.icon || "🧩"),
          featured: !!e?.featured,
          coldTitle: String(e?.coldTitle || "【样本分析】").trim(),
          coldText: String(e?.coldText || "").trim(),
          warmTitle: String(e?.warmTitle || "【真迹还原】").trim(),
          warmText: String(e?.warmText || "").trim(),
        };
      })
      .filter((e) => e.id && e.letter);
  }

  function getCase3AlchemyDistractions(caseDef) {
    const raw = Array.isArray(caseDef.data?.distractions) ? caseDef.data.distractions : [];
    return raw
      .map((d, i) => {
        const id = String(d?.id || `DM_${i + 1}`).trim() || `DM_${i + 1}`;
        const letter = String(d?.letter || "").trim();
        return {
          id,
          code: String(d?.code || "").trim(),
          letter,
          warmWord: String(d?.warmWord || "").trim(),
          x: String(d?.x || "").trim(),
          y: String(d?.y || "").trim(),
          xSm: String(d?.xSm || d?.x_sm || "").trim(),
          ySm: String(d?.ySm || d?.y_sm || "").trim(),
          rotate: String(d?.rotate || d?.r || "").trim(),
          w: String(d?.w || d?.width || "").trim(),
          wSm: String(d?.wSm || d?.w_sm || "").trim(),
          z: Number.isFinite(Number(d?.z)) ? Number(d?.z) : null,
          name: String(d?.name || "").trim(),
          nameEn: String(d?.nameEn || "").trim(),
          icon: String(d?.icon || "🧩"),
          coldTitle: String(d?.coldTitle || "【样本分析】").trim(),
          coldText: String(d?.coldText || "").trim(),
          warmTitle: String(d?.warmTitle || "【真迹还原】").trim(),
          warmText: String(d?.warmText || "").trim(),
        };
      })
      .filter((d) => d.id);
  }

  function renderCase3Alchemy(caseDef, cs) {
    const fileNo = String(caseDef.data?.fileNo || "22").trim() || "22";
    const intro = String(caseDef.data?.intro || "").trim();
    const evidences = getCase3AlchemyEvidences(caseDef);
    if (!evidences.length) {
      return `<div class="hintbox">第 3 关未配置 <span class="mono">data.evidences</span>。</div>`;
    }

    const distractions = getCase3AlchemyDistractions(caseDef);

    const styleFor = (o) => {
      const parts = [];
      const add = (k, v) => {
        const s = String(v || "").trim();
        if (!s) return;
        parts.push(`--${k}:${escapeAttr(s)}`);
      };
      add("x", o?.x);
      add("y", o?.y);
      add("x-sm", o?.xSm);
      add("y-sm", o?.ySm);
      add("r", o?.rotate);
      add("w", o?.w);
      add("w-sm", o?.wSm);
      if (Number.isFinite(Number(o?.z))) parts.push(`--z:${escapeAttr(String(o.z))}`);
      return parts.length ? `style="${parts.join(";")}"` : "";
    };

    const kindForEvidence = (e) => {
      if (e?.featured) return "receipt";
      if (e?.letter === "W") return "calendar";
      if (e?.letter === "I") return "stain";
      if (e?.letter === "H") return "clock";
      return "paper";
    };

    const renderWarmText = (text) => escapeHtml(String(text || ""));
    const renderWarmExtractLine = (letter) => {
      const l = String(letter || "").trim();
      if (!l) return "";
      return `? 提取特征码：${escapeHtml(l)}`;
    };

    const scanned = new Set(Array.isArray(cs?.data?.scanned) ? cs.data.scanned : []);
    const views = cs?.data?.views && typeof cs.data.views === "object" ? cs.data.views : null;
    const viewFor = (id, fallback = "warm") => {
      const v = String(views?.[id] || "")
        .trim()
        .toLowerCase();
      if (v === "cold" || v === "warm") return v;
      return fallback === "cold" ? "cold" : "warm";
    };

    const evidenceCards = evidences
      .slice()
      .sort((a, b) => Number(b?.z || 0) - Number(a?.z || 0) || Number(!!b.featured) - Number(!!a.featured) || a.id.localeCompare(b.id))
      .map((e) => {
        const kind = kindForEvidence(e);
        const isScanned = scanned.has(e.id);
        const view = isScanned ? viewFor(e.id, "warm") : "cold";
        const cls = `alchemy-ev alchemy-piece--${kind}${e.featured ? " featured" : ""}${isScanned ? " scanned" : ""}`;
        const title = `${e.name || ""}`.trim();
        const subtitle = e.nameEn ? e.nameEn : "";
        const tip = isScanned ? "已解密：可在下方自由切换冷/暖" : "先读冷光鉴定，再点「紫光」深度解密";
        const aria = `编号 ${e.code || ""}，${e.name || ""}`.trim();
        const badge = `<span class="badge locked mono">线索</span>`;
        return `
          <div class="alchemy-piece" ${styleFor(e)}>
            <article class="${cls}" data-ev3="${escapeAttr(e.id)}" data-letter="${escapeAttr(e.letter)}" data-view="${escapeAttr(view)}" tabindex="0" role="button" aria-label="${escapeAttr(aria)}">
            <div class="alchemy-ev__top">
              <div class="alchemy-ev__icon" aria-hidden="true">${escapeHtml(e.icon)}</div>
              <div class="alchemy-ev__meta">
                <div class="alchemy-ev__kicker mono">编号 ${escapeHtml(e.code || "")}</div>
                <div class="alchemy-ev__title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="alchemy-ev__subtitle mono">${escapeHtml(subtitle)}</div>` : ""}
              </div>
              <div class="alchemy-ev__badge">
                ${badge}
              </div>
            </div>

            <div class="alchemy-ev__body">
              <div class="alchemy-layer cold">
                <div class="alchemy-copy__title mono">${escapeHtml(e.coldTitle)}</div>
                <div class="alchemy-copy__text mono">${escapeHtml(e.coldText)}</div>
              </div>
              <div class="alchemy-layer warm" aria-hidden="true">
                <div class="alchemy-copy__title">${escapeHtml(e.warmTitle)}</div>
                <div class="alchemy-copy__text">${renderWarmText(e.warmText)}</div>
                <div class="alchemy-copy__extract mono">${renderWarmExtractLine(e.letter)}</div>
              </div>
            </div>

            <div class="alchemy-ev__foot">
              <div class="alchemy-ev__controls" aria-label="冷暖切换">
                <div class="alchemy-switch" role="group" aria-label="冷暖切换">
                  <button class="btn btn-ghost tiny alchemy-switch__btn mono" type="button" data-view3="cold" aria-pressed="${view === "cold" ? "true" : "false"}">冷光</button>
                  <button class="btn btn-ghost tiny alchemy-switch__btn mono is-uv" type="button" data-view3="warm" aria-pressed="${view === "warm" ? "true" : "false"}">紫光</button>
                </div>
              </div>
              <span class="alchemy-ev__tip mono">${escapeHtml(tip)}</span>
            </div>
            </article>
          </div>
        `;
      })
      .join("");

    const dummyCards = distractions
      .slice()
      .sort((a, b) => Number(b?.z || 0) - Number(a?.z || 0) || a.id.localeCompare(b.id))
      .map((d, idx) => {
        const code = (d.code && String(d.code).trim()) || String.fromCharCode(69 + (idx % 8));
        const isScanned = scanned.has(d.id);
        const view = isScanned ? viewFor(d.id, "warm") : "cold";
        const title = String(d.name || "证物").trim() || "证物";
        const subtitle = d.nameEn ? String(d.nameEn) : "";
        const aria = `编号 ${code}，${title}`;
        const cls = `alchemy-ev alchemy-piece--paper${isScanned ? " scanned" : ""}`;
        const tip = isScanned ? "已解密：可在下方自由切换冷/暖" : "先读冷光鉴定，再点「紫光」深度解密";
        return `
          <div class="alchemy-piece" ${styleFor(d)}>
            <article class="${cls}" data-dm3="${escapeAttr(d.id)}" data-letter="${escapeAttr(d.letter || "")}" data-view="${escapeAttr(view)}" tabindex="0" role="button" aria-label="${escapeAttr(aria)}">
            <div class="alchemy-ev__top">
              <div class="alchemy-ev__icon" aria-hidden="true">${escapeHtml(d.icon)}</div>
              <div class="alchemy-ev__meta">
                <div class="alchemy-ev__kicker mono">编号 ${escapeHtml(code)}</div>
                <div class="alchemy-ev__title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="alchemy-ev__subtitle mono">${escapeHtml(subtitle)}</div>` : ""}
              </div>
              <div class="alchemy-ev__badge">
                <span class="badge locked mono">线索</span>
              </div>
            </div>

            <div class="alchemy-ev__body">
              <div class="alchemy-layer cold">
                 <div class="alchemy-copy__title mono">${escapeHtml(d.coldTitle || "【样本分析】")}</div>
                 <div class="alchemy-copy__text mono">${escapeHtml(d.coldText || "需要进一步检验。")}</div>
               </div>
                <div class="alchemy-layer warm" aria-hidden="true">
                  <div class="alchemy-copy__title">${escapeHtml(d.warmTitle || "【真迹还原】")}</div>
                 <div class="alchemy-copy__text">${renderWarmText(d.warmText || "只是桌面上的一件小东西。")}</div>
                 <div class="alchemy-copy__extract mono">${renderWarmExtractLine(d.letter)}</div>
                </div>
             </div>

            <div class="alchemy-ev__foot">
              <div class="alchemy-ev__controls" aria-label="冷暖切换">
                <div class="alchemy-switch" role="group" aria-label="冷暖切换">
                  <button class="btn btn-ghost tiny alchemy-switch__btn mono" type="button" data-view3="cold" aria-pressed="${view === "cold" ? "true" : "false"}">冷光</button>
                  <button class="btn btn-ghost tiny alchemy-switch__btn mono is-uv" type="button" data-view3="warm" aria-pressed="${view === "warm" ? "true" : "false"}">紫光</button>
                </div>
              </div>
              <span class="alchemy-ev__tip mono">${escapeHtml(tip)}</span>
            </div>
            </article>
          </div>
        `;
      })
      .join("");

    const piecesHtml = `${evidenceCards}${dummyCards}`;

    const termPrompt = String(caseDef.data?.terminalPrompt || "").trim();
    return `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">法医桌面 · 第 <span class="mono">${escapeHtml(fileNo)}</span> 号档案</h3>
          <p class="panel__subtitle">紫外线探照灯会“只照亮”真相：把冷的证据，炼成暖的答案。</p>
        </div>
        <div class="panel__body">
          ${intro ? `<div class="hintbox">${escapeHtml(intro)}</div>` : ""}

          <div class="alchemy">
            <div class="alchemy__hud">
              <span class="badge">机密终端</span>
              <span class="mono">${escapeHtml(termPrompt || "请输入 4 位核心特征密码：")}</span>
              <span class="badge">提示</span>
              <span style="color:var(--muted);font-size:12px">冷光看鉴定；紫光深度解密：看末尾的“? 提取特征码”</span>
              <button id="btnClear3" class="btn btn-ghost tiny" type="button" style="margin-left:auto">清空输入</button>
            </div>

            <div class="alchemy__desk" id="case3Desk" aria-label="紫外线勘察桌面">
              <div class="alchemy__beam" aria-hidden="true"></div>
              <div class="alchemy__darkness" aria-hidden="true"></div>
              <div class="alchemy__vignette" aria-hidden="true"></div>
              <div class="alchemy__noise" aria-hidden="true"></div>

              <div class="alchemy__grid">${piecesHtml}</div>

              <div class="alchemy__collect alchemy__terminal" aria-label="机密终端">
                <div class="badge">机密终端</div>
                <form id="case3TerminalForm" class="alchemy__terminalForm" autocomplete="off">
                  <input id="case3TerminalInput" class="input mono alchemy__terminalInput" type="text" inputmode="latin" maxlength="4" placeholder="输入 4 位核心密码" spellcheck="false" />
                  <button id="case3TerminalSubmit" class="btn btn-primary tiny" type="submit">解锁</button>
                </form>
                <div id="case3TerminalMsg" class="alchemy__terminalMsg mono" aria-live="polite"></div>
              </div>

              <div id="case3Cursor" class="uv-cursor hidden" aria-hidden="true">
                <div class="uv-cursor__ring"></div>
                <div class="uv-cursor__dot"></div>
                <div class="uv-cursor__label mono">UV</div>
              </div>
            </div>
          </div>

          <div style="margin-top:10px;color:var(--muted);font-size:12px">
            电脑端：悬停证物读冷光鉴定；点击证物可锁定阅读；点下方「紫光」切到暖光真迹并提取特征码。手机端：轻点证物锁定/再点取消。终端只要 4 个核心字母，输入即可结案。
          </div>
        </div>
      </div>
    `;
  }

  function bindCase3Alchemy(caseDef, cs) {
    const desk = document.getElementById("case3Desk");
    if (!desk) return;
    const beam = desk.querySelector(".alchemy__beam");
    const darkness = desk.querySelector(".alchemy__darkness");
    const cursor = document.getElementById("case3Cursor");
    const cursorLabel = cursor?.querySelector?.(".uv-cursor__label");

    const term = desk.querySelector(".alchemy__terminal");
    const form = document.getElementById("case3TerminalForm");
    const input = document.getElementById("case3TerminalInput");
    const msg = document.getElementById("case3TerminalMsg");
    const btnClear = document.getElementById("btnClear3");

    const expectedRaw = String(caseDef.solution?.password || caseDef.solution?.fragment || caseDef.solution?.letters || "WISH").trim();
    const normalizeWord = (s) => String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const expected = normalizeWord(expectedRaw);

    const scanned = new Set(Array.isArray(cs.data?.scanned) ? cs.data.scanned : []);
    if (!cs.data.views || typeof cs.data.views !== "object") cs.data.views = {};
    const views = cs.data.views;
    const clampView = (v) => (String(v || "").toLowerCase() === "cold" ? "cold" : "warm");
    const getPieceId = (node) => node?.getAttribute?.("data-ev3") || node?.getAttribute?.("data-dm3") || "";

    const canSfx = !!state.audio?.unlocked && !state.audio?.muted;
    const playScanOk = () => {
      if (!canSfx) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = window.__wishSfxCtx || (window.__wishSfxCtx = new Ctx());
        ctx.resume?.().catch(() => {
          // ignore
        });

        const now = ctx.currentTime;

        // Low heartbeat thump
        const thump = ctx.createOscillator();
        const thumpGain = ctx.createGain();
        thump.type = "sine";
        thump.frequency.setValueAtTime(58, now);
        thump.frequency.exponentialRampToValueAtTime(36, now + 0.14);
        thumpGain.gain.setValueAtTime(0.0001, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
        thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        thump.connect(thumpGain).connect(ctx.destination);
        thump.start(now);
        thump.stop(now + 0.2);

        // UV scan ping
        const ping = ctx.createOscillator();
        const pingGain = ctx.createGain();
        ping.type = "triangle";
        ping.frequency.setValueAtTime(920, now + 0.06);
        ping.frequency.exponentialRampToValueAtTime(1280, now + 0.18);
        pingGain.gain.setValueAtTime(0.0001, now + 0.06);
        pingGain.gain.exponentialRampToValueAtTime(0.12, now + 0.1);
        pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        ping.connect(pingGain).connect(ctx.destination);
        ping.start(now + 0.06);
        ping.stop(now + 0.24);
      } catch {
        // ignore
      }
    };

    const setCursorPos = (x, y) => {
      if (!cursor) return;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const showCursor = () => {
      if (!cursor) return;
      cursor.classList.remove("hidden");
      cursor.style.setProperty("--pdeg", "360deg");
    };

    const hideCursor = () => {
      if (!cursor) return;
      cursor.classList.add("hidden");
      cursor.style.setProperty("--pdeg", "360deg");
    };

    let hoverPiece = null;
    const isUvMode = (piece) => {
      if (!piece) return false;
      if (!piece.classList.contains("scanned")) return false;
      return clampView(piece.getAttribute("data-view")) === "warm";
    };

    const setLamp = (mode) => {
      const m = mode === "uv" ? "uv" : "light";
      desk.setAttribute("data-lamp", m);
      if (cursorLabel) cursorLabel.textContent = m === "uv" ? "UV" : "LIGHT";
    };

    const syncLamp = () => {
      const pinned = desk.querySelector(".alchemy-ev.pinned");
      const active = pinned || hoverPiece;
      setLamp(isUvMode(active) ? "uv" : "light");
    };

    const beamHalf = 260;

    let deskRect = null;
    let deskPad = null;
    let lastBeamX = null;
    let lastBeamY = null;

    const num = (v) => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const recalcDeskMetrics = () => {
      deskRect = desk.getBoundingClientRect();
      const st = window.getComputedStyle(desk);
      const padLeft = num(st.paddingLeft) + num(st.borderLeftWidth);
      const padRight = num(st.paddingRight) + num(st.borderRightWidth);
      const padTop = num(st.paddingTop) + num(st.borderTopWidth);
      const padBottom = num(st.paddingBottom) + num(st.borderBottomWidth);
      deskPad = { padLeft, padRight, padTop, padBottom };
    };

    const localPoint = { x: 0, y: 0 };
    const toDeskLocal = (clientX, clientY, { refresh } = {}) => {
      if (refresh || !deskRect || !deskPad) recalcDeskMetrics();
      const padLeft = Number(deskPad?.padLeft) || 0;
      const padTop = Number(deskPad?.padTop) || 0;
      const x = clientX - deskRect.left - padLeft;
      const y = clientY - deskRect.top - padTop;

      const minX = -padLeft;
      const maxX = deskRect.width - padLeft;
      const minY = -padTop;
      const maxY = deskRect.height - padTop;

      localPoint.x = clamp(x, minX, maxX);
      localPoint.y = clamp(y, minY, maxY);
      return localPoint;
    };

    const setBeamPos = (x, y, { force } = {}) => {
      if (beam) {
        const tx = x - beamHalf;
        const ty = y - beamHalf;
        if (force || tx !== lastBeamX || ty !== lastBeamY) {
          lastBeamX = tx;
          lastBeamY = ty;
          beam.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        }
      }
    };

    const applyUvPointer = (clientX, clientY, { refreshRects } = {}) => {
      if (!desk) return;
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      setCursorPos(clientX, clientY);

      const p = toDeskLocal(clientX, clientY, { refresh: refreshRects });
      setBeamPos(p.x, p.y, { force: refreshRects });
    };

    if (desk && !desk.__alchemyBound) {
      desk.__alchemyBound = true;
      const center = () => {
        recalcDeskMetrics();
        const padLeft = Number(deskPad?.padLeft) || 0;
        const padTop = Number(deskPad?.padTop) || 0;
        const x = deskRect.width / 2 - padLeft;
        const y = deskRect.height / 2 - padTop;
        setBeamPos(x, y, { force: true });
      };
      center();
      setLamp("light");

      let viewportBound = false;
      const invalidateRects = () => {
        deskRect = null;
        deskPad = null;
      };
      const bindViewport = () => {
        if (viewportBound) return;
        viewportBound = true;
        window.addEventListener("scroll", invalidateRects, { passive: true });
        window.addEventListener("resize", invalidateRects);
        window.visualViewport?.addEventListener?.("resize", invalidateRects);
        window.visualViewport?.addEventListener?.("scroll", invalidateRects);
      };
      const unbindViewport = () => {
        if (!viewportBound) return;
        viewportBound = false;
        window.removeEventListener("scroll", invalidateRects);
        window.removeEventListener("resize", invalidateRects);
        window.visualViewport?.removeEventListener?.("resize", invalidateRects);
        window.visualViewport?.removeEventListener?.("scroll", invalidateRects);
      };

      desk.addEventListener("pointerenter", (e) => {
        desk.classList.add("uv-on");
        showCursor();
        syncLamp();
        bindViewport();
        if (e && typeof e.clientX === "number" && typeof e.clientY === "number") applyUvPointer(e.clientX, e.clientY, { refreshRects: true });
      });
      desk.addEventListener("pointerleave", () => {
        desk.classList.remove("uv-on");
        hideCursor();
        unbindViewport();
        center();
        hoverPiece = null;
        setLamp("light");
        deskRect = null;
        deskPad = null;
        lastBeamX = null;
        lastBeamY = null;
      });
      desk.addEventListener("pointermove", (e) => {
        if (!e) return;
        if (typeof e.clientX === "number" && typeof e.clientY === "number") applyUvPointer(e.clientX, e.clientY);
      });
      desk.addEventListener("pointerdown", (e) => {
        if (!e) return;
        if (typeof e.clientX === "number" && typeof e.clientY === "number") applyUvPointer(e.clientX, e.clientY, { refreshRects: true });
      });
    }

    const pieces = Array.from(viewEl.querySelectorAll(".alchemy-ev[data-ev3], .alchemy-ev[data-dm3]"));
    const syncViewButtons = (piece) => {
      if (!piece) return;
      const view = clampView(piece.getAttribute("data-view"));
      piece.querySelectorAll("[data-view3]").forEach((btn) => {
        const v = clampView(btn.getAttribute("data-view3"));
        btn.setAttribute("aria-pressed", v === view ? "true" : "false");
      });
    };

    const unpinOthers = (keep) => {
      pieces.forEach((p) => {
        if (p === keep) return;
        p.classList.remove("pinned");
        p.classList.remove("lit");
        p.closest?.(".alchemy-piece")?.classList?.remove?.("is-pinned");
      });
    };

    const togglePinned = (piece) => {
      if (!piece) return;
      const pinned = !piece.classList.contains("pinned");
      if (pinned) unpinOthers(piece);
      piece.classList.toggle("pinned", pinned);
      piece.classList.toggle("lit", pinned || piece === hoverPiece);
      piece.closest?.(".alchemy-piece")?.classList?.toggle?.("is-pinned", pinned);
      try {
        if (pinned) piece.focus?.({ preventScroll: true });
      } catch {
        // ignore
      }
      syncLamp();
    };

    const bindPiece = (node, holdMs = 1100) => {
      if (!node) return;

      const isPinned = () => node.classList.contains("pinned");

      const enter = (e) => {
        node.classList.add("lit");
        hoverPiece = node;
        syncLamp();
        if (e && typeof e.clientX === "number" && typeof e.clientY === "number") applyUvPointer(e.clientX, e.clientY);
      };

      const leave = () => {
        if (hoverPiece === node) {
          hoverPiece = null;
        }
        if (isPinned()) return syncLamp();
        node.classList.remove("lit");
        syncLamp();
      };

      const begin = (e) => {
        node.classList.add("lit");
        if (!e) return;
        if (typeof e.clientX === "number" && typeof e.clientY === "number") applyUvPointer(e.clientX, e.clientY);
      };

      const end = () => {
        if (isPinned()) return;
        node.classList.remove("lit");
      };

      node.addEventListener("pointerenter", enter);
      node.addEventListener("pointerleave", leave);
      node.addEventListener("pointerdown", begin);
      node.addEventListener("pointerup", end);
      node.addEventListener("pointercancel", end);
      node.addEventListener("click", (e) => {
        if (e?.target?.closest?.("[data-view3]")) return;
        togglePinned(node);
      });
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePinned(node);
          node.classList.add("lit");
          window.setTimeout(() => {
            if (!node.classList.contains("pinned") && hoverPiece !== node) node.classList.remove("lit");
          }, Math.max(420, Number(holdMs) || 1100));
        }
      });
      node.addEventListener("blur", () => {
        if (!isPinned()) node.classList.remove("lit");
      });
    };

    pieces.forEach((node) => {
      const hold = node.hasAttribute("data-ev3") ? 1200 : 900;
      syncViewButtons(node);
      bindPiece(node, hold);
    });

    desk.addEventListener("click", (e) => {
      const btn = e?.target?.closest?.("[data-view3]");
      if (!btn || !desk.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const piece = btn.closest(".alchemy-ev");
      const id = getPieceId(piece);
      if (!piece || !id) return;

      const want = clampView(btn.getAttribute("data-view3"));
      const had = piece.classList.contains("scanned") || scanned.has(id);
      const nextScanned = want === "warm" ? true : had;

      if (nextScanned && !had) {
        scanned.add(id);
        cs.data.scanned = Array.from(scanned);
        piece.classList.add("scanned");
        playScanOk();
        toast("紫光深度解密完成：已提取 1 个特征码");
      }

      const nextView = nextScanned ? want : "cold";
      views[id] = nextView;
      piece.setAttribute("data-view", nextView);

      if (nextView === "warm") {
        unpinOthers(piece);
        piece.classList.add("pinned");
        piece.classList.add("lit");
        piece.closest?.(".alchemy-piece")?.classList?.add?.("is-pinned");
      }

      syncViewButtons(piece);
      persist();
      syncLamp();
    });

    const setMsg = (text, kind) => {
      if (!msg) return;
      msg.textContent = String(text || "");
      if (kind) msg.setAttribute("data-kind", String(kind));
      else msg.removeAttribute("data-kind");
    };

    const pulseTerminal = (cls) => {
      if (!term) return;
      term.classList.remove("is-error", "is-ok", "is-warn");
      if (cls) term.classList.add(cls);
      window.setTimeout(() => term.classList.remove(cls), 560);
    };

    const submitTerminal = () => {
      const value = normalizeWord(input?.value || "");
      if (input) input.value = value;

      if (!value) {
        pulseTerminal("is-warn");
        setMsg("请输入 4 位核心特征密码。", "warn");
        try {
          input?.focus?.();
        } catch {
          // ignore
        }
        return;
      }

      const needed = expected ? expected.length : 4;
      if (needed > 1 && value.length < needed) {
        pulseTerminal("is-warn");
        setMsg(`还差 ${needed - value.length} 位。可以先把桌面证物都点「紫光」解密一遍。`, "warn");
        try {
          input?.focus?.();
        } catch {
          // ignore
        }
        return;
      }

      if (expected && value === expected) {
        pulseTerminal("is-ok");
        setMsg("口令正确。档案解锁中…", "ok");
        playScanOk();
        cs.data.fragment = String(caseDef.solution?.fragment || caseDef.solution?.letters || expectedRaw).trim() || "WISH";
        cs.data.caseNumber = caseDef.solution?.caseNumber || null;
        persist();
        completeCase(caseDef, caseDef.solution?.revealText);
        return;
      }

      pulseTerminal("is-error");
      setMsg("口令不对。提示：终端只要 4 个核心字母——它们能拼成一个单词。", "error");
      registerWrongAttempt(cs, "口令不对。提示：点「紫光」解密所有证物，找出 4 个能拼成单词的核心字母。");
      try {
        input?.focus?.();
        input?.select?.();
      } catch {
        // ignore
      }
    };

    form?.addEventListener("submit", (e) => {
      e?.preventDefault?.();
      submitTerminal();
    });

    document.getElementById("case3TerminalSubmit")?.addEventListener("click", (e) => {
      e?.preventDefault?.();
      submitTerminal();
    });

    input?.addEventListener("input", () => {
      if (!input) return;
      input.value = normalizeWord(input.value);
      if (msg && msg.textContent) setMsg("", "");
    });

    btnClear?.addEventListener("click", () => {
      if (input) input.value = "";
      setMsg("", "");
      try {
        input?.focus?.();
      } catch {
        // ignore
      }
    });
  }

  // Case 3: timeline
  function renderCase3(caseDef, cs) {
    const suspects = caseDef.data?.suspects || [];
    const facts = caseDef.data?.facts || [];
    const events = caseDef.data?.events || [];

    if (cs.phase === "observation") {
      return `
        <div class="split">
          <div class="panel" style="box-shadow:none">
            <div class="panel__header">
              <h3 class="panel__title">证词与事实</h3>
              <p class="panel__subtitle">先读完证词，再进入推理阶段还原时间线。</p>
            </div>
            <div class="panel__body">
              <div class="grid cols-2">
                ${suspects
                  .map(
                    (s) => `
                      <div class="hintbox">
                        <div class="badge">${escapeHtml(s.name)}</div>
                        <div style="margin-top:8px;color:var(--muted)">${escapeHtml(s.desc)}</div>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
              <div class="hintbox" style="margin-top:12px">
                <div class="badge">已知事实</div>
                <ul style="margin:8px 0 0;color:var(--muted);padding-left:18px">
                  ${facts.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
                </ul>
              </div>
              <div class="row" style="margin-top:12px">
                <button id="btnToDeduce3" class="btn btn-primary" type="button">进入推理</button>
              </div>
            </div>
          </div>

          <div class="panel" style="box-shadow:none">
            <div class="panel__header">
              <h3 class="panel__title">提示</h3>
              <p class="panel__subtitle">这关会同时验证“时间线排序”和“说谎者”。</p>
            </div>
            <div class="panel__body">
              <div class="hintbox">用“上移/下移”调整事件顺序，手机也能玩。</div>
            </div>
          </div>
        </div>
      `;
    }

    if (!Array.isArray(cs.data.order) || cs.data.order.length !== events.length) {
      cs.data.order = shuffle(events.map((e) => e.id));
      persist();
    }
    const order = cs.data.order;
    const selected = cs.data.culprit || "";

    const timeline = order
      .map((id, idx) => {
        const ev = events.find((e) => e.id === id);
        return `
          <div class="timeline-item" data-idx="${idx}">
            <div class="badge">${escapeHtml(id)}</div>
            <div class="timeline-item__text">${escapeHtml(ev?.text || "")}</div>
            <div class="timeline-item__actions">
              <button class="btn btn-ghost tiny" type="button" data-move="up" ${idx === 0 ? "disabled" : ""}>上移</button>
              <button class="btn btn-ghost tiny" type="button" data-move="down" ${idx === order.length - 1 ? "disabled" : ""}>下移</button>
            </div>
          </div>
        `;
      })
      .join("");

    const radios = suspects
      .map(
        (s) => `
          <label style="display:flex;gap:10px;align-items:center;margin:8px 0;color:var(--muted)">
            <input type="radio" name="culprit" value="${escapeHtml(s.id)}" ${selected === s.id ? "checked" : ""}/>
            <span>${escapeHtml(s.id)}（${escapeHtml(String(s.name || "").replace(/^.：/, ""))}）</span>
          </label>
        `,
      )
      .join("");

    return `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">还原时间线</h3>
          <p class="panel__subtitle">把事件调整到正确顺序，然后选出“说谎者”。</p>
        </div>
        <div class="panel__body">
          <div class="timeline">${timeline}</div>
          <div class="hintbox" style="margin-top:12px">
            <div class="badge">谁在说谎？</div>
            <div style="margin-top:6px">${radios}</div>
          </div>
          <div class="row" style="margin-top:12px">
            <button id="btnBack3" class="btn btn-ghost" type="button">返回证词</button>
            <button id="btnSubmit3" class="btn btn-primary" type="button">提交推理</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindCase3(caseDef, cs) {
    const btnToDeduce = document.getElementById("btnToDeduce3");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    const btnBack = document.getElementById("btnBack3");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        cs.phase = "observation";
        persist();
        renderCase(caseDef.id);
      });
    }

    viewEl.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-move");
        const item = btn.closest(".timeline-item");
        const idx = Number(item?.getAttribute("data-idx"));
        const order = cs.data.order;
        if (!Array.isArray(order)) return;
        const swapWith = dir === "up" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= order.length) return;
        const tmp = order[idx];
        order[idx] = order[swapWith];
        order[swapWith] = tmp;
        persist();
        renderCase(caseDef.id);
      });
    });

    viewEl.querySelectorAll("input[name='culprit']").forEach((r) => {
      r.addEventListener("change", () => {
        cs.data.culprit = r.value;
        persist();
      });
    });

    const btnSubmit = document.getElementById("btnSubmit3");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        const order = cs.data.order || [];
        const target = caseDef.solution?.correctOrder || [];
        const culprit = cs.data.culprit || "";
        const okOrder = Array.isArray(order) && order.join(",") === target.join(",");
        const okCulprit = culprit === caseDef.solution?.culpritId;
        if (okOrder && okCulprit) {
          cs.data.caseNumber = caseDef.solution?.caseNumber || null;
          persist();
          completeCase(caseDef, caseDef.solution?.revealText);
          return;
        }
        registerWrongAttempt(cs, "推理未成立：检查时间线顺序与说谎者是否一致。");
      });
    }
  }

  // Case 4: count-decode
  function renderCase4(caseDef, cs) {
    const text = caseDef.data?.confessionText || "";
    const keywords = caseDef.data?.keywords || [];
    const counts = cs.data.counts || (cs.data.counts = {});

    const inputs = keywords
      .map((k) => {
        const v = counts[k.word] ?? "";
        return `
          <div class="kv" style="margin:10px 0">
            <div class="badge">统计：${escapeHtml(k.word)}</div>
            <input class="input mono" data-kw="${escapeHtml(k.word)}" placeholder="出现次数（数字）" value="${escapeHtml(String(v))}" inputmode="numeric" />
          </div>
        `;
      })
      .join("");

    if (cs.phase === "observation") {
      return `
        <div class="panel" style="box-shadow:none">
          <div class="panel__header">
            <h3 class="panel__title">自白书</h3>
            <p class="panel__subtitle">只统计上方纸张里的关键词出现次数（含重复），带入下一阶段进行取字。</p>
          </div>
          <div class="panel__body">
            <div class="paper uv-paper" id="uvPaper">${escapeHtml(text)}</div>
            <div style="margin-top:10px;color:var(--muted);font-size:12px">紫外线探照灯：移动鼠标/手指照一照</div>
            <div style="margin-top:12px">${inputs}</div>
            <div class="row" style="margin-top:12px">
              <button id="btnToDeduce4" class="btn btn-primary" type="button">进入解码</button>
            </div>
          </div>
        </div>
      `;
    }

    const derived = deriveCase4String(caseDef, counts);
    const cipher = keywords
      .map((k) => {
        const src = String(k.pickFrom || "");
        const raw = counts[k.word];
        const n = Number(raw);
        const nInt = Number.isFinite(n) ? Math.floor(n) : NaN;
        const srcShow = src || "—";
        const nShow = Number.isFinite(nInt) && nInt > 0 ? String(nInt) : "—";
        let picked = "";
        if (src && Number.isFinite(nInt) && nInt > 0) {
          const idx = (nInt - 1) % src.length;
          picked = src[idx] || "";
        }
        const pickShow = picked || "—";
        return `
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin:6px 0">
            <div><span class="badge">${escapeHtml(k.word)}</span> <span class="mono">${escapeHtml(srcShow)}</span></div>
            <div style="color:var(--muted);font-size:13px">取第 <span class="mono">${escapeHtml(nShow)}</span> 个 → <span class="mono">${escapeHtml(pickShow)}</span></div>
          </div>
        `;
      })
      .join("");
    return `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">取字盘</h3>
          <p class="panel__subtitle">规则：把“出现次数”当作索引，从下表字符串中取第 N 个字符（从 1 开始，超出长度则循环）。</p>
        </div>
        <div class="panel__body">
          <div class="hintbox">
            <div class="badge">索引字符串（用于取字）</div>
            <div style="margin-top:10px">${cipher || `<div style="color:var(--muted)">—</div>`}</div>
          </div>
          <div class="hintbox" style="margin-top:12px">
            <div class="badge">推导结果</div>
            <div style="margin-top:8px" class="mono">${escapeHtml(derived || "—")}</div>
          </div>
          <div class="kv" style="margin-top:12px">
            <div class="badge">口令</div>
            <input id="case4Input" class="input mono" placeholder="例如：FIND" autocomplete="off" />
          </div>
          <div class="row" style="margin-top:12px">
            <button id="btnBack4" class="btn btn-ghost" type="button">返回统计</button>
            <button id="btnSubmit4" class="btn btn-primary" type="button">提交</button>
          </div>
        </div>
      </div>
    `;
  }

  function deriveCase4String(caseDef, counts) {
    const keywords = caseDef.data?.keywords || [];
    let out = "";
    for (const k of keywords) {
      const raw = counts[k.word];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return "";
      const src = String(k.pickFrom || "");
      if (!src) return "";
      const idx = (Math.floor(n) - 1) % src.length;
      out += src[idx];
    }
    return out;
  }

  function bindCase4(caseDef, cs) {
    const uv = document.getElementById("uvPaper");
    if (uv && !uv.__uvBound) {
      uv.__uvBound = true;
      const setPos = (clientX, clientY) => {
        const r = uv.getBoundingClientRect();
        const x = Math.max(0, Math.min(r.width, clientX - r.left));
        const y = Math.max(0, Math.min(r.height, clientY - r.top));
        uv.style.setProperty("--uv-x", `${x}px`);
        uv.style.setProperty("--uv-y", `${y}px`);
      };
      const onPointer = (e) => {
        if (!e) return;
        if (typeof e.clientX === "number" && typeof e.clientY === "number") setPos(e.clientX, e.clientY);
      };
      const center = () => {
        const r = uv.getBoundingClientRect();
        uv.style.setProperty("--uv-x", `${Math.round(r.width / 2)}px`);
        uv.style.setProperty("--uv-y", `${Math.round(r.height / 2)}px`);
      };
      center();
      uv.addEventListener("pointermove", onPointer);
      uv.addEventListener("pointerdown", onPointer);
      uv.addEventListener("pointerleave", center);
    }

    viewEl.querySelectorAll("[data-kw]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const kw = inp.getAttribute("data-kw");
        cs.data.counts = cs.data.counts || {};
        cs.data.counts[kw] = inp.value.trim();
        persist();
      });
    });

    const btnToDeduce = document.getElementById("btnToDeduce4");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    const btnBack = document.getElementById("btnBack4");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        cs.phase = "observation";
        persist();
        renderCase(caseDef.id);
      });
    }

    const btnSubmit = document.getElementById("btnSubmit4");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        const counts = cs.data.counts || {};
        const derived = deriveCase4String(caseDef, counts);
        const expected = String(caseDef.solution?.expectedDerived || "").trim();
        if (!derived) return toast("请先回到上一步填写统计次数。");
        if (normalize(derived) !== normalize(expected)) {
          registerWrongAttempt(cs, "统计或取字规则不对：推导结果不匹配。");
          return;
        }
        const input = (document.getElementById("case4Input")?.value || "").trim();
        if (normalize(input) === normalize(expected)) {
          cs.data.derived = derived;
          persist();
          completeCase(caseDef, caseDef.solution?.revealText);
          return;
        }
        registerWrongAttempt(cs, "口令不对。检查输入是否与推导结果一致。");
      });
    }
  }

  // Case 4: cardano-grille (Cardano grille cipher)
  function ensureCase4CardanoState(caseDef, cs) {
    cs.data.cardano = cs.data.cardano && typeof cs.data.cardano === "object" ? cs.data.cardano : {};
    const st = cs.data.cardano;
    const size = 6;
    const total = size * size;
    const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (!Array.isArray(st.grid) || st.grid.length !== total) {
      st.grid = Array.from({ length: total }, () => randLetter());
    }
    st.filters = st.filters && typeof st.filters === "object" ? st.filters : {};
    const base = Array.isArray(caseDef.data?.filters) ? caseDef.data.filters : [];
    base.forEach((f, idx) => {
      const id = String(f?.id || `filter-${idx + 1}`).trim() || `filter-${idx + 1}`;
      if (!st.filters[id] || typeof st.filters[id] !== "object") {
        st.filters[id] = { inBoard: false, col: 0, row: 0, rot: 0, z: idx + 1, traySlot: idx };
      } else {
        const fs = st.filters[id];
        fs.inBoard = !!fs.inBoard;
        fs.col = Number.isFinite(Number(fs.col)) ? Math.floor(Number(fs.col)) : 0;
        fs.row = Number.isFinite(Number(fs.row)) ? Math.floor(Number(fs.row)) : 0;
        fs.rot = Number.isFinite(Number(fs.rot)) ? Math.floor(Number(fs.rot)) : 0;
        fs.z = Number.isFinite(Number(fs.z)) ? Math.floor(Number(fs.z)) : idx + 1;
        fs.traySlot = Number.isFinite(Number(fs.traySlot)) ? Math.floor(Number(fs.traySlot)) : idx;
      }
    });

    st.revealed = !!st.revealed;
    st.solved = !!st.solved;
    st.marksOn = !!st.marksOn;
    if (st.solved) st.revealed = true;
    return st;
  }

  function renderCase4CardanoGrille(caseDef, cs) {
    const data = caseDef.data || {};
    const intro = String(data.intro || "").trim();
    const reportHtml = softenNarrativeHtml(String(data.reportText || "").trim());
    const termPrompt = String(data.terminalPrompt || "请输入漏格中显现的 4 位终极密码：").trim();

    const st = ensureCase4CardanoState(caseDef, cs);
    const filters = Array.isArray(data.filters) ? data.filters : [];

    const WORD = "CAKE";
    const SIGNAL = [
      { ch: "C", r: 0, c: 2 },
      { ch: "A", r: 2, c: 1 },
      { ch: "K", r: 4, c: 4 },
      { ch: "E", r: 5, c: 5 },
    ];

    const signalByKey = Object.fromEntries(SIGNAL.map((p) => [`${p.r},${p.c}`, p.ch]));
    const cellChar = (r, c) => {
      const key = `${r},${c}`;
      const base = st.grid[r * 6 + c] || "X";
      if ((st.revealed || st.solved) && signalByKey[key]) return signalByKey[key];
      return base;
    };

    const gridHtml = Array.from({ length: 36 })
      .map((_, i) => {
        const r = Math.floor(i / 6);
        const c = i % 6;
        const key = `${r},${c}`;
        const isSignal = !!signalByKey[key];
        const ch = cellChar(r, c);
        const cls = `grille-cell mono${isSignal ? " signal" : ""}${isSignal && (st.revealed || st.solved) ? " is-on" : ""}`;
        return `<div class="${cls}" id="case4Cell_${r}_${c}" data-cell="${r},${c}" aria-label="第${r + 1}行第${c + 1}列">${escapeHtml(ch)}</div>`;
      })
      .join("");

    const filterDefs = {
      "filter-a": { label: "A", holes: [[2, 2], [3, 3]], required: { col: 2, row: 2, rot: 0 } },
      "filter-b": { label: "B", holes: [[3, 2], [1, 3]], required: { col: 1, row: 0, rot: 180 } },
      "filter-c": { label: "C", holes: [[3, 1], [0, 3]], required: { col: 1, row: 1, rot: 90 } },
    };

    const renderFilterGrid = (holes) => {
      const set = new Set((holes || []).map((p) => `${p[0]},${p[1]}`));
      const parts = [];
      for (let i = 0; i < 16; i++) {
        const rr = Math.floor(i / 4);
        const cc = i % 4;
        const hole = set.has(`${rr},${cc}`);
        parts.push(`<div class="${hole ? "grille-hole" : "grille-block"}" aria-hidden="true"></div>`);
      }
      return parts.join("");
    };

    const filtersHtml = filters
      .map((f, idx) => {
        const id = String(f?.id || `filter-${idx + 1}`).trim() || `filter-${idx + 1}`;
        const meta = filterDefs[id] || { label: String.fromCharCode(65 + idx), holes: [], required: { col: 0, row: 0, rot: 0 } };
        const fs = st.filters?.[id] || { rot: 0, z: idx + 1 };
        const rot = Number.isFinite(Number(fs.rot)) ? Number(fs.rot) : 0;
        const z = Number.isFinite(Number(fs.z)) ? Number(fs.z) : idx + 1;
        const title = String(f?.name || `滤镜 ${meta.label}`).trim() || `滤镜 ${meta.label}`;
        return `
          <div class="grille-filter${st.solved ? " locked is-cake" : ""}" data-grille-filter="${escapeAttr(id)}" style="--rot:${escapeAttr(String(rot))}deg;z-index:${escapeAttr(String(z))}" role="button" tabindex="0" aria-label="${escapeAttr(title)}">
            <div class="grille-filter__head">
              <span class="badge mono">滤镜 ${escapeHtml(meta.label)}</span>
              <button class="btn btn-ghost tiny grille-filter__rot" type="button" data-rot="${escapeAttr(id)}" aria-label="旋转滤镜 ${escapeAttr(meta.label)}">⟳</button>
            </div>
            <div class="grille-filter__grid" aria-hidden="true">${renderFilterGrid(meta.holes)}</div>
            <div class="grille-filter__foot mono"><span data-rotdeg>${escapeHtml(String(((rot % 360) + 360) % 360))}°</span><span style="opacity:.65">双击旋转</span></div>
          </div>
        `;
      })
      .join("");

    const marksLabel = st.marksOn ? "重点标注：开" : "重点标注：关";

    const reportPanel = `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <div class="row" style="gap:10px;align-items:flex-start">
            <div style="min-width:0">
              <h3 class="panel__title">法医行为侧写</h3>
              <p class="panel__subtitle">一份一本正经的报告，写满了对你日常的“吐槽”。坐标与旋转就藏在里面。</p>
            </div>
            <div style="margin-left:auto">
              <button id="btnMarks4" class="btn btn-ghost tiny" type="button" aria-pressed="${st.marksOn ? "true" : "false"}" title="切换是否高亮关键词（卡住再开也不丢人）">${escapeHtml(marksLabel)}</button>
            </div>
          </div>
        </div>
        <div class="panel__body">
          <div class="forensic-shell${st.marksOn ? " marks-on" : ""}" id="case4ForensicShell">${reportHtml || `<div class="hintbox">未配置 <span class="mono">data.reportText</span></div>`}</div>
          ${intro ? `<div class="hintbox" style="margin-top:12px">${escapeHtml(intro)}</div>` : ""}
        </div>
      </div>
    `;

    if (cs.phase === "observation") {
      return `
        <div class="grille-split">
          ${reportPanel}
          <div class="panel" style="box-shadow:none">
            <div class="panel__header">
              <h3 class="panel__title">多光谱检视台</h3>
              <p class="panel__subtitle">进入推理后，你将拖拽 3 张漏格滤镜，旋转并叠放在 6x6 乱码信上。</p>
            </div>
            <div class="panel__body">
              <div class="hintbox">提示：双击滤镜可旋转 90°（手机端可点滤镜右上角 ⟳）。</div>
              <div class="row" style="margin-top:12px">
                <button id="btnToDeduce4" class="btn btn-primary" type="button">进入推理（开始检视）</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const statusText = st.solved
      ? "暖光已亮 · 检视台已经切换到生日模式"
      : st.revealed
        ? `漏格比对成功：孔洞中显现出 ${WORD.split("").join(" · ")}`
        : "拖拽滤镜并旋转对齐：让孔洞里浮现字母";

    const revealHint = st.revealed
      ? `<span class="badge ok">字母已显现</span> <span class="mono">${WORD}</span>`
      : `<span class="badge locked">未显现</span> <span class="mono">——</span>`;

    const termBtn = st.solved
      ? `<button id="btnComplete4" class="btn btn-primary tiny" type="button">结案</button>`
      : `<button id="case4TerminalSubmit" class="btn btn-primary tiny" type="submit">验证</button>`;

    return `
      <div class="grille-split">
        ${reportPanel}
        <div class="panel" style="box-shadow:none">
          <div class="panel__header">
            <h3 class="panel__title">多光谱检视台</h3>
            <p class="panel__subtitle">把黑色漏格滤镜叠在信件上，过滤噪声。双击旋转；拖拽可吸附到格子。</p>
          </div>
          <div class="panel__body">
            <div class="grille${st.revealed ? " is-revealed" : ""}${st.solved ? " is-solved is-warm" : ""}" id="case4Grille" aria-label="漏格检视台">
              <div class="grille__hud">
                <span class="badge">状态</span>
                <span id="case4Status" class="mono">${escapeHtml(statusText)}</span>
                <span class="badge" style="margin-left:10px">旋转</span>
                <div class="grille__tools" aria-label="滤镜旋转快捷键">
                  <button class="btn btn-ghost tiny" type="button" data-rotbar="filter-a">A ⟳</button>
                  <button class="btn btn-ghost tiny" type="button" data-rotbar="filter-b">B ⟳</button>
                  <button class="btn btn-ghost tiny" type="button" data-rotbar="filter-c">C ⟳</button>
                </div>
                <span style="margin-left:auto">${revealHint}</span>
                <button id="btnReset4" class="btn btn-ghost tiny" type="button">重置滤镜</button>
              </div>

              <div class="grille-stage" id="case4Stage">
                <div class="grille-board" id="case4Board" aria-label="6x6 乱码信">
                  <div class="grille-grid" id="case4Grid" aria-hidden="true">${gridHtml}</div>
                </div>
                <div class="grille-tray" id="case4Tray" aria-label="工具托盘">
                  <div class="badge">漏格滤镜</div>
                  <div class="mono" style="font-size:12px;color:rgba(255,255,255,.62)">拖拽到信件上 · 双击旋转 90°</div>
                </div>
                <div class="grille-confetti" id="case4Confetti" aria-hidden="true"></div>
                <div class="grille-candles" id="case4Candles" aria-hidden="true"></div>
                <div class="grille-filters" id="case4Filters" aria-label="滤镜集合">${filtersHtml}</div>
              </div>

              <div class="grille-terminal" id="case4Terminal" aria-label="机密终端">
                <div class="badge">机密终端</div>
                <form id="case4TerminalForm" class="grille-terminal__form" autocomplete="off">
                  <input id="case4TerminalInput" class="input mono grille-terminal__input" type="text" inputmode="latin" maxlength="4" placeholder="${escapeAttr(termPrompt)}" spellcheck="false" />
                  ${termBtn}
                </form>
                <div id="case4TerminalMsg" class="mono grille-terminal__msg" aria-live="polite"></div>
                <div class="row" style="margin-top:10px">
                  <button id="btnBack4" class="btn btn-ghost tiny" type="button">返回侧写</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindCase4CardanoGrille(caseDef, cs) {
    const st = ensureCase4CardanoState(caseDef, cs);

    const marksBtn = document.getElementById("btnMarks4");
    if (marksBtn) {
      marksBtn.addEventListener("click", () => {
        st.marksOn = !st.marksOn;
        persist();
        const label = st.marksOn ? "重点标注：开" : "重点标注：关";
        marksBtn.textContent = label;
        marksBtn.setAttribute("aria-pressed", st.marksOn ? "true" : "false");
        document.getElementById("case4ForensicShell")?.classList?.toggle?.("marks-on", st.marksOn);
      });
    }

    const btnToDeduce = document.getElementById("btnToDeduce4");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    if (cs.phase !== "deduction") return;

    const root = document.getElementById("case4Grille");
    const stage = document.getElementById("case4Stage");
    const board = document.getElementById("case4Board");
    const tray = document.getElementById("case4Tray");
    const statusEl = document.getElementById("case4Status");
    const confettiEl = document.getElementById("case4Confetti");
    const candlesEl = document.getElementById("case4Candles");

    const filtersMeta = Array.isArray(caseDef.data?.filters) ? caseDef.data.filters : [];
    const filterNodes = Array.from(stage?.querySelectorAll?.("[data-grille-filter]") || []);
    const normalizeRot = (n) => ((Number(n) % 360) + 360) % 360;
    const required = {
      "filter-a": { col: 2, row: 2, rot: 0 },
      "filter-b": { col: 1, row: 0, rot: 180 },
      "filter-c": { col: 1, row: 1, rot: 90 },
    };

    const getMetrics = () => {
      if (!stage || !board) return null;
      const stageRect = stage.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const trayRect = tray?.getBoundingClientRect?.() || null;
      const css = getComputedStyle(stage);
      const cell = parseFloat(css.getPropertyValue("--cell")) || 44;
      const gap = parseFloat(css.getPropertyValue("--gap")) || 4;
      const step = cell + gap;
      const boardW = 6 * cell + 5 * gap;
      const boardH = 6 * cell + 5 * gap;
      const filterW = 4 * cell + 3 * gap;
      const filterH = 4 * cell + 3 * gap;
      return {
        stageRect,
        boardRect,
        trayRect,
        cell,
        gap,
        step,
        boardW,
        boardH,
        filterW,
        filterH,
        boardLeft: boardRect.left - stageRect.left,
        boardTop: boardRect.top - stageRect.top,
        trayLeft: trayRect ? trayRect.left - stageRect.left : 0,
        trayTop: trayRect ? trayRect.top - stageRect.top : 0,
        trayW: trayRect ? trayRect.width : 0,
      };
    };

    const applyPositions = () => {
      const m = getMetrics();
      if (!m) return;
      filterNodes.forEach((node, idx) => {
        const id = node.getAttribute("data-grille-filter");
        if (!id) return;
        const fs = st.filters?.[id] || (st.filters[id] = {});
        const z = Number.isFinite(Number(fs.z)) ? Number(fs.z) : idx + 1;
        node.style.zIndex = String(z);
        node.style.setProperty("--rot", `${normalizeRot(fs.rot || 0)}deg`);
        node.style.setProperty("--tx", "0px");
        node.style.setProperty("--ty", "0px");
        node.style.setProperty("--scale", "1");

        const setPos = (left, top) => {
          node.style.left = `${Math.round(left)}px`;
          node.style.top = `${Math.round(top)}px`;
        };

        if (fs.inBoard) {
          const col = Math.max(0, Math.min(2, Number(fs.col) || 0));
          const row = Math.max(0, Math.min(2, Number(fs.row) || 0));
          fs.col = col;
          fs.row = row;
          setPos(m.boardLeft + col * m.step, m.boardTop + row * m.step);
        } else {
          const slot = Number.isFinite(Number(fs.traySlot)) ? Math.max(0, Math.min(2, Number(fs.traySlot))) : idx;
          fs.traySlot = slot;
          const pad = 10;
          const head = 34;
          const gapX = 12;
          const gapY = 18;
          const baseLeft = tray ? m.trayLeft : m.boardLeft;
          const baseTop = tray ? m.trayTop : m.boardTop + m.boardH + 12;
          const baseW = tray ? m.trayW : m.stageRect.width;
          const needed3 = pad * 2 + 3 * m.filterW + 2 * gapX;
          const needed2 = pad * 2 + 2 * m.filterW + gapX;
          const cols = baseW >= needed3 ? 3 : baseW >= needed2 ? 2 : 1;
          const col = slot % cols;
          const row = Math.floor(slot / cols);
          const rowWidth = cols * m.filterW + (cols - 1) * gapX;
          const offsetX = pad + Math.max(0, (baseW - pad * 2 - rowWidth) / 2);
          const left = baseLeft + offsetX + col * (m.filterW + gapX);
          const top = baseTop + head + row * (m.filterH + gapY);
          setPos(left, top);
        }

        node.classList.toggle("is-placed", !!fs.inBoard);

        const degEl = node.querySelector("[data-rotdeg]");
        if (degEl) degEl.textContent = `${normalizeRot(fs.rot || 0)}°`;
      });

      if (st.solved) poseCake();
    };

    const syncLetters = () => {
      const SIGNAL = [
        { ch: "C", r: 0, c: 2 },
        { ch: "A", r: 2, c: 1 },
        { ch: "K", r: 4, c: 4 },
        { ch: "E", r: 5, c: 5 },
      ];
      SIGNAL.forEach((p) => {
        const el = document.getElementById(`case4Cell_${p.r}_${p.c}`);
        if (!el) return;
        const base = st.grid[p.r * 6 + p.c] || "X";
        el.textContent = st.revealed || st.solved ? p.ch : base;
        el.classList.toggle("is-on", !!(st.revealed || st.solved));
      });
      root?.classList?.toggle?.("is-revealed", !!st.revealed);
    };

    const syncStatus = () => {
      if (!statusEl) return;
      if (st.solved) statusEl.textContent = "暖光已亮 · 检视台已经切换到生日模式";
      else if (st.revealed) statusEl.textContent = "漏格比对成功：孔洞中显现出 C · A · K · E";
      else statusEl.textContent = "拖拽滤镜并旋转对齐：让孔洞里浮现字母";
    };

    const checkAlignment = () => {
      let allOk = true;
      filterNodes.forEach((node) => {
        const id = node.getAttribute("data-grille-filter");
        if (!id) return;
        const fs = st.filters?.[id] || {};
        const req = required[id];
        const ok = !!req && !!fs.inBoard && Number(fs.col) === req.col && Number(fs.row) === req.row && normalizeRot(fs.rot || 0) === req.rot;
        node.classList.toggle("is-correct", ok);
        if (req && !ok) allOk = false;
      });

      const next = st.solved ? true : allOk;
      if (!!st.revealed !== !!next) {
        st.revealed = !!next;
        persist();
      }
      syncLetters();
      syncStatus();
    };

    const bringToFront = (id) => {
      const max = Math.max(1, ...Object.values(st.filters || {}).map((x) => Number(x?.z) || 1));
      const fs = st.filters?.[id];
      if (!fs) return;
      fs.z = max + 1;
    };

    const snapToBoard = (id, left, top) => {
      const m = getMetrics();
      if (!m) return { left, top, inBoard: false };
      const fs = st.filters?.[id] || {};
      const cx = left + m.filterW / 2;
      const cy = top + m.filterH / 2;
      const within =
        cx >= m.boardLeft - 20 &&
        cy >= m.boardTop - 20 &&
        cx <= m.boardLeft + m.boardW + 20 &&
        cy <= m.boardTop + m.boardH + 20;
      if (!within) return { left, top, inBoard: false };

      const relX = left - m.boardLeft;
      const relY = top - m.boardTop;
      const col = Math.max(0, Math.min(2, Math.round(relX / m.step)));
      const row = Math.max(0, Math.min(2, Math.round(relY / m.step)));
      fs.inBoard = true;
      fs.col = col;
      fs.row = row;
      return { left: m.boardLeft + col * m.step, top: m.boardTop + row * m.step, inBoard: true };
    };

    const snapToTray = (id, left, top) => {
      const m = getMetrics();
      if (!m) return { left, top };
      const fs = st.filters?.[id] || {};
      fs.inBoard = false;
      const pad = 10;
      const head = 34;
      const gapX = 12;
      const gapY = 18;
      const baseLeft = tray ? m.trayLeft : m.boardLeft;
      const baseTop = tray ? m.trayTop : m.boardTop + m.boardH + 12;
      const baseW = tray ? m.trayW : m.stageRect.width;
      const needed3 = pad * 2 + 3 * m.filterW + 2 * gapX;
      const needed2 = pad * 2 + 2 * m.filterW + gapX;
      const cols = baseW >= needed3 ? 3 : baseW >= needed2 ? 2 : 1;
      const rowWidth = cols * m.filterW + (cols - 1) * gapX;
      const offsetX = pad + Math.max(0, (baseW - pad * 2 - rowWidth) / 2);

      const cx = left + m.filterW / 2;
      const cy = top + m.filterH / 2;
      const guessCol = Math.round((cx - (baseLeft + offsetX + m.filterW / 2)) / (m.filterW + gapX));
      const guessRow = Math.round((cy - (baseTop + head + m.filterH / 2)) / (m.filterH + gapY));
      const guessSlot = guessRow * cols + guessCol;
      const slot = Number.isFinite(Number(guessSlot)) ? Math.max(0, Math.min(2, guessSlot)) : fs.traySlot || 0;
      fs.traySlot = slot;

      const col = slot % cols;
      const row = Math.floor(slot / cols);
      return {
        left: baseLeft + offsetX + col * (m.filterW + gapX),
        top: baseTop + head + row * (m.filterH + gapY),
      };
    };

    let drag = null;
    const onMove = (e) => {
      if (!drag) return;
      if (!e) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      drag.node.style.left = `${Math.round(drag.left + dx)}px`;
      drag.node.style.top = `${Math.round(drag.top + dy)}px`;
    };

    const endDrag = () => {
      if (!drag) return;
      const { node, id } = drag;
      drag = null;
      node.classList.remove("dragging");

      const left = parseFloat(node.style.left) || 0;
      const top = parseFloat(node.style.top) || 0;
      const snapped = snapToBoard(id, left, top);
      let finalPos = snapped;
      if (!snapped.inBoard) finalPos = snapToTray(id, left, top);

      node.style.left = `${Math.round(finalPos.left)}px`;
      node.style.top = `${Math.round(finalPos.top)}px`;
      node.classList.toggle("is-placed", !!(st.filters?.[id]?.inBoard));
      persist();
      checkAlignment();
    };

    filterNodes.forEach((node) => {
      const id = node.getAttribute("data-grille-filter");
      if (!id) return;
      node.addEventListener("pointerdown", (e) => {
        if (st.solved) return;
        if (!e) return;
        if (e.target?.closest?.("[data-rot]")) return;
        if (e.button !== 0) return;
        e.preventDefault?.();
        bringToFront(id);
        applyPositions();
        node.classList.add("dragging");
        drag = {
          node,
          id,
          sx: e.clientX,
          sy: e.clientY,
          left: parseFloat(node.style.left) || 0,
          top: parseFloat(node.style.top) || 0,
        };
        try {
          node.setPointerCapture?.(e.pointerId);
        } catch {
          // ignore
        }
      });

      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", endDrag);
      node.addEventListener("pointercancel", endDrag);
      node.addEventListener("dblclick", () => {
        if (st.solved) return;
        const fs = st.filters?.[id];
        if (!fs) return;
        fs.rot = normalizeRot((fs.rot || 0) + 90);
        persist();
        applyPositions();
        checkAlignment();
      });
    });

    stage?.addEventListener?.("click", (e) => {
      const btn = e?.target?.closest?.("[data-rot]");
      if (!btn || !stage.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      if (st.solved) return;
      const id = btn.getAttribute("data-rot");
      const fs = st.filters?.[id];
      if (!fs) return;
      fs.rot = normalizeRot((fs.rot || 0) + 90);
      persist();
      applyPositions();
      checkAlignment();
    });

    root?.querySelectorAll?.("[data-rotbar]")?.forEach?.((btn) => {
      btn.addEventListener("click", (e) => {
        e?.preventDefault?.();
        if (st.solved) return;
        const id = btn.getAttribute("data-rotbar");
        const fs = st.filters?.[id];
        if (!fs) return;
        bringToFront(id);
        fs.rot = normalizeRot((fs.rot || 0) + 90);
        persist();
        applyPositions();
        checkAlignment();
      });
    });

    const resetBtn = document.getElementById("btnReset4");
    resetBtn?.addEventListener("click", () => {
      if (!window.confirm("确定要重置滤镜位置与旋转吗？")) return;
      st.solved = false;
      st.revealed = false;
      (filtersMeta || []).forEach((f, idx) => {
        const id = String(f?.id || `filter-${idx + 1}`).trim() || `filter-${idx + 1}`;
        st.filters[id] = { inBoard: false, col: 0, row: 0, rot: 0, z: idx + 1, traySlot: idx };
      });
      persist();
      renderCase(caseDef.id);
    });

    document.getElementById("btnBack4")?.addEventListener("click", () => {
      cs.phase = "observation";
      persist();
      renderCase(caseDef.id);
    });

    const normalizeWord = (s) => String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

    const termForm = document.getElementById("case4TerminalForm");
    const termInput = document.getElementById("case4TerminalInput");
    const termMsg = document.getElementById("case4TerminalMsg");

    const setMsg = (text, kind) => {
      if (!termMsg) return;
      termMsg.textContent = String(text || "");
      if (kind) termMsg.setAttribute("data-kind", String(kind));
      else termMsg.removeAttribute("data-kind");
    };

    const pulseTerminal = (cls) => {
      const term = document.getElementById("case4Terminal");
      if (!term) return;
      term.classList.remove("is-error", "is-ok", "is-warn");
      if (cls) term.classList.add(cls);
      window.setTimeout(() => term.classList.remove(cls), 560);
    };

    function poseCake() {
      if (!stage || !board) return;
      const m = getMetrics();
      if (!m) return;
      const byId = (id) => filterNodes.find((n) => n.getAttribute("data-grille-filter") === id) || null;
      const tiers = [
        { id: "filter-a", scale: 1.06, y: 0.66 },
        { id: "filter-c", scale: 0.88, y: 0.47 },
        { id: "filter-b", scale: 0.72, y: 0.30 },
      ];
      const centerX = m.boardLeft + m.boardW / 2;
      const centerY = m.boardTop + m.boardH / 2;
      const topTier = tiers[2];
      let topTop = null;

      tiers.forEach((t) => {
        const el = byId(t.id);
        if (!el) return;
        const scale = t.scale;
        const targetLeft = centerX - (m.filterW * scale) / 2;
        const targetTop = centerY + (t.y - 0.5) * (m.boardH * 0.86) - (m.filterH * scale) / 2;
        const curLeft = parseFloat(el.style.left) || 0;
        const curTop = parseFloat(el.style.top) || 0;
        el.classList.add("is-cake", "locked");
        el.style.setProperty("--scale", String(scale));
        el.style.setProperty("--rot", "0deg");
        el.style.setProperty("--tx", `${Math.round(targetLeft - curLeft)}px`);
        el.style.setProperty("--ty", `${Math.round(targetTop - curTop)}px`);
        if (t.id === topTier.id) topTop = targetTop;
      });

      if (candlesEl) {
        const letters = ["C", "A", "K", "E"];
        candlesEl.innerHTML = letters.map((ch, i) => `<div class="grille-candle mono" style="--i:${i}">${escapeHtml(ch)}</div>`).join("");
        candlesEl.classList.add("on");
        const candleW = candlesEl.offsetWidth || 168;
        const candleH = candlesEl.offsetHeight || 52;
        const left = centerX - candleW / 2;
        const top = (topTop ?? m.boardTop + 12) - candleH * 0.58;
        candlesEl.style.left = `${Math.round(left)}px`;
        candlesEl.style.top = `${Math.round(top)}px`;
      }
    }

    const submit = () => {
      if (!termInput) return;
      const value = normalizeWord(termInput.value);
      termInput.value = value;

      if (st.solved) {
        completeCase(caseDef, caseDef.solution?.revealText);
        return;
      }

      if (!st.revealed) {
        pulseTerminal("is-warn");
        setMsg("漏格未对齐：先把 3 张滤镜摆对位置，让孔洞里出现 4 个字母。", "warn");
        return;
      }

      if (!value || value.length < 4) {
        pulseTerminal("is-warn");
        setMsg("请输入 4 位密码。", "warn");
        return;
      }

      const expected = normalizeWord(caseDef.solution?.password || "CAKE");
      if (value !== expected) {
        pulseTerminal("is-error");
        setMsg("密码不对。提示：孔洞里那 4 个字母，能拼成一个单词。", "error");
        registerWrongAttempt(cs, "密码不对：检查滤镜是否摆对，并确认输入的 4 个字母。");
        try {
          termInput.focus?.();
          termInput.select?.();
        } catch {
          // ignore
        }
        return;
      }

      st.solved = true;
      st.revealed = true;
      cs.data.fragment = caseDef.solution?.fragment || expected;
      persist();

      root?.classList?.add?.("is-warm", "is-solved", "is-revealed");
      syncLetters();
      syncStatus();
      pulseTerminal("is-ok");
      setMsg("密码验证通过！光学滤网褪去伪装…", "ok");

       if (confettiEl && !confettiEl.__filled) {
         confettiEl.__filled = true;
         const confetti = Array.from({ length: 18 })
           .map((_, i) => `<span class="confetti__p" style="--i:${i}"></span>`)
           .join("");
         confettiEl.innerHTML = `<div class="confetti">${confetti}</div>`;
       }

       applyPositions();

       // Replace submit button with complete action
       const submitBtn = document.getElementById("case4TerminalSubmit");
       if (submitBtn) {
         submitBtn.id = "btnComplete4";
        submitBtn.textContent = "结案";
        submitBtn.setAttribute("type", "button");
      }
      document.getElementById("btnComplete4")?.addEventListener("click", () => completeCase(caseDef, caseDef.solution?.revealText));
    };

    termForm?.addEventListener("submit", (e) => {
      e?.preventDefault?.();
      submit();
    });

    document.getElementById("btnComplete4")?.addEventListener("click", () => completeCase(caseDef, caseDef.solution?.revealText));

    termInput?.addEventListener("input", () => {
      if (termMsg && termMsg.textContent) setMsg("", "");
    });

    // Initial sync
    applyPositions();
    syncLetters();
    checkAlignment();

    if (!stage.__cardanoBound) {
      stage.__cardanoBound = true;
      window.addEventListener("resize", () => applyPositions());
    }
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // Case 5: jump-and-jump (HAPPY Journey)
  function getCase5JumpWord(caseDef) {
    const data = caseDef?.data || {};
    const raw = String(data.word || caseDef?.solution?.password || caseDef?.solution?.fragment || "HAPPY");
    const word = raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return word || "HAPPY";
  }

  function getCase5JumpChargeMs(caseDef) {
    const raw = Number(caseDef?.data?.chargeMs);
    if (Number.isFinite(raw)) return Math.max(600, Math.min(3600, raw));
    return 1600;
  }

  function getCase5JumpTilePx(caseDef) {
    const raw = Number(caseDef?.data?.tilePx);
    if (Number.isFinite(raw)) return Math.max(72, Math.min(140, raw));
    return 110;
  }

  function getCase5JumpRouteHopsRange(caseDef) {
    const data = caseDef?.data || {};
    const minRaw = Number(data.routeHopsMin);
    const maxRaw = Number(data.routeHopsMax);
    const min = Number.isFinite(minRaw) ? Math.max(2, Math.min(8, Math.floor(minRaw))) : 3;
    const max = Number.isFinite(maxRaw) ? Math.max(min, Math.min(10, Math.floor(maxRaw))) : 5;
    return { min, max };
  }

  function inferCase5JumpIcon(roomId) {
    const raw = String(roomId || "").trim();
    if (!raw) return "";
    const s = raw.toUpperCase();
    const pairs = [
      ["麦霸", "🎤"],
      ["LIVE", "🎤"],
      ["摄影", "📷"],
      ["快门", "📷"],
      ["相册", "🖼️"],
      ["档案", "🖼️"],
      ["图书馆", "📚"],
      ["志愿", "🏃"],
      ["勋章", "🏃"],
      ["正大杯", "🏆"],
      ["奖杯", "🏆"],
      ["沙盘", "🗺️"],
      ["推演", "🗺️"],
      ["悬疑", "🧩"],
      ["推理", "🧩"],
      ["放映", "🎬"],
      ["盲盒", "🎁"],
      ["单曲", "🎧"],
      ["耳机", "🎧"],
      ["起跳", "🚪"],
      ["起点", "🚪"],
      ["花园", "✨"],
      ["连廊", "✨"],
    ];
    for (const [k, icon] of pairs) {
      if (s.includes(String(k).toUpperCase())) return icon;
    }
    return "✨";
  }

  function getCase5JumpIconForRoom(caseDef, roomId) {
    const id = String(roomId || "").trim();
    if (!id) return "";
    const steps = Array.isArray(caseDef?.data?.steps) ? caseDef.data.steps : [];
    for (const step of steps) {
      const left = step?.left && typeof step.left === "object" ? step.left : null;
      const right = step?.right && typeof step.right === "object" ? step.right : null;
      if (left && String(left.id || "").trim() === id) {
        const icon = String(left.icon || "").trim();
        if (icon) return icon;
      }
      if (right && String(right.id || "").trim() === id) {
        const icon = String(right.icon || "").trim();
        if (icon) return icon;
      }
    }
    return inferCase5JumpIcon(id);
  }

  function createCase5Rng(seed) {
    // Mulberry32 PRNG
    let t = (Number(seed) >>> 0) || 1;
    return () => {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function computeCase5JumpLayout(caseDef, st) {
    const tile = getCase5JumpTilePx(caseDef);
    const step = Math.max(0, Math.floor(Number(st?.step || 0)));
    const seed = Number.isFinite(Number(st?.seed)) ? (Number(st.seed) >>> 0) : 1;

    const steps = Array.isArray(caseDef?.data?.steps) ? caseDef.data.steps : [];
    const stepDef = step >= 0 && step < steps.length ? steps[step] || {} : {};
    const leftRaw = stepDef.left && typeof stepDef.left === "object" ? stepDef.left : {};
    const rightRaw = stepDef.right && typeof stepDef.right === "object" ? stepDef.right : {};

    // If all key fragments accidentally end up on one side, auto-balance sides so the "correct" direction
    // isn't always the same (keeps gameplay from feeling biased).
    const fragOf = (def) => String(def?.fragment || "").trim();
    let leftOnly = 0;
    let rightOnly = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] || {};
      const lf = fragOf(s.left);
      const rf = fragOf(s.right);
      if (lf && !rf) leftOnly++;
      else if (rf && !lf) rightOnly++;
    }
    const uniformRight = leftOnly === 0 && rightOnly > 0;
    const uniformLeft = rightOnly === 0 && leftOnly > 0;
    const lfNow = fragOf(leftRaw);
    const rfNow = fragOf(rightRaw);
    const shouldFlip =
      (uniformRight && rfNow && !lfNow && step % 2 === 1) || (uniformLeft && lfNow && !rfNow && step % 2 === 0);

    const leftDef = shouldFlip ? rightRaw : leftRaw;
    const rightDef = shouldFlip ? leftRaw : rightRaw;

    const curX = Number.isFinite(Number(st?.pos?.x)) ? Number(st.pos.x) : 0;
    const curY = Number.isFinite(Number(st?.pos?.y)) ? Number(st.pos.y) : 0;

    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const degToRad = (deg) => (deg * Math.PI) / 180;
    const cpX = Number.isFinite(Number(st?.checkpoint?.x)) ? Number(st.checkpoint.x) : curX;
    const cpY = Number.isFinite(Number(st?.checkpoint?.y)) ? Number(st.checkpoint.y) : curY;

    const mkMeta = (def, fallbackId) => {
      const id = String(def?.id || "").trim() || fallbackId;
      const icon = String(def?.icon || "").trim();
      const text = String(def?.text || "").trim();
      const fragment = String(def?.fragment || "").trim();
      return { id, icon, text, fragment };
    };

    const hopRange = getCase5JumpRouteHopsRange(caseDef);
    const minDist = tile * 1.45;
    const maxDist = tile * 3.35;

    const makePlan = (side, baseAngleDeg) => {
      const salt = side === "left" ? 0x51f15a57 : 0xd1b54a32;
      const rng = createCase5Rng((seed ^ Math.imul(step + 1, 0x9e3779b9) ^ salt) >>> 0);
      const hops = hopRange.min + Math.floor(rng() * (hopRange.max - hopRange.min + 1));

      let x = cpX;
      let y = cpY;
      const plan = [];
      for (let i = 0; i < hops; i++) {
        const t = (i + 1) / Math.max(1, hops);
        const dist = clamp(tile * (1.55 + rng() * 1.55 + t * 0.35), minDist, maxDist);
        const curve = Math.sin((i + 1) * 1.1 + (side === "left" ? 0.6 : 1.4)) * 8;
        const ang = degToRad(baseAngleDeg + (rng() * 2 - 1) * 16 + curve);
        x += Math.cos(ang) * dist;
        y += Math.sin(ang) * dist;
        plan.push({ key: `${side}-${i}`, x, y, dist });
      }
      return plan;
    };

    const leftMeta = mkMeta(leftDef, "左路终点");
    const rightMeta = mkMeta(rightDef, "右路终点");

    const routes =
      step < steps.length
        ? {
            left: { meta: leftMeta, plan: makePlan("left", 135) },
            right: { meta: rightMeta, plan: makePlan("right", 45) },
          }
        : {
            left: { meta: leftMeta, plan: [] },
            right: { meta: rightMeta, plan: [] },
          };

    const minJump = tile * 0.95;
    const maxJump = tile * 3.85;
    const hitHalf = tile * 0.34;

    return {
      tile,
      cur: { x: curX, y: curY },
      start: { x: cpX, y: cpY },
      routes,
      minJump,
      maxJump,
      hitHalf,
    };
  }

  function ensureCase5JumpState(caseDef, cs) {
    cs.data.jump = cs.data.jump && typeof cs.data.jump === "object" ? cs.data.jump : {};
    const st = cs.data.jump;

    const ver = Number(st.version);
    if (ver !== 3) {
      const prev = st && typeof st === "object" ? st : {};
      const posObj = prev.pos && typeof prev.pos === "object" ? prev.pos : {};
      const px = Number(posObj.x);
      const py = Number(posObj.y);
      const pos = { x: Number.isFinite(px) ? px : 0, y: Number.isFinite(py) ? py : 0 };

      const currentRoomId = String(prev.currentRoomId || "起跳台").trim() || "起跳台";
      let checkpoint = prev.checkpoint && typeof prev.checkpoint === "object" ? prev.checkpoint : null;
      if (checkpoint) {
        const cx = Number(checkpoint.x);
        const cy = Number(checkpoint.y);
        const roomId = String(checkpoint.roomId || currentRoomId).trim() || currentRoomId;
        checkpoint = { x: Number.isFinite(cx) ? cx : pos.x, y: Number.isFinite(cy) ? cy : pos.y, roomId };
      } else {
        checkpoint = { x: pos.x, y: pos.y, roomId: currentRoomId };
      }

      let camFrom = null;
      if (prev.camFrom && typeof prev.camFrom === "object") {
        const cx = Number(prev.camFrom.x);
        const cy = Number(prev.camFrom.y);
        camFrom = Number.isFinite(cx) && Number.isFinite(cy) ? { x: cx, y: cy } : null;
      }

      const routeRaw = typeof prev.route === "string" ? prev.route.trim() : "";
      const route = routeRaw === "left" || routeRaw === "right" ? routeRaw : "";
      const routeIndex = Number.isFinite(Number(prev.routeIndex)) ? Math.max(0, Math.floor(Number(prev.routeIndex))) : 0;

      cs.data.jump = {
        version: 3,
        step: Number.isFinite(Number(prev.step)) ? Math.max(0, Math.floor(Number(prev.step))) : 0,
        route,
        routeIndex,
        pos,
        currentRoomId,
        checkpoint,
        inventory: Array.isArray(prev.inventory) ? prev.inventory.map((x) => String(x || "").trim()).filter(Boolean) : [],
        lastAddedIndex: Number.isFinite(Number(prev.lastAddedIndex)) ? Math.floor(Number(prev.lastAddedIndex)) : -1,
        power: Number.isFinite(Number(prev.power)) ? Math.max(0, Math.min(1, Number(prev.power))) : 0,
        seed: Number.isFinite(Number(prev.seed)) ? (Number(prev.seed) >>> 0) : Math.floor(Math.random() * 4294967296),
        camFrom,
      };
      if (!cs.phase || !/^(observation|deduction)$/.test(String(cs.phase))) cs.phase = "observation";
      return cs.data.jump;
    }

    st.step = Number.isFinite(Number(st.step)) ? Math.max(0, Math.floor(Number(st.step))) : 0;
    st.route = typeof st.route === "string" ? st.route.trim() : "";
    if (st.route && !/^(left|right)$/.test(st.route)) st.route = "";
    st.routeIndex = Number.isFinite(Number(st.routeIndex)) ? Math.max(0, Math.floor(Number(st.routeIndex))) : 0;
    if (!st.route) st.routeIndex = 0;

    st.pos = st.pos && typeof st.pos === "object" ? st.pos : { x: 0, y: 0 };
    st.pos.x = Number.isFinite(Number(st.pos.x)) ? Number(st.pos.x) : 0;
    st.pos.y = Number.isFinite(Number(st.pos.y)) ? Number(st.pos.y) : 0;

    st.currentRoomId = String(st.currentRoomId || "起跳台").trim() || "起跳台";
    st.checkpoint = st.checkpoint && typeof st.checkpoint === "object" ? st.checkpoint : null;
    if (st.checkpoint) {
      const cx = Number(st.checkpoint.x);
      const cy = Number(st.checkpoint.y);
      const roomId = String(st.checkpoint.roomId || st.currentRoomId || "起跳台").trim() || "起跳台";
      st.checkpoint = { x: Number.isFinite(cx) ? cx : st.pos.x, y: Number.isFinite(cy) ? cy : st.pos.y, roomId };
    } else {
      st.checkpoint = { x: st.pos.x, y: st.pos.y, roomId: st.currentRoomId || "起跳台" };
    }
    st.inventory = Array.isArray(st.inventory) ? st.inventory.map((x) => String(x || "").trim()).filter(Boolean) : [];
    st.lastAddedIndex = Number.isFinite(Number(st.lastAddedIndex)) ? Math.floor(Number(st.lastAddedIndex)) : -1;
    st.power = Number.isFinite(Number(st.power)) ? Math.max(0, Math.min(1, Number(st.power))) : 0;
    st.seed = Number.isFinite(Number(st.seed)) ? (Number(st.seed) >>> 0) : Math.floor(Math.random() * 4294967296);
    if (st.camFrom && typeof st.camFrom === "object") {
      const cx = Number(st.camFrom.x);
      const cy = Number(st.camFrom.y);
      st.camFrom = Number.isFinite(cx) && Number.isFinite(cy) ? { x: cx, y: cy } : null;
    } else {
      st.camFrom = null;
    }

    return st;
  }

  function resetCase5Jump(cs, opts = {}) {
    const seedRaw = Number(opts?.seed);
    const seed = Number.isFinite(seedRaw) ? (seedRaw >>> 0) : Math.floor(Math.random() * 4294967296);
    cs.data.jump = {
      version: 3,
      step: 0,
      route: "",
      routeIndex: 0,
      pos: { x: 0, y: 0 },
      currentRoomId: "起跳台",
      checkpoint: { x: 0, y: 0, roomId: "起跳台" },
      inventory: [],
      lastAddedIndex: -1,
      power: 0,
      seed,
    };
    delete cs.data.fragment;
  }

  function renderCase5Jump(caseDef, cs) {
    const data = caseDef.data || {};
    const st = ensureCase5JumpState(caseDef, cs);
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const word = getCase5JumpWord(caseDef);
    const slots = Math.max(1, word.length || 5);

    const intro = String(data.intro || "").trim();
    const guideHtml = String(data.logText || "").trim();
    const logsRaw = Array.isArray(data.audioLogs) ? data.audioLogs : [];
    const audioLogs = logsRaw
      .map((x, i) => {
        if (typeof x === "string") return { id: `拾音记录 ${i + 1}`, text: x };
        if (x && typeof x === "object") {
          const id = String(x.id || `拾音记录 ${i + 1}`).trim() || `拾音记录 ${i + 1}`;
          const text = String(x.text || "").trim();
          return { id, text };
        }
        return null;
      })
      .filter((x) => x && x.text);

    const invHtml = Array.from({ length: slots })
      .map((_, i) => {
        const ch = st.inventory[i] || "";
        const filled = !!ch;
        const pop = filled && i === st.lastAddedIndex;
        const cls = `jump5-slot mono${filled ? " filled" : ""}${pop ? " pop" : ""}`;
        return `<div class="${cls}" aria-label="第 ${i + 1} 个密钥">${escapeHtml(ch || "·")}</div>`;
      })
      .join("");
    const invBar = `<div class="jump5-inv" aria-label="HAPPY 密钥栏">${invHtml}</div>`;

    const idx = Math.max(0, Math.min(steps.length, st.step || 0));
    const atEnd = idx >= steps.length;
    const progressText = atEnd ? "抵达星空花园" : `第 ${idx + 1} / ${Math.max(1, steps.length)} 跳`;

    const layout = computeCase5JumpLayout(caseDef, st);
    const tilePx = layout.tile;
    const curX = layout.cur.x;
    const curY = layout.cur.y;
    const showTerminal = cs.phase === "deduction";
    const route = st.route === "left" || st.route === "right" ? st.route : "";
    const routeMeta = route ? layout.routes?.[route]?.meta : null;
    const routePlan = route ? layout.routes?.[route]?.plan || [] : [];
    const routeTotal = routePlan.length;
    const routeIndexRaw = Number.isFinite(Number(st.routeIndex)) ? Math.max(0, Math.floor(Number(st.routeIndex))) : 0;
    const routeIndex = route && routeTotal ? Math.max(0, Math.min(routeTotal - 1, routeIndexRaw)) : 0;
    const routeLabel = route ? (route === "left" ? "左路" : "右路") : "";
    const routeDest = String(routeMeta?.id || "").trim() || (route === "left" ? "左路终点" : "右路终点");
    const leftDest = String(layout.routes?.left?.meta?.id || "左路").trim() || "左路";
    const rightDest = String(layout.routes?.right?.meta?.id || "右路").trim() || "右路";
    const routeDesc = route ? `${routeLabel} → ${routeDest}` : "未选择";
    const isFinalHop = !!route && routeTotal > 0 && routeIndex === routeTotal - 1;

    const nextForCam = route && !atEnd && !showTerminal ? routePlan[routeIndex] || null : null;
    const camFocusX = nextForCam ? (curX + Number(nextForCam.x || 0)) / 2 : curX;
    const camFocusY = nextForCam ? (curY + Number(nextForCam.y || 0)) / 2 : curY;
    const camToX = -camFocusX;
    const camToY = -camFocusY;
    const camStartX = Number.isFinite(Number(st.camFrom?.x)) ? Number(st.camFrom.x) : camToX;
    const camStartY = Number.isFinite(Number(st.camFrom?.y)) ? Number(st.camFrom.y) : camToY;
    const pan = !!st.camFrom;

    const optionPlatforms = [];
    if (!atEnd && !showTerminal) {
      if (!route) {
        const leftEntry = layout.routes?.left?.plan?.[0] || null;
        const rightEntry = layout.routes?.right?.plan?.[0] || null;
        if (leftEntry) {
          optionPlatforms.push({
            kind: "fork",
            side: "left",
            choiceKey: "left",
            platform: leftEntry,
            label: String(layout.routes?.left?.meta?.id || "左路").trim() || "左路",
            icon: String(layout.routes?.left?.meta?.icon || "").trim() || inferCase5JumpIcon(String(layout.routes?.left?.meta?.id || "")),
          });
        }
        if (rightEntry) {
          optionPlatforms.push({
            kind: "fork",
            side: "right",
            choiceKey: "right",
            platform: rightEntry,
            label: String(layout.routes?.right?.meta?.id || "右路").trim() || "右路",
            icon: String(layout.routes?.right?.meta?.icon || "").trim() || inferCase5JumpIcon(String(layout.routes?.right?.meta?.id || "")),
          });
        }
      } else {
        const next = routePlan[routeIndex] || null;
        if (next) {
          optionPlatforms.push({
            kind: "next",
            side: route,
            choiceKey: "",
            platform: next,
            label: isFinalHop ? routeDest : "",
            icon: isFinalHop ? String(routeMeta?.icon || "").trim() || inferCase5JumpIcon(routeDest) : "✨",
          });
        }
      }
    }
    const optionsHtml = optionPlatforms
      .map((o) => {
        const p = o.platform || {};
        const sideCls = o.side === "left" ? " is-left" : o.side === "right" ? " is-right" : "";
        const cls = `jump5-platform is-option${o.kind === "fork" ? " is-fork" : " is-next"}${sideCls}`;
        const label = String(o.label || "").trim();
        const icon = String(o.icon || "").trim();
        const dataChoice = o.choiceKey
          ? ` data-choice="${escapeAttr(String(o.choiceKey))}" role="button" tabindex="0" aria-label="${escapeAttr(label)}"`
          : "";
        const seed = `${String(p.key || "")}|${o.side}|${label}`;
        let h = 0;
        for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
        const floatDelay = ((h % 700) / 1000).toFixed(3);
        return `
          <div class="${cls}" data-platform="${escapeAttr(String(p.key || ""))}"${dataChoice}
            style="--x:${escapeAttr(String(p.x))}px;--y:${escapeAttr(String(p.y))}px;--tile:${escapeAttr(String(tilePx))}px;--float-delay:${escapeAttr(String(floatDelay))}s">
            <div class="jump5-block" aria-hidden="true">
              <div class="jump5-face jump5-face--top"></div>
              <div class="jump5-face jump5-face--right"></div>
              <div class="jump5-face jump5-face--front"></div>
            </div>
            ${
              icon
                ? `
              <div class="jump5-icon3d" aria-hidden="true">
                <div class="jump5-icon">${escapeHtml(icon)}</div>
              </div>
            `
                : ""
            }
            ${
              label
                ? `
              <div class="jump5-label3d" aria-hidden="true">
                <div class="jump5-label">${escapeHtml(label)}</div>
              </div>
            `
                : ""
            }
          </div>
        `;
      })
      .join("");

    const guide = audioLogs.length
      ? (() => {
          const cur = Math.max(0, Math.min(audioLogs.length, idx));
          const chips = audioLogs
            .map((l, i) => {
              const stateCls = i < cur ? " is-done" : i === cur ? " is-active" : " is-future";
              const k = String(i + 1);
              const text = `“${l.text}”`;
              return `
                <div class="journey-chip${stateCls}">
                  <div class="journey-chip__k" aria-hidden="true">${escapeHtml(k)}</div>
                  <div>
                    <div class="journey-chip__t">${escapeHtml(text)}</div>
                    <div class="journey-chip__meta">${escapeHtml(l.id)}</div>
                  </div>
                </div>
              `;
            })
            .join("");
          return `
            <div class="journey-guide">
              <div class="journey-guide__head">
                <div class="journey-guide__title">声音切片 · 5 段</div>
                <div class="journey-guide__meta">当前：第 ${escapeHtml(String(Math.min(audioLogs.length, cur + 1)))} 段 · 读完再选路线</div>
              </div>
              <div class="journey-guide__grid">${chips}</div>
            </div>
          `;
        })()
      : guideHtml
        ? `<div class="journey-guide-wrap">${guideHtml}</div>`
        : `<div class="hintbox">未配置 <span class="mono">data.audioLogs</span></div>`;

    const collected = st.inventory.join("").toUpperCase();
    const hasAll = normalize(collected) === normalize(word);

    const controlsHtml = showTerminal
      ? `
        <div class="jump5-terminal">
          <div class="row" style="margin-top:0;justify-content:flex-end">${invBar}</div>
          <div class="hintbox" style="margin-top:0">
            <div class="badge">当前密钥</div>
            <div style="margin-top:8px;color:var(--muted)"><span class="mono">${escapeHtml(collected || "·")}</span></div>
          </div>
          <div class="kv" style="margin-top:12px">
            <div class="badge">终端输入</div>
            <input id="case5Input" class="input mono" placeholder="请输入你收集到的 5 位密钥…" autocomplete="off" />
          </div>
          <div class="row" style="margin-top:12px">
            <button id="btnBack5" class="btn btn-ghost" type="button">返回漫游</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
              <button id="btnRestart5" class="btn btn-ghost" type="button">重新漫游</button>
              <button id="btnSubmit5" class="btn btn-primary" type="button">验证</button>
            </div>
          </div>
        </div>
      `
      : atEnd
        ? `
        <div class="row" style="margin-top:0;justify-content:flex-end">${invBar}</div>
        <div class="hintbox" style="margin-top:0">
          <div class="badge">终点</div>
          <div style="margin-top:8px">
            ${hasAll ? "密钥齐了。终端已解锁，请继续。" : `你抵达了星空花园，但密钥还没集齐（<span class=\"mono\">${escapeHtml(String(st.inventory.length))}</span> / <span class=\"mono\">${escapeHtml(String(slots))}</span>）。点击“重新漫游”再来一趟吧。`}
          </div>
        </div>
        <div class="row" style="margin-top:12px">
          <button id="btnRestart5" class="btn btn-ghost" type="button">重新漫游</button>
          ${hasAll ? `<button id="btnToTerminal5" class="btn btn-primary" type="button">打开终端</button>` : ""}
        </div>
      `
        : `
        <div class="row" style="margin-top:0;justify-content:flex-end">${invBar}</div>
        <div class="jump5-choice">路线：<span id="case5Route" class="mono">${escapeHtml(routeDesc)}</span></div>
        <div style="margin-top:6px;color:var(--muted);font-size:12px">
          ${
            route && routeTotal
              ? `已跳：<span class="mono">${escapeHtml(String(routeIndex))}</span> / <span class="mono">${escapeHtml(String(routeTotal))}</span>${isFinalHop ? " · 下一跳：终点" : ""}`
              : "选择路线：点跳台，或用下方按钮"
          }
        </div>
        ${
          !route
            ? `
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button id="case5PickLeft" class="btn btn-ghost" type="button">左路：${escapeHtml(leftDest)}</button>
          <button id="case5PickRight" class="btn btn-ghost" type="button">右路：${escapeHtml(rightDest)}</button>
        </div>
        `
            : ""
        }
        <div class="row" style="margin-top:12px;gap:8px;justify-content:space-between">
          <button id="btnRestart5" class="btn btn-ghost" type="button">重新漫游</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            ${route ? `<button id="case5BackToFork" class="btn btn-ghost" type="button">换方向</button>` : ""}
            <button id="case5Charge" class="btn btn-primary jump5-charge" type="button" ${route ? "" : "disabled"}>长按蓄力</button>
          </div>
        </div>
        <div class="jump5-tip">提示：先点一下选择左/右路线；然后像微信《跳一跳》一样：长按蓄力（越久越远），松手起跳。路线里需要连续跳过几块方块才到终点；中途跳空会回到本小关卡起点重来。</div>
      `;

    return `
      <div class="jump5" id="case5JumpRoot" style="--charge:${escapeAttr(String(st.power || 0))}">
        <div class="jump5-split">
          <div class="panel jump5-guide" style="box-shadow:none">
            <div class="panel__header">
              <h3 class="panel__title">摩天大厦夜间拾音记录</h3>
              <p class="panel__subtitle">${escapeHtml(intro || "把 5 枚通行碎片拼成完整口令。")}</p>
            </div>
            <div class="panel__body">
              ${guide}
            </div>
          </div>

          <div class="panel jump5-game" style="box-shadow:none">
              <div class="panel__header">
                <div class="row" style="align-items:flex-start">
                  <div>
                    <h3 class="panel__title">星光跳台</h3>
                    <p class="panel__subtitle">${escapeHtml(progressText)} · 当前：<span class="mono">${escapeHtml(st.currentRoomId || "起跳台")}</span></p>
                  </div>
                </div>
              </div>
            <div class="panel__body">
              <div class="jump5-arena" id="case5Arena" aria-label="等距跳台">
                <div class="jump5-stars" aria-hidden="true"></div>
                <div class="jump5-iso">
                  <div class="jump5-scene">
                    <div class="jump5-world" id="case5World" data-pan="${pan ? "1" : "0"}" data-cam-x="${escapeAttr(String(camToX))}" data-cam-y="${escapeAttr(String(camToY))}" style="--cam-x:${escapeAttr(String(camStartX))}px;--cam-y:${escapeAttr(String(camStartY))}px">
                      <div class="jump5-platform is-current" style="--x:${escapeAttr(String(curX))}px;--y:${escapeAttr(String(curY))}px;--tile:${escapeAttr(String(tilePx))}px;--float-delay:0.12s">
                        <div class="jump5-block" aria-hidden="true">
                          <div class="jump5-face jump5-face--top"></div>
                          <div class="jump5-face jump5-face--right"></div>
                          <div class="jump5-face jump5-face--front"></div>
                        </div>
                        <div class="jump5-icon3d" aria-hidden="true">
                          <div class="jump5-icon">${escapeHtml(getCase5JumpIconForRoom(caseDef, st.currentRoomId || "起跳台") || "🚪")}</div>
                        </div>
                        ${
                          !route
                            ? `
                        <div class="jump5-label3d" aria-hidden="true">
                          <div class="jump5-label">${escapeHtml(st.currentRoomId || "起跳台")}</div>
                        </div>
                        `
                            : ""
                        }
                      </div>
                      ${optionsHtml}
                      <div class="jump5-pawn" id="case5Pawn" style="--px:${escapeAttr(String(curX))}px;--py:${escapeAttr(String(curY))}px;--pz:0px">
                        <div class="jump5-pawn__body" aria-hidden="true"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="jump5-controls">${controlsHtml}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function createCase5ChargeRunner({ durationMs, onTick }) {
    let running = true;
    let raf = null;
    let timer = null;
    const start = performance.now();
    const dur = Number.isFinite(Number(durationMs)) ? Math.max(600, Math.min(3600, Number(durationMs))) : 1600;

    const sample = (now) => Math.max(0, Math.min(1, (now - start) / dur));

    const tick = (t) => {
      if (!running) return;
      onTick?.(sample(Number.isFinite(Number(t)) ? t : performance.now()));
      raf = window.requestAnimationFrame(tick);
    };

    // rAF is ideal, but some environments may throttle it heavily.
    // Keep an interval fallback so charging remains responsive.
    onTick?.(sample(start));
    raf = window.requestAnimationFrame(tick);
    timer = window.setInterval(() => {
      if (!running) return;
      onTick?.(sample(performance.now()));
    }, 50);

    return {
      stop() {
        running = false;
        if (raf) window.cancelAnimationFrame(raf);
        if (timer) window.clearInterval(timer);
      },
    };
  }

  function animateCase5PawnArc(pawnEl, from, to, { durationMs, heightPx }) {
    if (!pawnEl) return Promise.resolve();
    const dur = Number.isFinite(Number(durationMs)) ? Math.max(180, Number(durationMs)) : 720;
    const height = Number.isFinite(Number(heightPx)) ? Math.max(32, Number(heightPx)) : 120;
    if (state.settings?.reduceMotion) {
      pawnEl.style.setProperty("--px", `${Math.round(to.x)}px`);
      pawnEl.style.setProperty("--py", `${Math.round(to.y)}px`);
      pawnEl.style.setProperty("--pz", "0px");
      return Promise.resolve();
    }

    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    return new Promise((resolve) => {
      const start = performance.now();
      const loop = (now) => {
        const t = Math.max(0, Math.min(1, (now - start) / dur));
        const e = easeInOut(t);
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e;
        const z = Math.sin(Math.PI * t) * height;
        pawnEl.style.setProperty("--px", `${Math.round(x)}px`);
        pawnEl.style.setProperty("--py", `${Math.round(y)}px`);
        pawnEl.style.setProperty("--pz", `${Math.round(z)}px`);
        if (t >= 1) {
          pawnEl.style.setProperty("--pz", "0px");
          resolve();
          return;
        }
        window.requestAnimationFrame(loop);
      };
      window.requestAnimationFrame(loop);
    });
  }

  function bindCase5Jump(caseDef, cs) {
    const data = caseDef.data || {};
    const st = ensureCase5JumpState(caseDef, cs);
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const word = getCase5JumpWord(caseDef);
    const chargeMs = getCase5JumpChargeMs(caseDef);

    const root = document.getElementById("case5JumpRoot");
    const pawn = document.getElementById("case5Pawn");
    const world = document.getElementById("case5World");
    let isJumping = false;

    const doRestart = () => {
      if (!window.confirm("确定重新漫游吗？已收集的密钥会清空。")) return;
      resetCase5Jump(cs);
      cs.phase = "observation";
      persist();
      renderCase(caseDef.id);
    };

    document.getElementById("btnRestart5")?.addEventListener("click", doRestart);

    const pickRoute = (key) => {
      if (cs.phase !== "observation") return;
      if (isJumping) return;
      if (!/^(left|right)$/.test(String(key))) return;
      const lay = computeCase5JumpLayout(caseDef, st);
      const plan = lay.routes?.[key]?.plan || [];
      if (!plan.length) return;
      st.route = key;
      st.routeIndex = 0;
      st.power = 0;
      persist();
      renderCase(caseDef.id);
    };

    document.getElementById("case5PickLeft")?.addEventListener("click", () => pickRoute("left"));
    document.getElementById("case5PickRight")?.addEventListener("click", () => pickRoute("right"));

    document.getElementById("case5BackToFork")?.addEventListener("click", () => {
      if (cs.phase !== "observation") return;
      if (isJumping) return;
      const cp = st.checkpoint && typeof st.checkpoint === "object" ? st.checkpoint : null;
      const from = { x: Number(st.pos?.x) || 0, y: Number(st.pos?.y) || 0 };
      const lay = computeCase5JumpLayout(caseDef, st);
      const route = st.route === "left" || st.route === "right" ? st.route : "";
      const plan = route ? lay.routes?.[route]?.plan || [] : [];
      const idxRaw = Number.isFinite(Number(st.routeIndex)) ? Math.max(0, Math.floor(Number(st.routeIndex))) : 0;
      const idx = plan.length ? Math.max(0, Math.min(plan.length - 1, idxRaw)) : 0;
      const next = plan[idx] || null;
      const camFrom = next ? { x: -((from.x + Number(next.x || 0)) / 2), y: -((from.y + Number(next.y || 0)) / 2) } : { x: -from.x, y: -from.y };
      st.route = "";
      st.routeIndex = 0;
      st.power = 0;
      if (cp) {
        st.camFrom = camFrom;
        st.pos = { x: Number(cp.x) || 0, y: Number(cp.y) || 0 };
        st.currentRoomId = String(cp.roomId || st.currentRoomId || "起点").trim() || "起点";
      }
      toast("回到分岔口：重新选一条路线吧。");
      persist();
      renderCase(caseDef.id);
    });

    document.getElementById("btnBack5")?.addEventListener("click", () => {
      cs.phase = "observation";
      persist();
      renderCase(caseDef.id);
    });

    document.getElementById("btnToTerminal5")?.addEventListener("click", () => {
      beginPhase(cs, "deduction");
      renderCase(caseDef.id);
    });

    document.getElementById("btnSubmit5")?.addEventListener("click", () => {
      const collected = String(st.inventory.join("") || "").trim();
      if (normalize(collected) !== normalize(word)) {
        toast("密钥还没集齐：先重新漫游，或者回到指南再看看。");
        return;
      }
      const input = (document.getElementById("case5Input")?.value || "").trim();
      if (normalize(input) === normalize(word)) {
        cs.data.fragment = word;
        persist();
        completeCase(caseDef, caseDef.solution?.revealText);
        return;
      }
      toast("不对哦。提示：你要输入的就是你拼出来的那 5 个字母。");
    });

    viewEl.querySelectorAll("[data-choice]").forEach((node) => {
      const choose = () => {
        const key = String(node.getAttribute("data-choice") || "").trim();
        pickRoute(key);
      };
      node.addEventListener("click", choose);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        }
      });
    });

    const chargeBtn = document.getElementById("case5Charge");
    if (!chargeBtn || !pawn || !root) return;

    let lastPower = Number.isFinite(Number(st.power)) ? Number(st.power) : 0;
    const setPower = (v) => {
      const n = Number(v);
      lastPower = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
      st.power = lastPower;
      root?.style?.setProperty?.("--charge", String(lastPower));
    };

    setPower(lastPower);
    if (world) {
      const doPan = world.getAttribute("data-pan") === "1";
      const toX = Number(world.getAttribute("data-cam-x"));
      const toY = Number(world.getAttribute("data-cam-y"));
      if (Number.isFinite(toX) && Number.isFinite(toY)) {
        if (doPan && !state.settings?.reduceMotion) {
          window.requestAnimationFrame(() => {
            world.style.setProperty("--cam-x", `${toX}px`);
            world.style.setProperty("--cam-y", `${toY}px`);
          });
        } else {
          world.style.setProperty("--cam-x", `${toX}px`);
          world.style.setProperty("--cam-y", `${toY}px`);
        }
      }
    }
    if (st.camFrom) {
      delete st.camFrom;
      persist();
    }

    const canSfx = !!state.audio?.unlocked && !state.audio?.muted;
    const playLandOk = () => {
      if (!canSfx) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = window.__jump5SfxCtx || (window.__jump5SfxCtx = new Ctx());
        ctx.resume?.().catch(() => {
          // ignore
        });
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.exponentialRampToValueAtTime(1360, now + 0.12);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } catch {
        // ignore
      }
    };

    const playFall = () => {
      if (!canSfx) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = window.__jump5SfxCtx || (window.__jump5SfxCtx = new Ctx());
        ctx.resume?.().catch(() => {
          // ignore
        });
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(92, now);
        osc.frequency.exponentialRampToValueAtTime(44, now + 0.18);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } catch {
        // ignore
      }
    };

    const openLandingModal = ({ title, text, fragment }, onContinue) => {
      const frag = String(fragment || "").trim();
      const hasFrag = !!frag;
      const html = `
        <div class="modal">
          <div class="modal__header">
            <div class="modal__title">${escapeHtml(title || "落地")}</div>
            <button class="btn btn-ghost tiny" type="button" id="case5ModalContinue">继续漫游</button>
          </div>
          <div class="modal__body">
            ${hasFrag ? `<div class="jump5-frag mono" aria-label="获得碎片">${escapeHtml(frag)}</div>` : ""}
            <div class="hintbox">${escapeHtml(text || "你稳稳地落在了星光上。")}</div>
            <div class="row" style="margin-top:12px;justify-content:flex-end">
              <button class="btn btn-primary" type="button" id="case5ModalContinue2">继续漫游</button>
            </div>
          </div>
        </div>
      `;

      let done = false;
      const cont = () => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", onKey, true);
        closeOverlay();
        onContinue?.();
      };

      openOverlayHtml(html);
      document.getElementById("case5ModalContinue")?.addEventListener("click", cont);
      document.getElementById("case5ModalContinue2")?.addEventListener("click", cont);

      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cont();
        }
      };
      window.addEventListener("keydown", onKey, true);
      overlayEl?.addEventListener(
        "click",
        (e) => {
          if (e.target === overlayEl) cont();
        },
        { once: true },
      );
    };

    const failAndReset = (reason) =>
      new Promise((resolve) => {
        if (!pawn) return resolve();
        const cpRoom = String(st.checkpoint?.roomId || st.currentRoomId || "起点").trim() || "起点";
        const msg = reason
          ? `${reason}，掉下星空了……回到「${cpRoom}」再试一次。`
          : `失手掉下星空了……回到「${cpRoom}」再试一次。`;
        const doReset = () => {
          const from = { x: Number(st.pos?.x) || 0, y: Number(st.pos?.y) || 0 };
          const lay = computeCase5JumpLayout(caseDef, st);
          const route = st.route === "left" || st.route === "right" ? st.route : "";
          const plan = route ? lay.routes?.[route]?.plan || [] : [];
          const idxRaw = Number.isFinite(Number(st.routeIndex)) ? Math.max(0, Math.floor(Number(st.routeIndex))) : 0;
          const idx = plan.length ? Math.max(0, Math.min(plan.length - 1, idxRaw)) : 0;
          const next = plan[idx] || null;
          const camFrom = next ? { x: -((from.x + Number(next.x || 0)) / 2), y: -((from.y + Number(next.y || 0)) / 2) } : { x: -from.x, y: -from.y };

          st.routeIndex = 0;
          st.power = 0;
          const cp = st.checkpoint && typeof st.checkpoint === "object" ? st.checkpoint : null;
          if (cp) {
            st.camFrom = camFrom;
            st.pos = { x: Number(cp.x) || 0, y: Number(cp.y) || 0 };
            st.currentRoomId = String(cp.roomId || st.currentRoomId || "起点").trim() || "起点";
          } else {
            st.camFrom = null;
          }
          cs.phase = "observation";
          persist();
          renderCase(caseDef.id);
        };

        playFall();
        if (state.settings?.reduceMotion) {
          toast(msg);
          doReset();
          resolve();
          return;
        }

        pawn.classList.add("is-falling");
        toast(msg);
        window.setTimeout(() => {
          pawn.classList.remove("is-falling");
          doReset();
          resolve();
        }, 620);
      });

    const tryJump = async () => {
      if (cs.phase !== "observation") return;
      if (isJumping) return;
      if (st.step >= steps.length) return;

      const route = st.route === "left" || st.route === "right" ? st.route : "";
      if (!route) return toast("先点一下选择左/右路线，再起跳。");

      const lay = computeCase5JumpLayout(caseDef, st);
      const plan = lay.routes?.[route]?.plan || [];
      const meta = lay.routes?.[route]?.meta || {};
      if (!plan.length) return toast("路线还没准备好，刷新一下再试试？");

      const idxRaw = Number.isFinite(Number(st.routeIndex)) ? Math.max(0, Math.floor(Number(st.routeIndex))) : 0;
      const idx = Math.max(0, Math.min(plan.length - 1, idxRaw));
      const target = plan[idx] || null;
      if (!target) return toast("下一块跳台丢了…再点一次路线试试。");

      const isFinal = idx === plan.length - 1;

      const from = { x: lay.cur.x, y: lay.cur.y };
      const toDist = Math.hypot(target.x - from.x, target.y - from.y) || 1;
      const dirX = (target.x - from.x) / toDist;
      const dirY = (target.y - from.y) / toDist;

      const p = Math.max(0, Math.min(1, lastPower));
      const shaped = Math.pow(p, 1.22);
      const jumpDist = lay.minJump + shaped * (lay.maxJump - lay.minJump);
      const land = { x: from.x + dirX * jumpDist, y: from.y + dirY * jumpDist };

      const hitHalf = Number.isFinite(Number(lay.hitHalf)) ? Number(lay.hitHalf) : lay.tile * 0.34;
      const ok = Math.abs(land.x - target.x) <= hitHalf && Math.abs(land.y - target.y) <= hitHalf;
      const targetKey = String(target.key || "").trim();
      const targetEl = targetKey ? viewEl.querySelector(`[data-platform="${targetKey}"]`) : null;

      isJumping = true;
      chargeBtn.disabled = true;
      root?.classList?.remove?.("is-charging");

      const dur = Math.round(Math.max(420, Math.min(920, 460 + jumpDist * 1.15)));
      const height = Math.round(Math.max(110, Math.min(220, 120 + jumpDist * 0.34)));
      await animateCase5PawnArc(pawn, from, land, { durationMs: dur, heightPx: height });
      setPower(0);

      if (!ok) {
        const reason = jumpDist < toDist ? "蓄力太短" : "蓄力太久";
        await failAndReset(reason);
        isJumping = false;
        return;
      }

      playLandOk();
      if (targetEl) {
        targetEl.classList.add("is-landed");
        window.setTimeout(() => targetEl.classList.remove("is-landed"), 580);
      }

      if (!isFinal) {
        const landedCount = idx + 1;
        st.camFrom = { x: -((from.x + target.x) / 2), y: -((from.y + target.y) / 2) };
        st.pos = { x: target.x, y: target.y };
        st.routeIndex = landedCount;
        st.power = 0;
        toast(`稳稳落地（${landedCount}/${plan.length}）`);
        persist();
        renderCase(caseDef.id);
        isJumping = false;
        return;
      }

      const title = String(meta?.id || (route === "left" ? "左路终点" : "右路终点")).trim();
      const text = String(meta?.text || "").trim();
      const fragment = String(meta?.fragment || "").trim();
      const isKey = !!fragment;
      const modalText = isKey ? text : `${text || "你稳稳落地，但这里没有碎片。"}（本小关卡重来）`;

      openLandingModal({ title, text: modalText, fragment: isKey ? fragment : "" }, () => {
        st.power = 0;
        if (!isKey) {
          st.route = "";
          st.routeIndex = 0;
          const cp = st.checkpoint && typeof st.checkpoint === "object" ? st.checkpoint : null;
          if (cp) {
            st.camFrom = { x: -((from.x + target.x) / 2), y: -((from.y + target.y) / 2) };
            st.pos = { x: Number(cp.x) || 0, y: Number(cp.y) || 0 };
            st.currentRoomId = String(cp.roomId || st.currentRoomId || "起点").trim() || "起点";
          }
          toast("这里没有碎片：回到本小关卡起点再试一次。");
          persist();
          renderCase(caseDef.id);
          return;
        }

        st.camFrom = { x: -((from.x + target.x) / 2), y: -((from.y + target.y) / 2) };
        st.pos = { x: target.x, y: target.y };
        st.currentRoomId = title || st.currentRoomId;
        st.checkpoint = { x: target.x, y: target.y, roomId: title || st.currentRoomId || "起点" };
        st.step = Math.max(0, Math.floor(Number(st.step || 0))) + 1;
        st.route = "";
        st.routeIndex = 0;

        if (fragment) {
          const next = String(fragment).trim().toUpperCase();
          if (next && st.inventory.length < word.length) {
            st.inventory.push(next);
            st.lastAddedIndex = st.inventory.length - 1;
          }
        }

        const collected = st.inventory.join("").toUpperCase();
        const done = st.step >= steps.length;
        if (done) st.currentRoomId = "星空花园";
        if (done && normalize(collected) === normalize(word)) {
          beginPhase(cs, "deduction");
        }

        persist();
        renderCase(caseDef.id);
      });

      isJumping = false;
    };

    const arena = document.getElementById("case5Arena");
    let chargingPointerId = null;

    const finishCharge = (e) => {
      if (!activeHold) return;
      if (chargingPointerId != null && e?.pointerId != null && e.pointerId !== chargingPointerId) return;
      e?.preventDefault?.();
      window.removeEventListener("pointerup", finishCharge, true);
      window.removeEventListener("pointercancel", finishCharge, true);
      chargingPointerId = null;

      root?.classList?.remove?.("is-charging");
      activeHold.stop?.();
      activeHold = null;
      void tryJump().finally(() => {
        chargeBtn.disabled = false;
      });
    };

    const startCharge = (e) => {
      if (cs.phase !== "observation") return;
      if (isJumping) return;
      if (st.step >= steps.length) return;
      if (!st.route) {
        toast("先点一下选择左/右路线。");
        return;
      }
      e?.preventDefault?.();

      root?.classList?.add?.("is-charging");
      if (activeHold) {
        activeHold.stop?.();
        activeHold = null;
      }

      chargingPointerId = e?.pointerId ?? null;
      window.addEventListener("pointerup", finishCharge, true);
      window.addEventListener("pointercancel", finishCharge, true);

      setPower(0);
      activeHold = createCase5ChargeRunner({ durationMs: chargeMs, onTick: (v) => setPower(v) });
    };

    const startChargeFromArena = (e) => {
      if (e?.target?.closest?.("[data-choice]")) return;
      if (e?.target?.closest?.(".jump5-controls")) return;
      startCharge(e);
    };

    chargeBtn.addEventListener("pointerdown", startCharge);
    arena?.addEventListener("pointerdown", startChargeFromArena);
  }

  // Case 5: floor-map (legacy)
  function renderCase5FloorMap(caseDef, cs) {
    const expectedRooms = computeCase5ExpectedRooms(caseDef);
    const foundRooms = cs.data.foundRooms || (cs.data.foundRooms = []);
    const roomPieces = cs.data.roomPieces || (cs.data.roomPieces = {});
    const fragmentPreview = expectedRooms.map((r) => roomPieces[r] || "").join("");
    const hasAll = expectedRooms.length > 0 && expectedRooms.every((r) => foundRooms.includes(r));

    const building = (caseDef.data?.floors || [])
      .map((floor) => {
        return (caseDef.data?.rooms || [])
          .map((room) => {
            const id = `${floor}${room}`;
            const isFound = foundRooms.includes(id);
            return `
              <div class="room ${isFound ? "found" : ""}" data-room="${escapeHtml(id)}" role="button" tabindex="0">
                <div class="room__label">${escapeHtml(id)}</div>
                <div class="room__text">${isFound ? "已取证" : "待搜查"}</div>
              </div>
            `;
          })
          .join("");
      })
      .join("");

    if (cs.phase === "observation") {
      return `
        <div class="split">
          <div class="panel" style="box-shadow:none">
            <div class="panel__header">
              <h3 class="panel__title">摩天大厦 · 平面图</h3>
              <p class="panel__subtitle">把“案件编号”两两一组 → 楼层-房间（1-4 对应 A-D）。</p>
            </div>
            <div class="panel__body">
              <div class="hintbox">
                你需要找到：<span class="mono">${escapeHtml(expectedRooms.length ? expectedRooms.join("、") : "（缺少案件编号，请先完成第 3 关）")}</span>
              </div>
              <div class="building building-3d" style="margin-top:12px">${building}</div>
              <div class="row" style="margin-top:12px">
                <div class="badge">已找到：<span class="mono">${foundRooms.filter((r) => expectedRooms.includes(r)).length}</span> / ${expectedRooms.length || 2}</div>
                <button id="btnToDeduce5" class="btn btn-primary" type="button" ${hasAll ? "" : "disabled"}>进入推理</button>
              </div>
            </div>
          </div>

          <div class="panel" style="box-shadow:none">
            <div class="panel__header">
              <h3 class="panel__title">线索板</h3>
              <p class="panel__subtitle">正确房间会给出一段碎片，最终要拼成一个口令。</p>
            </div>
            <div class="panel__body">
              <div class="hintbox">当前碎片：<span class="mono">${escapeHtml(fragmentPreview || "—")}</span></div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="panel" style="box-shadow:none">
        <div class="panel__header">
          <h3 class="panel__title">输入：你拼出的碎片</h3>
          <p class="panel__subtitle">碎片来自正确房间的“监控截图”。</p>
        </div>
        <div class="panel__body">
          <div class="kv">
            <div class="badge">碎片</div>
            <input id="case5Input" class="input mono" placeholder="例如：HBD2026" autocomplete="off" />
          </div>
          <div class="row" style="margin-top:12px">
            <button id="btnBack5" class="btn btn-ghost" type="button">返回搜查</button>
            <button id="btnSubmit5" class="btn btn-primary" type="button">提交</button>
          </div>
        </div>
      </div>
    `;
  }

  function computeCase5ExpectedRooms(caseDef) {
    const from = caseDef.solution?.fromCaseId;
    const caseNumber = from ? state.perCase?.[from]?.data?.caseNumber : null;
    const raw = String(caseNumber || "");
    if (!raw || raw.length < 4) return [];
    const pairs = [raw.slice(0, 2), raw.slice(2, 4)];
    const mapRoom = (d) => {
      const n = Number(d);
      if (!Number.isFinite(n) || n < 1 || n > 4) return null;
      return ["A", "B", "C", "D"][n - 1];
    };
    const out = [];
    for (const p of pairs) {
      const floor = p[0];
      const room = mapRoom(p[1]);
      if (!room) continue;
      out.push(`${floor}${room}`);
    }
    return out;
  }

  function extractFragmentPiece(text) {
    const m = String(text || "").match(/([A-Z0-9]{2,})\s*$/);
    return m ? m[1] : "";
  }

  function bindCase5FloorMap(caseDef, cs) {
    const expectedRooms = computeCase5ExpectedRooms(caseDef);
    const foundRooms = cs.data.foundRooms || (cs.data.foundRooms = []);
    const roomPieces = cs.data.roomPieces || (cs.data.roomPieces = {});

    viewEl.querySelectorAll("[data-room]").forEach((node) => {
      const handler = () => {
        if (cs.phase !== "observation") return;
        if (!expectedRooms.length) return toast("缺少案件编号：请先完成第 3 关。");
        const id = node.getAttribute("data-room");
        if (!expectedRooms.includes(id)) return registerWrongAttempt(cs, "这里没有线索。去想想映射规则。");
        if (foundRooms.includes(id)) return toast("这个房间你已经搜查过了。");

        const clue = caseDef.data?.roomClues?.[id] || { title: `监控截图：${id}`, text: "你看到一段模糊的字。" };
        const piece = clue.piece || extractFragmentPiece(clue.text);
        foundRooms.push(id);
        if (piece) roomPieces[id] = piece;
        persist();

        openOverlayHtml(`
          <div class="modal">
            <div class="modal__header">
              <div class="modal__title">${escapeHtml(clue.title || `监控截图：${id}`)}</div>
              <button class="btn btn-ghost tiny" type="button" data-close>关闭</button>
            </div>
            <div class="modal__body">
              <div class="hintbox">${escapeHtml(clue.text || "")}</div>
            </div>
          </div>
        `);

        renderCase(caseDef.id);
      };
      node.addEventListener("click", handler);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") handler();
      });
    });

    const btnToDeduce = document.getElementById("btnToDeduce5");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    const btnBack = document.getElementById("btnBack5");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        cs.phase = "observation";
        persist();
        renderCase(caseDef.id);
      });
    }

    const btnSubmit = document.getElementById("btnSubmit5");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        const expectedRoomsNow = computeCase5ExpectedRooms(caseDef);
        const frag = expectedRoomsNow.map((r) => roomPieces[r] || "").join("");
        const expected = String(caseDef.solution?.fragment || "").trim();

        if (normalize(frag) !== normalize(expected)) {
          registerWrongAttempt(cs, "碎片不对：请确认是否找到所有正确房间，且碎片顺序无误。");
          return;
        }

        const input = (document.getElementById("case5Input")?.value || "").trim();
        if (normalize(input) === normalize(expected)) {
          cs.data.fragment = expected;
          persist();
          completeCase(caseDef, caseDef.solution?.revealText);
          return;
        }
        registerWrongAttempt(cs, "输入不对。检查是否漏字符或大小写（大小写不敏感）。");
      });
    }
  }

  // Case 6: silence-final
  function renderCase6(caseDef, cs) {
    const data = caseDef.data || {};
    const done = !!cs.data.silenceDone;
    const fxPlayed = !!cs.data.wishFxPlayed;
    const prompt = String(data?.terminalPrompt || "请输入最终口令（格式：路线口令-关键碎片）").trim();
    const aiSrc = String(data?.finalAiImage || "").trim();
    const quote = String(data?.wishQuote || "门外没有案发现场，只有全世界为你准备的祝福。").trim();
    const intro = String(data?.intro || "").trim();
    const setup = String(data?.setup || "").trim();
    const initialText = setup || "点击按钮，然后闭上眼睛，在心里默念你的愿望。";
    const doneText = String(data?.doneText || "愿望已被烛光收下。终端已解锁。").trim();
    const routePass = getRecoveredCase2Passphrase();
    const keyFragment = getRecoveredCase5Fragment();

    if (cs.phase === "observation") {
      return `
        <div class="case6-room${done ? " is-done" : ""}${fxPlayed ? " is-revealed" : ""}" id="case6Room" style="--p:${done ? "1" : "0"}">
          <div class="case6-top" aria-label="顶部操作">
            <button id="btnCase6Exit" class="case6-exit" type="button">← 返回关卡室</button>
            <button id="btnCase6Hint" class="case6-exit" type="button">提示</button>
          </div>

          <div class="case6-stage" aria-label="零点的许愿烛光">
            <div class="case6-candle" id="case6Candle" role="img" aria-label="一根温暖却脆弱的蜡烛">
              <div class="case6-candle__halo" aria-hidden="true"></div>
              <div class="case6-candle__ring" aria-hidden="true"></div>
              <div class="case6-candle__wax" aria-hidden="true"></div>
              <div class="case6-candle__wick" aria-hidden="true"></div>
              <div class="case6-candle__flame" id="case6Flame" aria-hidden="true"></div>
              <div class="case6-candle__smoke" id="case6Smoke" aria-hidden="true"></div>
            </div>

            <div class="case6-text">
              <div class="case6-text__title">零点 · 许愿烛光</div>
              ${intro ? `<div class="case6-text__intro">${escapeHtml(intro)}</div>` : ""}
               <div id="case6Status" class="case6-text__status" aria-live="polite">
                 ${
                   done
                     ? escapeHtml(doneText)
                     : escapeHtml(initialText)
                 }
               </div>
              <div id="case6Nudge" class="case6-text__nudge" aria-hidden="true">嘘……让世界静下来。</div>
            </div>

            <div class="case6-controls">
              <button id="btnSilenceStart" class="btn btn-primary" type="button" ${done ? "disabled" : ""}>准备许愿</button>
              <button id="btnSilenceCancel" class="btn btn-ghost" type="button" disabled>取消</button>
              <button id="btnToDeduce6" class="btn btn-ghost" type="button" ${done ? "" : "disabled"}>打开终端</button>
            </div>

             <div id="case6Reveal" class="case6-reveal" aria-hidden="${fxPlayed ? "false" : "true"}">
               <div class="case6-reveal__card" aria-label="终章惊喜">
                 ${done ? `<div class="case6-reveal__status">${escapeHtml(doneText)}</div>` : ""}
                 ${aiSrc ? `<div class="case6-reveal__img"><img src="${escapeAttr(aiSrc)}" alt="生日惊喜照片（AI）" loading="eager" decoding="async" /></div>` : ""}
                 <div class="case6-reveal__line">${escapeHtml(quote)}</div>
               </div>
             </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="case6-terminal">
        <div class="case6-top" aria-label="顶部操作">
          <button id="btnCase6Exit" class="case6-exit" type="button">← 返回关卡室</button>
          <button id="btnCase6Hint" class="case6-exit" type="button">提示</button>
        </div>
        <div class="case6-terminal__head">
          <div class="badge">愿望终端已解锁</div>
          <div class="case6-terminal__title">输入最终口令</div>
          <div class="case6-terminal__sub">${escapeHtml(prompt || "请输入最终口令。")}</div>
        </div>

        <div class="case6-terminal__body">
          <div class="case6-terminal__pieces">
            <div class="case6-piece">
              <span class="badge">路线口令</span>
              <span class="mono">${escapeHtml(routePass || "—")}</span>
            </div>
            <div class="case6-piece">
              <span class="badge">关键碎片</span>
              <span class="mono">${escapeHtml(keyFragment || "—")}</span>
            </div>
          </div>

          <div class="kv" style="margin-top:12px">
            <div class="badge">最终口令</div>
            <input id="case6Input" class="input mono" placeholder="例如：MOON22-HAPPY" autocomplete="off" />
          </div>

          <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
            <button id="btnBack6" class="btn btn-ghost" type="button">返回烛光</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:1">
              <button id="btnAutoKey6" class="btn btn-ghost" type="button">自动拼钥</button>
              <button id="btnSubmit6" class="btn btn-primary" type="button">解锁档案</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function computeFinalKey(caseDef) {
    const pass = getRecoveredCase2Passphrase();
    const frag = getRecoveredCase5Fragment();
    const fmt = caseDef.solution?.finalKeyFormat || "{case2Pass}-{case5Fragment}";
    return fmt.replace("{case2Pass}", pass).replace("{case5Fragment}", frag);
  }

  function createSilenceRunner({ durationMs, onTick, onReset, onDone }) {
    let running = false;
    let raf = null;
    let lastInputAt = 0;
    let lastResetReportAt = 0;

    const handler = (e) => {
      if (!running) return;
      lastInputAt = Date.now();
      if (lastInputAt - lastResetReportAt > 220) {
        lastResetReportAt = lastInputAt;
        onReset?.(e?.type || "input");
      }
      if (e && (e.type === "wheel" || e.type === "touchmove")) {
        try {
          e.preventDefault();
        } catch {
          // ignore
        }
      }
    };

    const addListeners = () => {
      document.body.classList.add("silence-lock");
      window.addEventListener("pointerdown", handler, true);
      window.addEventListener("pointermove", handler, true);
      window.addEventListener("keydown", handler, true);
      window.addEventListener("wheel", handler, { capture: true, passive: false });
      window.addEventListener("touchstart", handler, { capture: true, passive: true });
      window.addEventListener("touchmove", handler, { capture: true, passive: false });
      window.addEventListener("scroll", handler, true);
    };

    const removeListeners = () => {
      document.body.classList.remove("silence-lock");
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("pointermove", handler, true);
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("wheel", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("touchmove", handler, true);
      window.removeEventListener("scroll", handler, true);
    };

    const frame = () => {
      if (!running) return;
      const elapsed = Date.now() - lastInputAt;
      const left = Math.max(0, durationMs - elapsed);
      onTick?.(left, elapsed);
      if (elapsed >= durationMs) {
        running = false;
        raf = null;
        removeListeners();
        onDone?.();
        return;
      }
      raf = window.requestAnimationFrame(frame);
    };

    return {
      start() {
        if (running) return;
        running = true;
        lastInputAt = Date.now();
        addListeners();
        raf = window.requestAnimationFrame(frame);
      },
      stop() {
        if (!running) return;
        running = false;
        if (raf) window.cancelAnimationFrame(raf);
        raf = null;
        removeListeners();
      },
    };
  }

  function launchCelebrationFx(opts = {}) {
    if (state.settings?.reduceMotion) return;
    try {
      const originXRaw = Number(opts.originX);
      const originYRaw = Number(opts.originY);
      const originX = Number.isFinite(originXRaw) ? Math.max(0, Math.min(1, originXRaw)) : 0.5;
      const originY = Number.isFinite(originYRaw) ? Math.max(0, Math.min(1, originYRaw)) : 0.35;

      const durationMsRaw = Number(opts.durationMs);
      const durationMs = Number.isFinite(durationMsRaw) ? Math.max(900, Math.min(6500, Math.floor(durationMsRaw))) : 3400;

      const confettiCountRaw = Number(opts.confettiCount);
      const sparkCountRaw = Number(opts.sparkCount);
      const confettiCount = Number.isFinite(confettiCountRaw) ? Math.max(30, Math.min(220, Math.floor(confettiCountRaw))) : 120;
      const sparkCount = Number.isFinite(sparkCountRaw) ? Math.max(0, Math.min(120, Math.floor(sparkCountRaw))) : 44;

      const canvas = document.createElement("canvas");
      canvas.className = "case6-confetti";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        canvas.remove();
        return;
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let w = 0;
      let h = 0;

      const resize = () => {
        w = Math.max(1, window.innerWidth);
        h = Math.max(1, window.innerHeight);
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();
      window.addEventListener("resize", resize, { passive: true });

      const palette = Array.isArray(opts.colors) && opts.colors.length
        ? opts.colors
        : ["#ff79c6", "#ffb86c", "#8be9fd", "#50fa7b", "#f1fa8c", "#bd93f9", "#ffd6c2"];

      const rand = (a, b) => a + Math.random() * (b - a);
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

      const start = performance.now();
      let lastT = start;
      const particles = [];
      const burstX = originX * w;
      const burstY = originY * h;

      for (let i = 0; i < sparkCount; i++) {
        const speed = rand(180, 520);
        const ang = rand(0, Math.PI * 2);
        particles.push({
          kind: "spark",
          x: burstX,
          y: burstY,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - rand(40, 160),
          g: rand(360, 560),
          r: rand(1.4, 3.6),
          born: start,
          life: rand(760, 1180),
          color: "rgba(255, 214, 142, 1)",
        });
      }

      for (let i = 0; i < confettiCount; i++) {
        particles.push({
          kind: "confetti",
          x: rand(0, w),
          y: rand(-h * 0.42, -12),
          vx: rand(-36, 36),
          vy: rand(140, 300),
          g: rand(260, 420),
          rot: rand(0, Math.PI * 2),
          vr: rand(-6, 6),
          cw: rand(6, 10),
          ch: rand(10, 18),
          born: start,
          life: durationMs,
          alpha: rand(0.8, 1),
          color: pick(palette),
        });
      }

      let raf = 0;
      const loop = (t) => {
        const dt = Math.min(0.033, Math.max(0.001, (t - lastT) / 1000));
        lastT = t;
        const elapsed = t - start;

        ctx.clearRect(0, 0, w, h);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          const age = t - p.born;
          if (age >= p.life) {
            particles.splice(i, 1);
            continue;
          }

          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += p.g * dt;

          if (p.kind === "confetti") {
            p.rot += p.vr * dt;
            const fade = elapsed > durationMs - 720 ? Math.max(0, (durationMs - elapsed) / 720) : 1;
            ctx.save();
            ctx.globalAlpha = p.alpha * fade;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.cw / 2, -p.ch / 2, p.cw, p.ch);
            ctx.restore();
            continue;
          }

          const k = Math.max(0, 1 - age / p.life);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = k * 0.95;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (elapsed < durationMs && particles.length) {
          raf = window.requestAnimationFrame(loop);
          return;
        }

        window.cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        canvas.remove();
      };

      raf = window.requestAnimationFrame(loop);
    } catch {
      // ignore
    }
  }

  function bindCase6(caseDef, cs) {
    document.getElementById("btnCase6Exit")?.addEventListener("click", () => navigate({ name: "cases", caseId: null }));

    const btnHint = document.getElementById("btnCase6Hint");
    if (btnHint) {
      btnHint.addEventListener("click", () => {
        openOverlayHtml(`
          <div class="modal">
            <div class="modal__header">
              <div class="modal__title">提示</div>
              <button class="btn btn-ghost tiny" type="button" data-close>关闭</button>
            </div>
            <div class="modal__body">
              <div class="hintbox">选择一个提示等级（Tier 1 免费但有冷却）。</div>
              <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;justify-content:flex-start">
                <button class="btn btn-ghost" type="button" data-case6-hint-tier="tier1">提示 1（轻推）</button>
                <button class="btn btn-ghost" type="button" data-case6-hint-tier="tier2">提示 2（强推）</button>
                <button class="btn btn-danger" type="button" data-case6-hint-tier="tier3">提示 3（揭底）</button>
              </div>
            </div>
          </div>
        `);

        overlayEl?.querySelectorAll("[data-case6-hint-tier]")?.forEach((b) => {
          b.addEventListener("click", () => {
            const tier = b.getAttribute("data-case6-hint-tier");
            if (!tier) return;
            useHint(caseDef, cs, tier);
          });
        });
      });
    }

    const btnToDeduce = document.getElementById("btnToDeduce6");
    if (btnToDeduce) {
      btnToDeduce.addEventListener("click", () => {
        beginPhase(cs, "deduction");
        renderCase(caseDef.id);
      });
    }

    const startBtn = document.getElementById("btnSilenceStart");
    const cancelBtn = document.getElementById("btnSilenceCancel");
    if (startBtn) {
      const holdSec = caseDef.data?.holdSec ?? 10;
      const initialText = String(caseDef.data?.setup || "").trim() || "点击按钮，然后闭上眼睛，在心里默念你的愿望。";
      const doneText = String(caseDef.data?.doneText || "愿望已被烛光收下。终端已解锁。").trim();
      const roomEl = document.getElementById("case6Room");
      const statusEl = document.getElementById("case6Status");
      const nudgeEl = document.getElementById("case6Nudge");
      const flameEl = document.getElementById("case6Flame");
      const revealEl = document.getElementById("case6Reveal");
      const aiSrc = String(caseDef.data?.finalAiImage || "").trim();
      if (aiSrc) {
        try {
          const img = new Image();
          img.decoding = "async";
          img.src = aiSrc;
        } catch {
          // ignore
        }
      }

      let resetCount = 0;
      let nudgeShown = false;
      let blowTimer = null;
      let shakeTimer = null;
      let revealTimer = null;
      const canSfx = !!state.audio?.unlocked && !state.audio?.muted;

      const setProgress = (p) => {
        if (!roomEl) return;
        const n = Number(p);
        const clamped = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
        try {
          roomEl.style.setProperty("--p", clamped.toFixed(4));
        } catch {
          // ignore
        }
      };

      const setStatus = (t) => {
        if (statusEl) statusEl.textContent = t || "";
      };

      const hideNudge = () => {
        nudgeShown = false;
        nudgeEl?.classList.remove("show");
      };
      const showNudge = () => {
        if (nudgeShown) return;
        nudgeShown = true;
        nudgeEl?.classList.add("show");
      };

      const pickResetMessage = (n) => {
        const k = Number(n) || 0;
        if (k <= 1) return "";
        if (k <= 2) return "烛光好像被什么轻轻碰到了。";
        if (k <= 4) return "愿望需要一点点安静。";
        return "嘘……让世界静下来。";
      };

      const playWhoosh = () => {
        if (!canSfx) return;
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          const ctx = window.__case6WishCtx || (window.__case6WishCtx = new Ctx());
          ctx.resume?.().catch(() => {
            // ignore
          });

          const now = ctx.currentTime;
          const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.26), ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
          const noise = ctx.createBufferSource();
          noise.buffer = buffer;

          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(1200, now);
          filter.frequency.exponentialRampToValueAtTime(280, now + 0.24);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

          noise.connect(filter).connect(gain).connect(ctx.destination);
          noise.start(now);
          noise.stop(now + 0.28);
        } catch {
          // ignore
        }
      };

      const playDing = () => {
        if (!canSfx) return;
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          const ctx = window.__case6WishCtx || (window.__case6WishCtx = new Ctx());
          ctx.resume?.().catch(() => {
            // ignore
          });

          const now = ctx.currentTime;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          const hp = ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.setValueAtTime(520, now);

          osc1.type = "sine";
          osc2.type = "triangle";
          osc1.frequency.setValueAtTime(1560, now);
          osc2.frequency.setValueAtTime(2080, now);
          osc1.frequency.exponentialRampToValueAtTime(780, now + 0.28);
          osc2.frequency.exponentialRampToValueAtTime(1040, now + 0.28);

          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(hp).connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.38);
          osc2.stop(now + 0.38);
        } catch {
          // ignore
        }
      };

      const shake = () => {
        if (!roomEl) return;
        roomEl.classList.remove("is-shake");
        // force reflow so animation can restart
        void roomEl.offsetWidth;
        roomEl.classList.add("is-shake");
        if (shakeTimer) window.clearTimeout(shakeTimer);
        shakeTimer = window.setTimeout(() => {
          roomEl.classList.remove("is-shake");
          shakeTimer = null;
        }, 360);
      };

      const blowOut = () => {
        if (!roomEl) return;
        roomEl.classList.remove("is-blown");
        void roomEl.offsetWidth;
        roomEl.classList.add("is-blown");
        if (blowTimer) window.clearTimeout(blowTimer);
        blowTimer = window.setTimeout(() => {
          roomEl.classList.remove("is-blown");
          blowTimer = null;
        }, 940);
      };

      const cleanupTimers = () => {
        if (blowTimer) window.clearTimeout(blowTimer);
        if (shakeTimer) window.clearTimeout(shakeTimer);
        if (revealTimer) window.clearTimeout(revealTimer);
        blowTimer = null;
        shakeTimer = null;
        revealTimer = null;
      };

      const cancel = () => {
        if (activeHold) {
          activeHold.stop();
          activeHold = null;
        }
        cleanupTimers();
        roomEl?.classList?.remove?.("is-running", "is-blown", "is-shake");
        startBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = true;
        hideNudge();
        setProgress(0);
        setStatus(initialText);
        if (revealEl) revealEl.setAttribute("aria-hidden", "true");
      };

      const start = () => {
        if (cs.data.silenceDone) return;
        if (activeHold) activeHold.stop();
        cleanupTimers();
        resetCount = 0;
        hideNudge();
        setProgress(0);
        setStatus("烛光在倾听……");
        startBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = false;
        roomEl?.classList?.add?.("is-running");
        roomEl?.classList?.remove?.("is-blown", "is-shake", "is-success", "is-revealed");
        if (revealEl) revealEl.setAttribute("aria-hidden", "true");

        activeHold = createSilenceRunner({
          durationMs: holdSec * 1000,
          onTick: (leftMs, elapsedMs) => {
            setProgress(elapsedMs / Math.max(1, holdSec * 1000));
          },
          onReset: () => {
            resetCount += 1;
            if (resetCount >= 4) showNudge();
            shake();
            blowOut();
            playWhoosh();
            const msg = pickResetMessage(resetCount);
            if (msg) setStatus(msg);
          },
          onDone: () => {
            cleanupTimers();
            setProgress(1);
            roomEl?.classList?.remove?.("is-running", "is-blown", "is-shake");
            roomEl?.classList?.add?.("is-done", "is-success");
            if (cancelBtn) cancelBtn.disabled = true;
            btnToDeduce && (btnToDeduce.disabled = false);

            cs.data.silenceDone = true;
            state.fx = state.fx || {};
            state.fx.dawnShown = true;
            persist();

            audio.setSuspended?.(false);
            audio.setDuck?.(1);
            audio.setTargetTrack(caseDef.assets?.bgm);
            playDawnTransition();
            playDing();

            const rect = flameEl?.getBoundingClientRect?.();
            const ox = rect ? (rect.left + rect.width / 2) / Math.max(1, window.innerWidth) : 0.5;
            const oy = rect ? (rect.top + rect.height / 2) / Math.max(1, window.innerHeight) : 0.38;
            launchCelebrationFx({ originX: ox, originY: oy });

            setStatus(doneText || "愿望已被烛光收下。终端已解锁。");
            toast("终端已解锁。");

            if (state.settings?.reduceMotion) {
              roomEl?.classList?.add?.("is-revealed");
              revealEl?.setAttribute?.("aria-hidden", "false");
              cs.data.wishFxPlayed = true;
              persist();
              return;
            }

            revealTimer = window.setTimeout(() => {
              roomEl?.classList?.add?.("is-revealed");
              revealEl?.setAttribute?.("aria-hidden", "false");
              cs.data.wishFxPlayed = true;
              persist();
            }, 920);
          },
        });

        if (activeHold && typeof activeHold.stop === "function") {
          const origStop = activeHold.stop.bind(activeHold);
          activeHold.stop = () => {
            origStop();
            cleanupTimers();
            roomEl?.classList?.remove?.("is-running", "is-blown", "is-shake");
          };
        }
        activeHold.start();
      };

      if (cs.data.silenceDone) {
        setProgress(1);
        roomEl?.classList?.add?.("is-done", "is-success");
        if (!cs.data.wishFxPlayed) {
          cs.data.wishFxPlayed = true;
          persist();
        }
        roomEl?.classList?.add?.("is-revealed");
        revealEl?.setAttribute?.("aria-hidden", "false");
      }

      startBtn.addEventListener("click", start);
      cancelBtn?.addEventListener("click", cancel);
    }

    const btnBack = document.getElementById("btnBack6");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        cs.phase = "observation";
        persist();
        renderCase(caseDef.id);
      });
    }

    const btnAuto = document.getElementById("btnAutoKey6");
    if (btnAuto) {
      btnAuto.addEventListener("click", () => {
        const pass = String(getRecoveredCase2Passphrase() || "").trim();
        const frag = String(getRecoveredCase5Fragment() || "").trim();
        if (!pass || !frag) return toast("还缺少口令/碎片：先完成前面关卡。");
        const key = computeFinalKey(caseDef);
        const inputEl = document.getElementById("case6Input");
        if (inputEl) inputEl.value = key;
        toast("已自动填入最终口令。");
      });
    }

    const btnSubmit = document.getElementById("btnSubmit6");
    if (btnSubmit) {
      btnSubmit.addEventListener("click", () => {
        const expected = computeFinalKey(caseDef);
        const input = (document.getElementById("case6Input")?.value || "").trim();
        if (normalize(input) === normalize(expected)) {
          state.warmMode = true;
          persist();
          completeCase(caseDef, caseDef.solution?.revealText);
          return;
        }
        registerWrongAttempt(cs, "最终口令不对。回到前面关卡核对口令与碎片。");
      });
    }
  }

  function completeCase(caseDef, revealText) {
    stopActiveWork();
    revealText = softenNarrativeCopy(revealText);
    if (!state.completedCaseIds.includes(caseDef.id)) state.completedCaseIds.push(caseDef.id);
    persist();
    syncTopbar();
    preloadNextCaseAssets(caseDef.order + 1);

    if (state.settings?.skipRewards) {
      toast(revealText || "结案完成。");
      if (caseDef.id === "case6") {
        state.warmMode = true;
        persist();
        return renderFinal();
      }
      return navigate({ name: "cases", caseId: null });
    }

    const title = `结案：第 ${caseDef.order} 关已完成`;
    audio.setDuck?.(0.12);

    if (caseDef.id === "case1") {
      openCase1CinematicSuccess(caseDef, revealText);
      return;
    }
    if (caseDef.id === "case2") {
      openCase2CinematicSuccess(caseDef, revealText);
      return;
    }
    if (caseDef.id === "case3") {
      openCase3CinematicSuccess(caseDef, revealText);
      return;
    }
    if (caseDef.id === "case5") {
      openCase5CinematicSuccess(caseDef, revealText);
      return;
    }
    if (caseDef.id === "case6") {
      openCase6CinematicSuccess(caseDef, revealText);
      return;
    }

    openOverlayHtml(`
      <div class="modal">
        <div class="modal__header">
          <div class="modal__title">${escapeHtml(title)}</div>
          <button class="btn btn-ghost tiny" type="button" data-close>关闭</button>
        </div>
         <div class="modal__body">
            <div class="hintbox">${escapeHtml(revealText || "你解开了这一关。")}</div>
            ${renderRewardText(caseDef)}
            ${renderCompletionFx(caseDef)}
            ${renderCaseInterlude(caseDef, { compact: true })}
            ${renderVideo(caseDef)}
            <div class="row" style="margin-top:12px">
              <button class="btn btn-primary" type="button" data-close>继续</button>
            </div>
         </div>
      </div>
    `);

    if (!overlayEl) return;
    overlayEl.querySelectorAll("[data-close]").forEach((b) => {
      b.addEventListener("click", () => {
        closeOverlay();
        if (caseDef.id === "case6") {
          state.warmMode = true;
          persist();
          return renderFinal();
        }
        navigate({ name: "cases", caseId: null });
      });
    });
  }

  function openCase6CinematicSuccess(caseDef, revealText) {
    if (!overlayEl) return;

    const key = computeFinalKey(caseDef);
    const aiSrc = String(caseDef.data?.finalAiImage || "").trim();
    const quote = String(caseDef.data?.wishQuote || "门外没有案发现场，只有全世界为你准备的祝福。").trim();
    const lines = [
      "口令验证通过。",
      "时间窃贼已被逮捕。所有的谎言和冰冷的案件，都在此刻结束。",
      "",
      "推开这扇门，去接收全世界为你准备的爱意吧。",
    ]
      .filter((x) => x !== null && x !== undefined)
      .join("\n");

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      if (overlayEl.classList.contains("hidden")) return;
      e.preventDefault();
      e.stopImmediatePropagation?.();
      closeAndBack();
    };

    const cleanup = () => {
      window.removeEventListener("keydown", onEsc, true);
    };

    const closeAndBack = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "cases", caseId: null });
    };

    const enterFinal = () => {
      cleanup();
      closeOverlay();
      state.warmMode = true;
      persist();
      renderFinal();
    };

    window.addEventListener("keydown", onEsc, true);
    overlayEl.addEventListener(
      "click",
      (e) => {
        if (e.target === overlayEl) closeAndBack();
      },
      { once: true },
    );

    audio.setDuck?.(0.08);
    lockScrollForOverlay();
    overlayEl.classList.remove("hidden");
    overlayEl.setAttribute("aria-hidden", "false");
    overlayEl.innerHTML = `
      <div class="modal case6-modal">
        <div class="modal__header">
          <div class="modal__title">零点的祝福 · 全案终结</div>
          <button id="btnCase6Later" class="btn btn-ghost tiny" type="button">稍后</button>
        </div>
        <div class="modal__body">
          ${
            aiSrc
              ? `
                <div class="case6-wishcard" aria-label="终章惊喜照片">
                  <div class="case6-wishcard__img">
                    <img src="${escapeAttr(aiSrc)}" alt="生日惊喜照片（AI）" loading="eager" decoding="async" />
                  </div>
                  <div class="case6-wishcard__quote">${escapeHtml(quote)}</div>
                </div>
              `
              : ""
          }
          <div class="case6-dossier" aria-label="最高机密卷宗">
            <div class="case6-dossier__seal">TOP SECRET</div>
            <div class="case6-dossier__headline">口令验证通过</div>
            <div class="case6-dossier__meta">
              <span class="badge">最终口令</span> <span class="mono">${escapeHtml(key || "—")}</span>
            </div>
            <div class="case6-dossier__text typewriter" data-typewriter data-speed="16">
              <div class="typewriter__src">${escapeHtml(lines)}</div>
              <div class="typewriter__out"></div>
            </div>
          </div>

          ${revealText ? `<div class="hintbox" style="margin-top:12px">${escapeHtml(String(revealText))}</div>` : ""}
          ${renderRewardText(caseDef)}
          ${renderVideo(caseDef)}

          <div class="row" style="margin-top:14px;justify-content:center;flex-wrap:wrap">
            <button id="btnCase6EnterFinal" class="btn btn-primary" type="button">🎁 推开门（进入记忆相册）</button>
            <button id="btnCase6Back" class="btn btn-ghost" type="button">返回关卡室</button>
          </div>
        </div>
      </div>
    `;

    bindTypewriters(overlayEl);
    document.getElementById("btnCase6Later")?.addEventListener("click", closeAndBack);
    document.getElementById("btnCase6Back")?.addEventListener("click", closeAndBack);
    document.getElementById("btnCase6EnterFinal")?.addEventListener("click", enterFinal);

    // Confetti (best-effort)
    launchCelebrationFx({ originX: 0.5, originY: 0.24, confettiCount: 160, sparkCount: 52 });
  }

  function buildCase1Letter(caseDef) {
    const cs = (caseDef?.id && state.perCase?.[caseDef.id]) || state.perCase?.case1;
    const data = caseDef?.data || {};
    const suspects = Array.isArray(data.suspects) ? data.suspects : [];

    const nick = String(CONFIG.people?.recipientNickname || "").trim();
    const displayName = nick || String(CONFIG.people?.recipientName || "").trim() || "侦探";

    const memoryKey = String(cs?.data?.memoryKey || data.memoryKey || "MEMORY-01").trim() || "MEMORY-01";

    const orderArr = cs?.data?.keyOrder || caseDef?.solution?.keyOrder || [];
    const keyOrder = Array.isArray(orderArr) ? orderArr.filter(Boolean).join("-") : String(orderArr || "").trim();

    const culpritId = String(caseDef?.solution?.culpritId || "").trim();
    const culpritName = suspects.find((s) => s.id === culpritId)?.name || culpritId || "—";

    const dong = suspects.find((s) => s.id === "dong")?.name || "东代码";
    const chen = suspects.find((s) => s.id === "chen")?.name || "辰统筹";
    const fei = suspects.find((s) => s.id === "fei")?.name || "菲镜头";
    const winter = suspects.find((s) => s.id === "winter")?.name || "冬贪吃";

    const letter = [
      `恭喜${displayName}侦探，检举成功！`,
      "并不是真的有人偷走了烛台，",
      `而是${culpritName}在客厅为你守着那束月光。`,
      "",
      `${dong}在书房调试投影仪，${chen}在卧室挂横幅，`,
      `${fei}在走廊准备拉响礼花，${winter}在阳台给气球打气……`,
      "大家都在等你推开门的那一刻。",
      "",
      "愿你在新的一岁里，依然拥有探索迷雾的勇气，",
      "也拥有被爱意包围的运气。",
      "",
      "烛光已点亮，请收下那枚写着「记忆档案室」的芯片。",
    ].join("\n");

    return { memoryKey, keyOrder, culpritName, letter };
  }

  function openCase1CinematicSuccess(caseDef, revealText) {
    if (!overlayEl) return;

    let stage = "lock"; // lock -> letter -> theater
    let timer = null;
    let heavyVideoPrimed = false;

    const go = (next) => {
      stage = next;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      render();
    };

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      if (overlayEl.classList.contains("hidden")) return;
      e.preventDefault();
      closeAndContinue();
    };

    const cleanup = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      window.removeEventListener("keydown", onEsc, true);
    };

    const closeAndContinue = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "cases", caseId: null });
    };

    const closeAndGoCase2 = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "case", caseId: "case2" });
    };

    window.addEventListener("keydown", onEsc, true);

    const render = () => {
      lockScrollForOverlay();
      overlayEl.classList.remove("hidden");
      overlayEl.setAttribute("aria-hidden", "false");

      if (stage === "lock") {
        audio.setDuck?.(0.06);
        overlayEl.innerHTML = renderCase1CinematicLock();
        const btnSkip = document.getElementById("btnCineSkip1");
        if (btnSkip) btnSkip.addEventListener("click", () => go("letter"));
        timer = window.setTimeout(() => go("letter"), 1750);
        return;
      }

      const info = buildCase1Letter(caseDef);

      if (stage === "letter") {
        audio.setDuck?.(0.12);
        overlayEl.innerHTML = renderCase1CinematicLetter(caseDef, info, revealText);
        bindTypewriters(overlayEl);
        if (!heavyVideoPrimed) {
          heavyVideoPrimed = true;
          preloadVideo(caseDef.assets?.video, "auto");
        }

        document.getElementById("btnCinePlay1")?.addEventListener("click", () => {
          go("theater");
          const v = document.getElementById("cineVideo1");
          v?.play?.().catch(() => {
            // ignore autoplay issues
          });
        });
        document.getElementById("btnCineGo2_1")?.addEventListener("click", closeAndGoCase2);
        document.getElementById("btnCineClose1")?.addEventListener("click", closeAndContinue);
        return;
      }

      if (stage === "theater") {
        audio.setDuck?.(0);
        overlayEl.innerHTML = renderCase1CinematicTheater(caseDef, info);
        const v = document.getElementById("cineVideo1");
        v?.play?.().catch(() => {
          // ignore autoplay issues
        });

        document.getElementById("btnCineBack1")?.addEventListener("click", () => go("letter"));
        document.getElementById("btnCineCloseVideo1")?.addEventListener("click", closeAndContinue);
        document.getElementById("btnCineReplay1")?.addEventListener("click", () => {
          if (!v) {
            const frame = overlayEl.querySelector(".theater__iframe");
            if (!frame) return;
            const src = frame.getAttribute("src") || "";
            try {
              frame.setAttribute("src", "about:blank");
              window.setTimeout(() => frame.setAttribute("src", src), 80);
            } catch {
              // ignore
            }
            return;
          }
          try {
            v.currentTime = 0;
          } catch {
            // ignore
          }
          v.play?.().catch(() => {
            // ignore
          });
        });
      }
    };

    render();
  }

  function renderCase1CinematicLock() {
    return `
      <div class="cinema cinema--lock cinema--case1" role="document" aria-label="结案动画：锁定">
        <div class="cinema__center">
          <div class="cagefx cagefx--cinema" aria-hidden="true"><div class="cagefx__cage"></div></div>
          <button id="btnCineSkip1" class="btn btn-ghost tiny cinema__skip" type="button">点击跳过</button>
        </div>
      </div>
    `;
  }

  function renderCase1CinematicLetter(caseDef, info, revealText) {
    const memory = info.memoryKey || "MEMORY-01";
    const keyOrder = info.keyOrder || "";
    const letter = String(info.letter || "").trim();
    const reveal = String(revealText || "").trim();
    const hasReveal = !!reveal;
    const title = hasReveal ? "【真相大白】" : "【案件复盘】";
    let mainText = hasReveal ? reveal : letter;
    if (hasReveal) mainText = mainText.replace(/^【真相大白】/, "").trimStart();

    const confetti = Array.from({ length: 14 })
      .map((_, i) => `<span class="confetti__p" style="--i:${i}"></span>`)
      .join("");

    const typewriter = state.settings?.reduceMotion
      ? `<pre class="typewriter__out mono letter-out">${escapeHtml(mainText)}</pre>`
      : `
         <div class="typewriter letter-tw" data-typewriter data-speed="14">
           <pre class="typewriter__src">${escapeHtml(mainText)}</pre>
           <pre class="typewriter__out mono letter-out"></pre>
         </div>
       `;

    return `
      <div class="cinema cinema--letter cinema--case1" role="document" aria-label="结案信笺">
        <div class="cinema__fx" aria-hidden="true">
          <div class="confetti confetti--soft">${confetti}</div>
        </div>
        <div class="cinema__center">
          <section class="letter-card" aria-label="结案信笺">
            <div class="letter-card__title">${escapeHtml(title)}</div>
            <div class="letter-card__body">
              ${typewriter}
            </div>
            <div class="letter-card__meta">
              <span class="badge">线索芯片</span> <span class="mono">[${escapeHtml(memory)}]</span>
              ${keyOrder ? `<span class="badge" style="margin-left:8px">路线钥匙</span> <span class="mono">${escapeHtml(keyOrder)}</span>` : ""}
            </div>
            ${renderCaseInterlude(caseDef, { compact: true })}
            <div class="letter-card__actions">
              <button id="btnCineGo2_1" class="btn btn-primary" type="button">➡️ 前往第二关：思维殿堂</button>
              <button id="btnCinePlay1" class="btn btn-ghost" type="button">🎁 播放彩蛋视频</button>
              <button id="btnCineClose1" class="btn btn-ghost" type="button">返回关卡室</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderCase1CinematicTheater(caseDef, info) {
    const src = String(caseDef.assets?.video || "").trim();
    return `
      <div class="cinema cinema--theater cinema--case1" role="document" aria-label="暗房观影">
        <div class="theater-hud">
          <button id="btnCineBack1" class="btn btn-ghost tiny" type="button">返回信笺</button>
          <button id="btnCineReplay1" class="btn btn-ghost tiny" type="button">重播</button>
          <button id="btnCineCloseVideo1" class="btn btn-ghost tiny" type="button">关闭</button>
        </div>
        <div class="theater">
          <div class="theater__player">
            ${renderTheaterMedia(src)}
          </div>
        </div>
      </div>
    `;
  }

  function renderTheaterMedia(src, videoId = "cineVideo1") {
    const s = String(src || "").trim();
    if (!s) {
      return `<div class="hintbox">未配置彩蛋视频。你可以在 <span class="mono">config.js</span> 里为该关卡填写 <span class="mono">assets.video</span> 路径。</div>`;
    }
    const isLikelyIframe = /^https?:\/\//i.test(s) && !/\.(mp4|webm|ogg)(\?|#|$)/i.test(s);
    if (isLikelyIframe) {
      return `
        <div class="theater__frame">
          <iframe class="theater__iframe" src="${escapeAttr(s)}" title="彩蛋视频" allow="autoplay; fullscreen" allowfullscreen></iframe>
        </div>
      `;
    }
    const vid = String(videoId || "cineVideo1").trim() || "cineVideo1";
    return `<video id="${escapeAttr(vid)}" class="theater__video" src="${escapeAttr(s)}" controls playsinline preload="auto"></video>`;
  }

  function openCase2CinematicSuccess(caseDef, revealText) {
    if (!overlayEl) return;

    let stage = "reveal"; // reveal -> message -> theater
    let timer = null;
    let heavyVideoPrimed = false;

    const go = (next) => {
      stage = next;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      render();
    };

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      if (overlayEl.classList.contains("hidden")) return;
      e.preventDefault();
      closeAndContinue();
    };

    const cleanup = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      window.removeEventListener("keydown", onEsc, true);
    };

    const closeAndContinue = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "cases", caseId: null });
    };

    window.addEventListener("keydown", onEsc, true);

    const render = () => {
      lockScrollForOverlay();
      overlayEl.classList.remove("hidden");
      overlayEl.setAttribute("aria-hidden", "false");

      if (stage === "reveal") {
        audio.setDuck?.(0.06);
        overlayEl.innerHTML = renderCase2CinematicReveal(caseDef);
        const ms = state.settings?.reduceMotion ? 650 : 3000;
        timer = window.setTimeout(() => go("message"), ms);
        overlayEl.querySelector(".cinema")?.addEventListener("pointerdown", () => go("message"), { once: true });
        return;
      }

      if (stage === "message") {
        audio.setDuck?.(0.12);
        overlayEl.innerHTML = renderCase2CinematicMessage(caseDef, revealText);
        if (!heavyVideoPrimed) {
          heavyVideoPrimed = true;
          preloadVideo(caseDef.assets?.video, "auto");
        }
        document.getElementById("btnCinePlay2")?.addEventListener("click", () => go("theater"));
        const btnToggle = document.getElementById("btnCineToggleText2");
        const card = overlayEl.querySelector(".mp-message-card");
        if (btnToggle && card) {
          let collapsed = false;
          btnToggle.addEventListener("click", () => {
            collapsed = !collapsed;
            card.classList.toggle("is-collapsed", collapsed);
            btnToggle.textContent = collapsed ? "展开文字" : "隐藏文字";
            btnToggle.setAttribute("aria-pressed", collapsed ? "true" : "false");
            toast(collapsed ? "已收起文字" : "已展开文字");
          });
        }
        return;
      }

      if (stage === "theater") {
        audio.setDuck?.(0);
        overlayEl.innerHTML = renderCase2CinematicTheater(caseDef);
        const v = document.getElementById("cineVideo2");
        v?.play?.().catch(() => {
          // ignore autoplay issues
        });

        document.getElementById("btnCineBack2")?.addEventListener("click", () => go("message"));
        document.getElementById("btnCineCloseVideo2")?.addEventListener("click", closeAndContinue);
        document.getElementById("btnCineReplay2")?.addEventListener("click", () => {
          const v2 = document.getElementById("cineVideo2");
          if (!v2) {
            const frame = overlayEl.querySelector(".theater__iframe");
            if (!frame) return;
            const src = frame.getAttribute("src") || "";
            try {
              frame.setAttribute("src", "about:blank");
              window.setTimeout(() => frame.setAttribute("src", src), 80);
            } catch {
              // ignore
            }
            return;
          }
          try {
            v2.currentTime = 0;
          } catch {
            // ignore
          }
          v2.play?.().catch(() => {
            // ignore
          });
        });
      }
    };

    render();
  }

  function renderCase2CinematicScene(caseDef) {
    const memories = getCase2Memories(caseDef);
    const pts = memories.filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${Number(p.x).toFixed(2)} ${Number(p.y).toFixed(2)}`).join(" ");

    const photos = memories
      .map((m, i) => {
        const imgVar = m.img ? `--img:url("${m.img}")` : "--img:none";
        const style = `--x:${Number(m.x).toFixed(2)}%;--y:${Number(m.y).toFixed(2)}%;--i:${i};${imgVar}`;
        return `<span class="mp-cine__photo" style="${escapeAttr(style)}" aria-hidden="true"></span>`;
      })
      .join("");

    return `
      <div class="mp-cine__field" aria-label="时间线重构：22">
        ${renderCase2FieldFx(memories)}
        <svg class="mp-cine__svg" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="mpCineLaser" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="rgba(255, 121, 198, 0.18)"></stop>
              <stop offset="0.35" stop-color="rgba(255, 121, 198, 0.92)"></stop>
              <stop offset="0.7" stop-color="rgba(255, 214, 240, 0.62)"></stop>
              <stop offset="1" stop-color="rgba(255, 121, 198, 0.25)"></stop>
            </linearGradient>
          </defs>
          <path class="mp-cine__glow" d="${escapeAttr(d)}"></path>
          <path class="mp-cine__path" d="${escapeAttr(d)}"></path>
        </svg>
        <div class="mp-cine__photos" aria-hidden="true">${photos}</div>
      </div>
    `;
  }

  function renderCase2CinematicReveal(caseDef) {
    return `
      <div class="cinema cinema--mp-reveal" role="document" aria-label="记忆重构：揭晓">
        <div class="cinema__center">
          <div class="mp-cine">
            ${renderCase2CinematicScene(caseDef)}
          </div>
        </div>
      </div>
    `;
  }

  function renderCase2CinematicMessage(caseDef, revealText) {
    const pass = String(getRecoveredCase2Passphrase() || caseDef.solution?.passphrase || "").trim();
    const body =
      "时间闭环已构建。走过这么多路，每一站都算数。恭喜顺利抵达你的第 22 个坐标点。祝你的 22 岁，如星辰般璀璨。";
    const fallback = String(revealText || "").trim();

    return `
      <div class="cinema cinema--mp-message" role="document" aria-label="记忆重构完成">
        <div class="theater-hud">
          <button id="btnCineToggleText2" class="btn btn-ghost tiny" type="button" aria-pressed="false">隐藏文字</button>
        </div>
        <div class="cinema__center">
          <div class="mp-cine">
            ${renderCase2CinematicScene(caseDef)}
            <section class="mp-message-card" aria-label="记忆重构完成：奖励">
              <div class="mp-message-card__title">
                记忆重构完成<span class="mp-message-card__en">(Memory Reconstructed)</span>
              </div>
              <div class="mp-message-card__body">${escapeHtml(body)}</div>
              <div class="mp-message-card__reward">
                <span class="badge">获得密钥碎片</span> <span class="mono">B [FRAGMENT-22]</span>
                ${pass ? `<span class="badge">口令</span> <span class="mono">${escapeHtml(pass)}</span>` : ""}
                ${!pass && fallback ? `<span class="badge">记录</span> <span class="mono">${escapeHtml(fallback)}</span>` : ""}
              </div>
              ${renderCaseInterlude(caseDef, { compact: true })}
              <div class="mp-message-card__actions">
                <button id="btnCinePlay2" class="btn btn-primary mp-message-card__btn" type="button">▶ 开启最终惊喜 (Reveal Final Surprise)</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function renderCase2CinematicTheater(caseDef) {
    const src = String(caseDef.assets?.video || "").trim();
    return `
      <div class="cinema cinema--theater" role="document" aria-label="暗房观影">
        <div class="theater-hud">
          <button id="btnCineBack2" class="btn btn-ghost tiny" type="button">返回</button>
          <button id="btnCineReplay2" class="btn btn-ghost tiny" type="button">重播</button>
          <button id="btnCineCloseVideo2" class="btn btn-ghost tiny" type="button">关闭</button>
        </div>
        <div class="theater">
          <div class="theater__player">
            ${renderTheaterMedia(src, "cineVideo2")}
          </div>
        </div>
      </div>
    `;
  }

  function openCase3CinematicSuccess(caseDef, revealText) {
    if (!overlayEl) return;

    let stage = "merge"; // merge -> message -> theater
    let timer = null;
    let heavyVideoPrimed = false;

    const go = (next) => {
      stage = next;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      render();
    };

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      if (overlayEl.classList.contains("hidden")) return;
      e.preventDefault();
      closeAndContinue();
    };

    const cleanup = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      window.removeEventListener("keydown", onEsc, true);
    };

    const closeAndContinue = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "cases", caseId: null });
    };

    window.addEventListener("keydown", onEsc, true);

    const render = () => {
      lockScrollForOverlay();
      overlayEl.classList.remove("hidden");
      overlayEl.setAttribute("aria-hidden", "false");

      if (stage === "merge") {
        audio.setDuck?.(0.06);
        overlayEl.innerHTML = renderCase3CinematicMerge(caseDef);
        const ms = state.settings?.reduceMotion ? 650 : 4200;
        timer = window.setTimeout(() => go("message"), ms);
        overlayEl.querySelector(".cinema")?.addEventListener("pointerdown", () => go("message"), { once: true });
        return;
      }

      if (stage === "message") {
        audio.setDuck?.(0.12);
        overlayEl.innerHTML = renderCase3CinematicMessage(caseDef, revealText);
        if (!heavyVideoPrimed) {
          heavyVideoPrimed = true;
          preloadVideo(caseDef.assets?.video, "auto");
        }
        document.getElementById("btnCinePlay3")?.addEventListener("click", () => go("theater"));
        document.getElementById("btnCineClose3")?.addEventListener("click", closeAndContinue);
        return;
      }

      if (stage === "theater") {
        audio.setDuck?.(0);
        overlayEl.innerHTML = renderCase3CinematicTheater(caseDef);
        const v = document.getElementById("cineVideo3");
        v?.play?.().catch(() => {
          // ignore autoplay issues
        });

        document.getElementById("btnCineBack3")?.addEventListener("click", () => go("message"));
        document.getElementById("btnCineCloseVideo3")?.addEventListener("click", closeAndContinue);
        document.getElementById("btnCineReplay3")?.addEventListener("click", () => {
          const v2 = document.getElementById("cineVideo3");
          if (!v2) {
            const frame = overlayEl.querySelector(".theater__iframe");
            if (!frame) return;
            const src = frame.getAttribute("src") || "";
            try {
              frame.setAttribute("src", "about:blank");
              window.setTimeout(() => frame.setAttribute("src", src), 80);
            } catch {
              // ignore
            }
            return;
          }
          try {
            v2.currentTime = 0;
          } catch {
            // ignore
          }
          v2.play?.().catch(() => {
            // ignore
          });
        });
      }
    };

    render();
  }

  function renderCase3CinematicMerge(caseDef) {
    const fileNo = String(caseDef.data?.fileNo || "22").trim() || "22";
    const starts = [
      { sx: -220, sy: -84, sr: -18 },
      { sx: 240, sy: -58, sr: 16 },
      { sx: -200, sy: 148, sr: 12 },
      { sx: 228, sy: 132, sr: -10 },
    ];
    const chars = ["W", "I", "S", "H"].map((ch, i) => {
      const s = starts[i] || { sx: 0, sy: 0, sr: 0 };
      return `<span class="wish-merge__l mono" style="--i:${i};--sx:${escapeAttr(String(s.sx))}px;--sy:${escapeAttr(String(s.sy))}px;--sr:${escapeAttr(String(s.sr))}deg">${escapeHtml(ch)}</span>`;
    });

    return `
      <div class="cinema cinema--wish-merge" role="document" aria-label="字母合成：WISH">
        <div class="cinema__center">
          <div class="wish-merge" aria-label="WISH 合成动画">
            <div class="wish-merge__kicker mono">FILE #${escapeHtml(fileNo)} • UV SCAN COMPLETE</div>
            <div class="wish-merge__letters" aria-hidden="true">${chars.join("")}</div>
            <div class="wish-merge__word mono">WISH</div>
            <div class="wish-merge__sub">把冷的证据，炼成暖的答案。</div>
            <div class="wish-merge__flash" aria-hidden="true"></div>
            <div class="wish-merge__hint mono">点击任意位置跳过</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCase3CinematicMessage(caseDef, revealText) {
    const fileNo = String(caseDef.data?.fileNo || "22").trim() || "22";
    const frag = String(getRecoveredCase3Fragment() || caseDef.solution?.fragment || caseDef.solution?.letters || "WISH").trim() || "WISH";
    const num = String(getRecoveredCase3Number() || caseDef.solution?.caseNumber || "").trim();
    const body = String(revealText || caseDef.solution?.revealText || "").trim();
    const report = softenNarrativeCopy(String(caseDef.rewardText || "").trim());

    const evidences = getCase3AlchemyEvidences(caseDef);
    const order = String(caseDef.solution?.letters || "WISH")
      .trim()
      .split("")
      .filter(Boolean);
    const idx = (l) => {
      const i = order.indexOf(l);
      return i === -1 ? 999 : i;
    };
    const rows = evidences
      .slice()
      .sort((a, b) => idx(a.letter) - idx(b.letter) || a.letter.localeCompare(b.letter))
      .map((e) => {
        const cold = e.coldWord || e.letter;
        const warm = e.warmWord || e.letter;
        return `
          <div class="wish-map__row">
            <span class="wish-map__cold mono">${escapeHtml(cold)}</span>
            <span class="wish-map__arrow" aria-hidden="true">→</span>
            <span class="wish-map__warm">${escapeHtml(warm)}</span>
          </div>
        `;
      })
      .join("");

    const closing = "你所经历的一切，都是一份礼物。WISH —— 愿你所想，皆能如愿。";
    const hasVideo = !!String(caseDef.assets?.video || "").trim();
    const reportHtml = report
      ? `<div class="wish-card__report">${escapeHtml(report)}</div>`
      : `<div class="wish-card__report">${escapeHtml("你用紫外线探照灯把冷的证据，炼成了暖的答案。")}</div>`;
    const systemHtml = body ? `<div class="wish-card__system mono">${escapeHtml(body)}</div>` : "";

    return `
        <div class="cinema cinema--wish-message" role="document" aria-label="结案：第 22 号档案">
          <div class="cinema__center">
            <section class="wish-card" aria-label="第 22 号档案：结案报告">
              <div class="wish-card__title">CASE CLOSED <span class="wish-card__en mono">FILE #${escapeHtml(fileNo)}</span></div>
              <div class="wish-stamp" aria-hidden="true">
                <div class="wish-stamp__main mono">已封存</div>
                <div class="wish-stamp__sub mono">FILE #${escapeHtml(fileNo)}</div>
               </div>
               <div class="wish-card__map" aria-label="字母炼金术映射">${rows}</div>
              <div class="wish-card__body">
                ${reportHtml}
                ${systemHtml}
              </div>
               <div class="wish-card__closing">${escapeHtml(closing)}</div>
               <div class="wish-card__reward">
                 <span class="badge">获得碎片</span> <span class="mono">C [${escapeHtml(frag)}]</span>
               ${num ? `<span class="badge" style="margin-left:8px">案件编号</span> <span class="mono">${escapeHtml(num)}</span>` : ""}
            </div>
            ${renderCaseInterlude(caseDef, { compact: true, variant: "paper" })}
            <div class="wish-card__actions">
              ${
                hasVideo
                  ? `<button id="btnCinePlay3" class="btn btn-primary wish-card__btn" type="button">▶ 播放彩蛋视频</button>`
                  : `<button class="btn btn-primary wish-card__btn" type="button" disabled>暂无彩蛋视频</button>`
              }
              <button id="btnCineClose3" class="btn btn-ghost wish-card__btn" type="button">继续</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderCase3CinematicTheater(caseDef) {
    const src = String(caseDef.assets?.video || "").trim();
    return `
      <div class="cinema cinema--theater" role="document" aria-label="暗房观影">
        <div class="theater-hud">
          <button id="btnCineBack3" class="btn btn-ghost tiny" type="button">返回</button>
          <button id="btnCineReplay3" class="btn btn-ghost tiny" type="button">重播</button>
          <button id="btnCineCloseVideo3" class="btn btn-ghost tiny" type="button">关闭</button>
        </div>
        <div class="theater">
          <div class="theater__player">
            ${renderTheaterMedia(src, "cineVideo3")}
          </div>
        </div>
      </div>
    `;
  }

  function openCase5CinematicSuccess(caseDef, revealText) {
    if (!overlayEl) return;

    let stage = "black"; // black -> message -> theater
    let timer = null;
    let dinged = false;
    let heavyVideoPrimed = false;

    const go = (next) => {
      stage = next;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      render();
    };

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      if (overlayEl.classList.contains("hidden")) return;
      e.preventDefault();
      closeAndContinue();
    };

    const cleanup = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      window.removeEventListener("keydown", onEsc, true);
    };

    const closeAndContinue = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "cases", caseId: null });
    };

    const closeAndGoCase2 = () => {
      cleanup();
      closeOverlay();
      navigate({ name: "case", caseId: "case2" });
    };

    const playElevatorDing = () => {
      if (!state.audio?.unlocked || state.audio?.muted) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = window.__case5CineCtx || (window.__case5CineCtx = new Ctx());
        ctx.resume?.().catch(() => {
          // ignore
        });
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        gain.connect(ctx.destination);

        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o1.type = "sine";
        o2.type = "sine";
        o1.frequency.setValueAtTime(880, now);
        o2.frequency.setValueAtTime(1320, now);
        o2.detune.setValueAtTime(7, now);
        o1.connect(gain);
        o2.connect(gain);
        o1.start(now);
        o2.start(now);
        o1.stop(now + 0.7);
        o2.stop(now + 0.7);
      } catch {
        // ignore
      }
    };

    window.addEventListener("keydown", onEsc, true);

    const render = () => {
      lockScrollForOverlay();
      overlayEl.classList.remove("hidden");
      overlayEl.setAttribute("aria-hidden", "false");

      if (stage === "black") {
        audio.setDuck?.(0.06);
        overlayEl.innerHTML = renderCase5CinematicBlack();
        bindTypewriters(overlayEl);
        if (!dinged) {
          dinged = true;
          playElevatorDing();
        }
        const ms = state.settings?.reduceMotion ? 650 : 2200;
        timer = window.setTimeout(() => go("message"), ms);
        overlayEl.querySelector(".cinema")?.addEventListener("pointerdown", () => go("message"), { once: true });
        return;
      }

      if (stage === "message") {
        audio.setDuck?.(0.12);
        overlayEl.innerHTML = renderCase5CinematicMessage(caseDef, revealText);
        bindTypewriters(overlayEl);
        if (!heavyVideoPrimed) {
          heavyVideoPrimed = true;
          preloadVideo(caseDef.assets?.video, "auto");
        }
        document.getElementById("btnCinePlay5")?.addEventListener("click", () => go("theater"));
        document.getElementById("btnCineClose5")?.addEventListener("click", closeAndContinue);
        return;
      }

      if (stage === "theater") {
        audio.setDuck?.(0);
        overlayEl.innerHTML = renderCase5CinematicTheater(caseDef);
        const v = document.getElementById("cineVideo5");
        v?.play?.().catch(() => {
          // ignore autoplay issues
        });

        document.getElementById("btnCineBack5")?.addEventListener("click", () => go("message"));
        document.getElementById("btnCineCloseVideo5")?.addEventListener("click", closeAndContinue);
        document.getElementById("btnCineReplay5")?.addEventListener("click", () => {
          const v2 = document.getElementById("cineVideo5");
          if (!v2) {
            const frame = overlayEl.querySelector(".theater__iframe");
            if (!frame) return;
            const src = frame.getAttribute("src") || "";
            try {
              frame.setAttribute("src", "about:blank");
              window.setTimeout(() => frame.setAttribute("src", src), 80);
            } catch {
              // ignore
            }
            return;
          }
          try {
            v2.currentTime = 0;
          } catch {
            // ignore
          }
          v2.play?.().catch(() => {
            // ignore
          });
        });
        return;
      }
    };

    render();
  }

  function renderCase5CinematicBlack() {
    const line = "你以为《摩天大厦》的顶层藏着案发现场？";
    const typewriter = state.settings?.reduceMotion
      ? `<pre class="typewriter__out mono case5-black__out">${escapeHtml(line)}</pre>`
      : `
        <div class="typewriter case5-black__tw" data-typewriter data-speed="18">
          <pre class="typewriter__src">${escapeHtml(line)}</pre>
          <pre class="typewriter__out mono case5-black__out"></pre>
        </div>
      `;
    return `
      <div class="cinema cinema--case5-black" role="document" aria-label="电梯上行">
        <div class="cinema__center">
          <div class="case5-black">
            <div class="badge">电梯上行</div>
            ${typewriter}
            <div class="case5-black__hint">（点击继续）</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCase5CinematicMessage(caseDef, revealText) {
    const subtitle = softenNarrativeCopy(String(caseDef.rewardText || "").trim());
    const reveal = String(revealText || "").trim();
    const msg = subtitle || reveal || "";
    const hasVideo = !!String(caseDef.assets?.video || "").trim();

    const typewriter = state.settings?.reduceMotion
      ? `<div class="case5-caption__body">${escapeHtml(msg)}</div>`
      : `
        <div class="typewriter case5-caption__body" data-typewriter data-speed="14">
          <pre class="typewriter__src">${escapeHtml(msg)}</pre>
          <pre class="typewriter__out mono"></pre>
        </div>
      `;

    return `
      <div class="cinema cinema--case5-garden" role="document" aria-label="星空花园 · 结案说明">
        <div class="cinema__center">
          <div class="case5-caption">
            <div class="badge">灯光亮起 · 星空花园</div>
            <div class="case5-caption__scroll">
              ${reveal ? `<div class="case5-caption__small">${escapeHtml(reveal)}</div>` : ""}
              ${renderCaseInterlude(caseDef, { compact: true })}
              ${typewriter}
            </div>
            <div class="row case5-caption__actions">
              ${
                hasVideo
                  ? `<button id="btnCinePlay5" class="btn btn-primary" type="button">▶ 播放彩蛋视频</button>`
                  : `<button class="btn btn-primary" type="button" disabled>暂无彩蛋视频</button>`
              }
              <button id="btnCineClose5" class="btn btn-ghost" type="button">继续</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCase5CinematicTheater(caseDef) {
    const src = String(caseDef.assets?.video || "").trim();
    return `
      <div class="cinema cinema--theater cinema--case5" role="document" aria-label="彩蛋视频">
        <div class="theater-hud">
          <button id="btnCineBack5" class="btn btn-ghost tiny" type="button">返回文字</button>
          <button id="btnCineReplay5" class="btn btn-ghost tiny" type="button">重播</button>
          <button id="btnCineCloseVideo5" class="btn btn-ghost tiny" type="button">关闭</button>
        </div>
        <div class="theater">
          <div class="theater__player">
            ${renderTheaterMedia(src, "cineVideo5")}
          </div>
        </div>
      </div>
    `;
  }

  function renderCase5CinematicGarden(caseDef, revealText) {
    const src = String(caseDef.assets?.video || "").trim();
    const subtitle = softenNarrativeCopy(String(caseDef.rewardText || "").trim());
    const reveal = String(revealText || "").trim();
    const msg = subtitle || reveal || "";

    const typewriter = state.settings?.reduceMotion
      ? `<div class="case5-caption__body">${escapeHtml(msg)}</div>`
      : `
        <div class="typewriter case5-caption__body" data-typewriter data-speed="14">
          <pre class="typewriter__src">${escapeHtml(msg)}</pre>
          <pre class="typewriter__out mono"></pre>
        </div>
      `;

    const media = src
      ? renderTheaterMedia(src, "cineVideo5")
      : `<div class="hintbox">未配置彩蛋视频：请在 <span class="mono">assets/video/case5.mp4</span> 放入文件。</div>`;

    return `
      <div class="cinema cinema--case5-garden" role="document" aria-label="星空花园">
        <div class="theater-hud">
          <button id="btnCineReplay5" class="btn btn-ghost tiny" type="button">重播</button>
          <button id="btnCineToggleText5" class="btn btn-ghost tiny" type="button" aria-pressed="false">👁 隐藏字幕</button>
          <button id="btnCineClose5" class="btn btn-ghost tiny" type="button">继续</button>
        </div>
        <div class="theater">
          <div class="theater__player">${media}</div>
          <div class="case5-caption">
            <div class="badge">灯光亮起 · 星空花园</div>
            ${reveal ? `<div class="case5-caption__small">${escapeHtml(reveal)}</div>` : ""}
            ${typewriter}
          </div>
        </div>
      </div>
    `;
  }

  function renderRewardText(caseDef) {
    if (!state.settings?.subtitles) return "";
    const text = softenNarrativeCopy(String(caseDef.rewardText || "").trim());
    if (!text) return "";
    const html = escapeHtml(text).replace(/\n/g, "<br/>");
    return `
      <div class="hintbox" style="margin-top:12px">
        <div class="badge">档案字幕</div>
        <div style="margin-top:8px;line-height:1.75">${html}</div>
      </div>
    `;
  }

  function renderCompletionFx(caseDef) {
    if (!caseDef) return "";
    if (caseDef.id === "case1") {
      const info = buildCase1Letter(caseDef);
      const memory = info?.memoryKey || caseDef.data?.memoryKey || "MEMORY-01";
      const order = info?.keyOrder || "";
      const culpritName = info?.culpritName || "—";

      const letter = [
        "【案件复盘】",
        String(info?.letter || "").trim(),
        "",
        `【获得芯片】[${memory}]`,
        culpritName ? `（检举对象：${culpritName}）` : "",
        `（路线钥匙：${order || "—"}）`,
      ]
        .filter(Boolean)
        .join("\n");

      const confetti = Array.from({ length: 18 })
        .map((_, i) => `<span class="confetti__p" style="--i:${i}"></span>`)
        .join("");

      const typewriter = state.settings?.reduceMotion
        ? `<pre class="typewriter__out mono">${escapeHtml(letter)}</pre>`
        : `
          <div class="typewriter" data-typewriter data-speed="18">
            <pre class="typewriter__src">${escapeHtml(letter)}</pre>
            <pre class="typewriter__out mono"></pre>
          </div>
        `;

      return `
        <div class="wishlight-fx">
          <div class="badge">过关特效</div>
          <div class="wishlight-stage">
            <div class="cagefx" aria-hidden="true">
              <div class="cagefx__cage"></div>
              <div class="cagefx__rose">🌹</div>
              <div class="cagefx__candle">🕯️</div>
              <div class="cagefx__glow"></div>
              <div class="confetti">${confetti}</div>
            </div>
          </div>
          ${typewriter}
        </div>
      `;
    }

    if (caseDef.id === "case2") {
      const memories = getCase2Memories(caseDef);
      const pts = memories.filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${Number(p.x).toFixed(2)} ${Number(p.y).toFixed(2)}`).join(" ");

      const stepDeg = 360 / Math.max(1, memories.length);
      const orbit = memories
        .map((m, i) => {
          const imgVar = m.img ? `--img:url("${m.img}")` : "--img:none";
          const a = (i * stepDeg).toFixed(2);
          return `<span class="mp-orbit__p" style="--a:${escapeAttr(a)}deg;${escapeAttr(imgVar)}"></span>`;
        })
        .join("");

      const pass = String(getRecoveredCase2Passphrase() || "").trim();
      const letter = [
        "【时间闭环】",
        "你把这一年的光，重新连成了两个数字：22。",
        "走过这么多路，每一站都算数。",
        "恭喜顺利抵达你的第 22 个坐标点。",
        "",
        `【获得碎片】B [FRAGMENT-22]`,
        pass ? `【第 2 关口令】${pass}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const typewriter = state.settings?.reduceMotion
        ? `<pre class="typewriter__out mono mp-letter">${escapeHtml(letter)}</pre>`
        : `
          <div class="typewriter mp-letter" data-typewriter data-speed="14">
            <pre class="typewriter__src">${escapeHtml(letter)}</pre>
            <pre class="typewriter__out mono"></pre>
          </div>
        `;

      return `
        <div class="mp-climax">
          <div class="badge">过关特效</div>
          <div class="mp-climax__stage" aria-label="时间线重构：22">
            <svg class="mp-climax__svg" viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <linearGradient id="mpLaser" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="rgba(255, 121, 198, 0.18)"></stop>
                  <stop offset="0.35" stop-color="rgba(255, 121, 198, 0.92)"></stop>
                  <stop offset="0.7" stop-color="rgba(255, 214, 240, 0.62)"></stop>
                  <stop offset="1" stop-color="rgba(255, 121, 198, 0.25)"></stop>
                </linearGradient>
              </defs>
              <path class="mp-climax__glow" d="${escapeAttr(d)}"></path>
              <path class="mp-climax__path" d="${escapeAttr(d)}"></path>
            </svg>
            <div class="mp-orbit" aria-hidden="true">${orbit}</div>
            <div class="mp-climax__meta">
              <span class="badge">获得密钥碎片</span> <span class="mono">B [FRAGMENT-22]</span>
            </div>
          </div>
          ${typewriter}
        </div>
      `;
    }

    if (caseDef.id !== "case3") return "";
    const frag = String(getRecoveredCase3Fragment() || caseDef.solution?.fragment || caseDef.solution?.letters || "WISH").trim() || "WISH";
    const num = String(getRecoveredCase3Number() || caseDef.solution?.caseNumber || "").trim();
    const evidences = getCase3AlchemyEvidences(caseDef);
    const order = String(caseDef.solution?.letters || "WISH")
      .trim()
      .split("")
      .filter(Boolean);
    const idx = (l) => {
      const i = order.indexOf(l);
      return i === -1 ? 999 : i;
    };
    const map = evidences
      .slice()
      .sort((a, b) => idx(a.letter) - idx(b.letter) || a.letter.localeCompare(b.letter))
      .map((e) => {
        const cold = e.coldWord || e.letter;
        const warm = e.warmWord || e.letter;
        return `<div class="mono">${escapeHtml(cold)} → ${escapeHtml(warm)}</div>`;
      })
      .join("");
    return `
      <div class="hintbox" style="margin-top:12px">
        <div class="badge">炼金术映射</div>
        <div style="margin-top:8px;line-height:1.85">${map || `<span class="mono">Worry → Wisdom</span>`}</div>
        <div class="row" style="margin-top:10px;gap:8px;justify-content:flex-start">
          <span class="badge">碎片</span> <span class="mono">C [${escapeHtml(frag)}]</span>
          ${num ? `<span class="badge" style="margin-left:8px">案件编号</span> <span class="mono">${escapeHtml(num)}</span>` : ""}
        </div>
      </div>
    `;
  }

  function getCaseInterlude(caseDef) {
    const it = caseDef?.assets?.interlude;
    if (!it || typeof it !== "object") return null;
    const src = String(it.src || "").trim();
    if (!src) return null;

    const typeRaw = String(it.type || "image")
      .trim()
      .toLowerCase();
    const type = typeRaw === "video" ? "video" : "image";
    const title = softenNarrativeCopy(String(it.title || "章节过场").trim()) || "章节过场";
    const rawText = softenNarrativeCopy(String(it.text || "").trim());
    const text = /[A-Za-z]{3,}/.test(rawText) && !/[\u4e00-\u9fff]/.test(rawText) ? "" : rawText;
    const poster = String(it.poster || "").trim();
    const fxRaw = String(it.fx || "")
      .trim()
      .toLowerCase();
    const fx = ["scan", "holo", "uv", "sparkle"].includes(fxRaw) ? fxRaw : "";
    return { type, src, title, text, poster, fx };
  }

  function renderCaseInterlude(caseDef, opts = {}) {
    const it = getCaseInterlude(caseDef);
    if (!it) return "";

    const compact = !!opts.compact;
    const variant = String(opts.variant || "")
      .trim()
      .toLowerCase();

    const classes = ["ai-interlude"];
    if (compact) classes.push("ai-interlude--compact");
    if (variant === "paper") classes.push("ai-interlude--paper");

    const rng =
      typeof makeCase2Rng === "function"
        ? makeCase2Rng(`interlude:${String(caseDef?.id || "")}:${it.src}`)
        : Math.random;

    const ox = (25 + rng() * 50).toFixed(1);
    const oy = (25 + rng() * 50).toFixed(1);
    const fromS = (1.01 + rng() * 0.03).toFixed(3);
    const toS = (1.06 + rng() * 0.05).toFixed(3);
    const fromX = ((rng() * 2 - 1) * 2.2).toFixed(2);
    const toX = ((rng() * 2 - 1) * 2.2).toFixed(2);
    const fromY = ((rng() * 2 - 1) * 1.8).toFixed(2);
    const toY = ((rng() * 2 - 1) * 1.8).toFixed(2);
    const dur = (10.5 + rng() * 4.8).toFixed(2);

    const style = [
      `--kb-ox:${ox}%`,
      `--kb-oy:${oy}%`,
      `--kb-from-s:${fromS}`,
      `--kb-to-s:${toS}`,
      `--kb-from-x:${fromX}%`,
      `--kb-to-x:${toX}%`,
      `--kb-from-y:${fromY}%`,
      `--kb-to-y:${toY}%`,
      `--kb-dur:${dur}s`,
    ].join(";");

    const head = compact
      ? ""
      : `
        <div class="ai-interlude__head">
          <div class="ai-interlude__title">${escapeHtml(it.title)}</div>
        </div>
      `;

    const tail = compact ? "" : it.text ? `<div class="ai-interlude__text">${escapeHtml(it.text)}</div>` : "";

    const overlay = "";

    const posterAttr = it.poster ? ` poster="${escapeAttr(it.poster)}"` : "";
    const media =
      it.type === "video"
        ? `<video class="ai-interlude__media" src="${escapeAttr(it.src)}"${posterAttr} muted autoplay loop playsinline preload="metadata"></video>`
        : `<img class="ai-interlude__media" src="${escapeAttr(it.src)}" alt="${escapeAttr(
            it.title || "章节过场",
          )}" loading="lazy" decoding="async">`;

    const fxAttr = it.fx ? ` data-fx="${escapeAttr(it.fx)}"` : "";
    return `
      <div class="${escapeAttr(classes.join(" "))}" aria-label="${escapeAttr(it.title || "章节过场")}">
        ${head}
        <div class="ai-interlude__frame vhs"${fxAttr} style="${escapeAttr(style)}">
          <div class="ai-interlude__kb">
            ${media}
          </div>
          <div class="ai-interlude__fx" aria-hidden="true"></div>
          ${overlay}
        </div>
        ${tail}
      </div>
    `;
  }

  function renderVideo(caseDef) {
    const src = caseDef.assets?.video;
    if (!src) return "";
    return `
      <div style="margin-top:12px">
        <div class="badge">过关彩蛋（可选）</div>
        <div class="vhs">
          <video class="video" src="${escapeAttr(src)}" controls playsinline preload="metadata"></video>
        </div>
      </div>
    `;
  }

  function preloadNextCaseAssets(nextOrder) {
    const next = (CONFIG.cases || []).find((c) => c.order === nextOrder);
    if (!next) return;
    if (next.assets?.bgm) audio.preload(next.assets.bgm);
    if (next.assets?.video) preloadVideo(next.assets.video);
  }

  function preloadVideo(src, mode = "metadata") {
    try {
      const s = String(src || "").trim();
      if (!s) return;
      const preloadMode = mode === "auto" ? "auto" : "metadata";
      const isLikelyIframe = /^https?:\/\//i.test(s) && !/\.(mp4|webm|ogg)(\?|#|$)/i.test(s);
      if (isLikelyIframe) return;

      const v = document.createElement("video");
      v.preload = preloadMode;
      v.muted = true;
      v.playsInline = true;
      v.src = s;
      // eslint-disable-next-line no-unused-expressions
      v.load?.();
    } catch {
      // ignore
    }
  }

  function getRankTitle(points) {
    const p = Number(points) || 0;
    if (p >= 90) return "S：传奇侦探（秦明级法医）";
    if (p >= 60) return "A：主线侦探（见习唐探）";
    return "B：温柔破案者（不靠蛮力）";
  }

  function getGalleryImages() {
    const nick = CONFIG.people?.recipientNickname || CONFIG.people?.recipientName || "你";
    const blessings = Array.isArray(CONFIG.final?.blessings) ? CONFIG.final.blessings.filter(Boolean) : [];

    const normalizeOne = (p, i) => {
      if (!p) return null;
      if (typeof p === "string") {
        const src = String(p || "").trim();
        if (!src) return null;
        const subtitle = blessings.length ? String(blessings[i % blessings.length] || "").trim() : "";
        return {
          src,
          alt: `${nick} 的照片 ${String(i + 1).padStart(2, "0")}`,
          caption: "",
          subtitle,
        };
      }
      if (typeof p !== "object") return null;
      const src = String(p.src || p.img || p.url || "").trim();
      if (!src) return null;
      const alt = String(p.alt || p.title || "").trim() || `${nick} 的照片 ${String(i + 1).padStart(2, "0")}`;
      const caption = String(p.caption || p.note || p.text || "").trim();
      const subtitle = caption || (blessings.length ? String(blessings[i % blessings.length] || "").trim() : "");
      return { src, alt, caption, subtitle };
    };

    const explicit = CONFIG.final?.gallery || CONFIG.final?.galleryImages;
    if (Array.isArray(explicit) && explicit.length) return explicit.map(normalizeOne).filter(Boolean);

    const count = Math.max(0, Math.floor(Number(CONFIG.final?.photoCount) || 0));
    const pattern = String(CONFIG.final?.photoPattern || "").trim();
    if (count && pattern) {
      const pad2 = (n) => String(n).padStart(2, "0");
      return Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const NN = pad2(n);
        const src = pattern.replaceAll("{NN}", NN).replaceAll("{N}", String(n));
        return normalizeOne({ src }, i);
      }).filter(Boolean);
    }

    // Fallback: reuse Case 2 photos (so the final exhibition is viewable even before configuring final.gallery).
    const case2 = (CONFIG.cases || []).find((c) => c.id === "case2");
    const memories = Array.isArray(case2?.data?.memories) ? case2.data.memories : [];
    if (memories.length) {
      return memories
        .map((m, i) => normalizeOne({ src: m?.img, caption: "" }, i))
        .filter(Boolean);
    }

    return [];
  }

  function renderCarousel() {
    const imgs = getGalleryImages();
    const count = imgs.length;
    const allBlessings = Array.isArray(CONFIG.final?.blessings) ? CONFIG.final.blessings.filter(Boolean) : [];
    const rng = makeCase2Rng(
      `finalWall:${String(CONFIG.people?.recipientName || CONFIG.people?.recipientNickname || "")}|${count}|${allBlessings.length}`,
    );

    const stickyTarget = count ? Math.max(0, Math.min(30, Math.round(count * 0.28))) : 0;
    const stickyCount = Math.min(allBlessings.length, stickyTarget);
    const wallBlessings = (() => {
      if (!stickyCount) return [];
      const arr = allBlessings.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr.slice(0, stickyCount);
    })();

    const buildSticky = (text, i) => {
      const t = String(text || "").trim();
      if (!t) return "";
      const hue = (18 + rng() * 320).toFixed(1);
      const tilt = ((rng() * 2 - 1) * 3.2).toFixed(2);
      const pick = rng();
      const pin = pick < 0.34 ? "pin" : pick < 0.72 ? "tape" : "clip";
      return `
        <div class="sticky" role="note" aria-label="祝福便签" style="--h:${escapeAttr(hue)}deg;--spin:${escapeAttr(
          tilt,
        )}deg" data-sticky="${escapeAttr(pin)}">
          <div class="sticky__head" aria-hidden="true"></div>
          <div class="sticky__text">${escapeHtml(t)}</div>
        </div>
      `;
    };

    const mergeWithSticky = (photoHtmls) => {
      if (!wallBlessings.length) return photoHtmls;
      const out = photoHtmls.map((h) => ({ kind: "photo", html: h }));

      // Insert sticky notes in random positions (stable by seed).
      const used = new Set();
      wallBlessings.forEach((b, i) => {
        let pos = Math.floor(rng() * (out.length + 1));
        while (used.has(pos) && pos < out.length) pos += 1;
        used.add(pos);
        out.splice(pos, 0, { kind: "sticky", html: buildSticky(b, i) });
      });
      return out.map((x) => x.html);
    };

    const photoCards = count
      ? imgs
          .map((p, i) => {
            const spin = (((i * 37) % 9) - 4) * 0.35;
            const cap = String(p.caption || "").trim();
            const idxTag = `#${String(i + 1).padStart(2, "0")}`;
            return `
              <button class="polaroid" type="button" data-idx="${escapeAttr(String(i))}" style="--spin:${escapeAttr(spin.toFixed(2))}deg">
                <div class="polaroid__imgWrap">
                  <img class="polaroid__img" src="${escapeAttr(p.src)}" alt="${escapeAttr(p.alt || "")}" loading="lazy" decoding="async" />
                </div>
                <div class="polaroid__caption">${cap ? escapeHtml(cap) : `<span class="mono" style="opacity:.45">${escapeHtml(idxTag)}</span>`}</div>
              </button>
            `;
          })
          .map((h) => h)
      : `
        <div class="exhibit__empty">
          <div class="badge locked">未配置照片</div>
          <div style="margin-top:10px;color:var(--muted);line-height:1.75">
            把照片放进 <span class="mono">assets/</span>，然后在 <span class="mono">config.js</span> 的 <span class="mono">final.gallery</span> 里填路径即可。
          </div>
        </div>
      `;

    const wallHtml = Array.isArray(photoCards) ? mergeWithSticky(photoCards).join("") : photoCards;

    return `
      <div class="exhibit" id="exhibit">
        <div class="exhibit__header">
          <div>
            <div class="badge">零点手账画廊</div>
            <div class="exhibit__sub">先在「星光记忆放映厅」看完，再在这里慢慢翻。便签会夹在照片之间。</div>
          </div>
          <div class="exhibit__actions">
            <button id="btnReelReplay" class="btn btn-ghost" type="button" ${count ? "" : "disabled"}>重放放映</button>
          </div>
        </div>
        <div class="exhibit__meta">
          <span class="badge">照片</span> <span class="mono">${escapeHtml(String(count))}</span>
          <span class="badge" style="margin-left:8px">便签</span> <span class="mono">${escapeHtml(String(wallBlessings.length))}</span>
          <span class="badge" style="margin-left:8px">提示</span> <span style="color:var(--muted)">悬停有倾斜光影，点击可放大左右翻页</span>
        </div>
        <div class="masonry" id="finalWall">${wallHtml}</div>
      </div>
    `;
  }

  function bindCarousel() {
    const imgs = getGalleryImages();
    const wall = document.getElementById("finalWall");
    const btnReplay = document.getElementById("btnReelReplay");

    const clampIdx = (n) => {
      const len = imgs.length || 1;
      return ((n % len) + len) % len;
    };

    const playCameraShutter = () => {
      if (!state.audio?.unlocked || state.audio?.muted) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = window.__finalPhotoSfxCtx || (window.__finalPhotoSfxCtx = new Ctx());
        ctx.resume?.().catch(() => {
          // ignore
        });
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        gain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.09);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.13);
      } catch {
        // ignore
      }
    };

    const openLightbox = (startIndex) => {
      if (!overlayEl) return;
      if (!imgs.length) return;
      let idx = clampIdx(Number(startIndex) || 0);

      let lastSwitchAt = 0;
      const onEsc = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          show(idx - 1, -1);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          show(idx + 1, 1);
        }
      };

      let touchX = 0;
      let touchY = 0;
      const onTouchStart = (e) => {
        const t = e.changedTouches?.[0];
        if (!t) return;
        touchX = t.clientX;
        touchY = t.clientY;
      };
      const onTouchEnd = (e) => {
        const t = e.changedTouches?.[0];
        if (!t) return;
        const dx = t.clientX - touchX;
        const dy = t.clientY - touchY;
        if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        const now = Date.now();
        if (now - lastSwitchAt < 420) return;
        lastSwitchAt = now;
        if (dx > 0) show(idx - 1, -1);
        else show(idx + 1, 1);
      };

      const close = () => {
        window.removeEventListener("keydown", onEsc, true);
        overlayEl.removeEventListener("touchstart", onTouchStart, true);
        overlayEl.removeEventListener("touchend", onTouchEnd, true);
        closeOverlay();
      };

      const show = (n, dir = 0) => {
        idx = clampIdx(n);
        const cur = imgs[idx];
        const imgEl = document.getElementById("finalLbImg");
        const capEl = document.getElementById("finalLbCaption");
        const idxEl = document.getElementById("finalLbIdx");
        if (imgEl) {
          imgEl.classList.remove("is-in");
          imgEl.style.setProperty("--lb-dir", String(dir || 0));
          // eslint-disable-next-line no-unused-expressions
          imgEl.offsetWidth;
          imgEl.src = cur.src;
          imgEl.alt = cur.alt || "";
          imgEl.classList.add("is-in");
        }
        if (capEl) capEl.textContent = String(cur.caption || cur.subtitle || "").trim();
        if (idxEl) idxEl.textContent = `${idx + 1} / ${imgs.length}`;
      };

      playCameraShutter();
      audio.setDuck?.(0.12);

      lockScrollForOverlay();
      overlayEl.classList.remove("hidden");
      overlayEl.setAttribute("aria-hidden", "false");
      overlayEl.innerHTML = `
        <div class="cinema cinema--lightbox" role="dialog" aria-label="照片放大查看">
          <button class="btn btn-ghost tiny cinema__skip" type="button" id="finalLbClose">关闭</button>
          <div class="lightbox">
            <div class="lightbox__frame">
              <img id="finalLbImg" class="lightbox__img is-in" src="" alt="" />
              <div class="lightbox__vignette" aria-hidden="true"></div>
            </div>
            <div class="lightbox__hud">
              <div id="finalLbIdx" class="badge">0 / 0</div>
              <div id="finalLbCaption" class="lightbox__caption"></div>
              <div class="lightbox__controls">
                <button id="finalLbPrev" class="btn btn-ghost" type="button">上一张</button>
                <button id="finalLbNext" class="btn btn-ghost" type="button">下一张</button>
              </div>
            </div>
          </div>
        </div>
      `;

      overlayEl.addEventListener(
        "click",
        (e) => {
          if (e.target === overlayEl) close();
        },
        { once: true },
      );

      document.getElementById("finalLbClose")?.addEventListener("click", close);
      document.getElementById("finalLbPrev")?.addEventListener("click", () => show(idx - 1, -1));
      document.getElementById("finalLbNext")?.addEventListener("click", () => show(idx + 1, 1));
      overlayEl.addEventListener("touchstart", onTouchStart, true);
      overlayEl.addEventListener("touchend", onTouchEnd, true);
      window.addEventListener("keydown", onEsc, true);

      show(idx, 0);
    };

    if (wall) {
      wall.querySelectorAll(".polaroid").forEach((card) => {
        const imgEl = card.querySelector(".polaroid__img");
        imgEl?.addEventListener("error", () => card.classList.add("is-broken"));

        const resetTilt = () => {
          card.style.setProperty("--rx", "0deg");
          card.style.setProperty("--ry", "0deg");
          card.style.setProperty("--shine-x", "50%");
          card.style.setProperty("--shine-y", "30%");
        };
        resetTilt();

        card.addEventListener("pointermove", (e) => {
          if (state.settings?.reduceMotion) return;
          const rect = card.getBoundingClientRect();
          const px = (e.clientX - rect.left) / Math.max(1, rect.width);
          const py = (e.clientY - rect.top) / Math.max(1, rect.height);
          const x = Math.max(-0.5, Math.min(0.5, px - 0.5));
          const y = Math.max(-0.5, Math.min(0.5, py - 0.5));
          card.style.setProperty("--rx", `${(-y * 7.5).toFixed(2)}deg`);
          card.style.setProperty("--ry", `${(x * 9.5).toFixed(2)}deg`);
          card.style.setProperty("--shine-x", `${(px * 100).toFixed(1)}%`);
          card.style.setProperty("--shine-y", `${(py * 100).toFixed(1)}%`);
        });
        card.addEventListener("pointerleave", resetTilt);

        card.addEventListener("click", () => {
          const idx = Number(card.getAttribute("data-idx") || "0");
          openLightbox(idx);
        });
      });
    }

    const openReel = (opts = {}) => {
      if (!overlayEl) return;
      if (!imgs.length) return;

      const cfg = CONFIG.final?.reel || {};
      const list = imgs.map((x) => x);
      if (!list.length) return;
      const perMsRaw = Number(cfg.msPerPhoto);
      const targetTotalRaw = Number(cfg.targetTotalMs);
      const targetTotal = Number.isFinite(targetTotalRaw) ? Math.max(20000, Math.min(180000, Math.floor(targetTotalRaw))) : 52000;
      const perMs = Number.isFinite(perMsRaw)
        ? Math.max(2600, Math.min(9000, Math.floor(perMsRaw)))
        : Math.max(2600, Math.min(5200, Math.floor(targetTotal / Math.max(1, list.length))));

      const blessings = Array.isArray(CONFIG.final?.blessings) ? CONFIG.final.blessings.filter(Boolean) : [];
      const reelRand = makeCase2Rng(
        `finalReel:${String(CONFIG.people?.recipientName || CONFIG.people?.recipientNickname || "")}|${list.length}|${blessings.length}`,
      );

      // Place each blessing at most once, roughly evenly across the reel.
      // If a photo has its own caption, it always wins (and we avoid placing a blessing on it).
      const blessingByIndex = new Map();
      if (blessings.length && list.length) {
        const count = Math.min(blessings.length, list.length);
        const isCaptioned = (idx) => Boolean(String(list[idx]?.caption || "").trim());
        let last = -1;
        for (let i = 0; i < count; i++) {
          const base = Math.floor(((i + 1) * list.length) / (count + 1));
          const jitter = Math.floor(reelRand() * 3) - 1; // -1..1 (stable by seed)
          let pos = Math.max(0, Math.min(list.length - 1, base + jitter));
          pos = Math.max(pos, last + 1);
          while (pos < list.length && (blessingByIndex.has(pos) || isCaptioned(pos))) pos += 1;
          if (pos >= list.length) break;
          blessingByIndex.set(pos, String(blessings[i] || "").trim());
          last = pos;
        }
      }

      const reelTextPlan = list.map((p, i) => {
        const cap = String(p?.caption || "").trim();
        if (cap) return { kind: "caption", text: cap };
        const b = blessingByIndex.get(i);
        if (b) return { kind: "blessing", text: b };
        return { kind: "none", text: "" };
      });

      const preloadCache = new Map();
      const preloadOrder = [];
      const preloadImage = (src) => {
        const s = String(src || "").trim();
        if (!s) return;
        if (preloadCache.has(s)) return;
        try {
          const im = new Image();
          im.decoding = "async";
          im.src = s;
          preloadCache.set(s, im);
          preloadOrder.push(s);
          if (preloadOrder.length > 18) {
            const old = preloadOrder.shift();
            if (old) preloadCache.delete(old);
          }
        } catch {
          // ignore
        }
      };
      const preloadAround = (index) => {
        const i = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
        preloadImage(list[i]?.src);
        preloadImage(list[i + 1]?.src);
        preloadImage(list[i + 2]?.src);
      };

      const cleanup = () => {
        document.body.classList.remove("reel-lock");
        window.removeEventListener("keydown", onKey, true);
        if (activeInterval) window.clearInterval(activeInterval);
        activeInterval = null;
        try {
          preloadCache.clear();
          preloadOrder.length = 0;
        } catch {
          // ignore
        }
      };

      const close = (scrollToWall) => {
        cleanup();
        closeOverlay();
        if (scrollToWall) {
          window.requestAnimationFrame(() => {
            document.getElementById("exhibit")?.scrollIntoView({ block: "start", behavior: "smooth" });
          });
        }
      };

      const motions = ["zoom-in", "zoom-out", "pan-left", "pan-right", "breathe"];
      let lastMotion = "";
      const pickMotion = () => {
        if (state.settings?.reduceMotion) return "still";
        for (let tries = 0; tries < 6; tries++) {
          const m = motions[Math.floor(Math.random() * motions.length)];
          if (m !== lastMotion) {
            lastMotion = m;
            return m;
          }
        }
        return motions[0];
      };

      const setMotionVars = (layerEl, motion) => {
        if (!layerEl) return;
        layerEl.setAttribute("data-motion", motion);
        const r = () => Math.random();
        const jitterX = (r() * 2 - 1) * 14;
        const jitterY = (r() * 2 - 1) * 10;

        let fromS = 1.14;
        let toS = 1.26;
        let fromX = jitterX;
        let toX = jitterX * 1.4;
        let fromY = jitterY;
        let toY = jitterY * 1.4;

        if (motion === "zoom-in") {
          fromS = 1.08 + r() * 0.06;
          toS = fromS + 0.16 + r() * 0.08;
          fromX = jitterX * 0.9;
          toX = jitterX * 1.6;
          fromY = jitterY * 0.9;
          toY = jitterY * 1.6;
        } else if (motion === "zoom-out") {
          toS = 1.10 + r() * 0.06;
          fromS = toS + 0.18 + r() * 0.1;
          fromX = jitterX * 1.6;
          toX = jitterX * 0.9;
          fromY = jitterY * 1.6;
          toY = jitterY * 0.9;
        } else if (motion === "pan-left") {
          const s = 1.22 + r() * 0.08;
          fromS = s;
          toS = s + 0.06;
          fromX = 26 + r() * 18;
          toX = -26 - r() * 18;
          fromY = jitterY * 0.6;
          toY = jitterY * 0.6;
        } else if (motion === "pan-right") {
          const s = 1.22 + r() * 0.08;
          fromS = s;
          toS = s + 0.06;
          fromX = -26 - r() * 18;
          toX = 26 + r() * 18;
          fromY = jitterY * 0.6;
          toY = jitterY * 0.6;
        } else if (motion === "breathe") {
          fromS = 1.12 + r() * 0.05;
          toS = fromS + 0.08 + r() * 0.06;
          fromX = jitterX * 0.35;
          toX = jitterX * 0.75;
          fromY = jitterY * 0.35;
          toY = jitterY * 0.75;
        } else if (motion === "still") {
          fromS = 1.18;
          toS = 1.18;
          fromX = 0;
          toX = 0;
          fromY = 0;
          toY = 0;
        }

        layerEl.style.setProperty("--rb-from-s", String(fromS.toFixed(3)));
        layerEl.style.setProperty("--rb-to-s", String(toS.toFixed(3)));
        layerEl.style.setProperty("--rb-from-x", `${fromX.toFixed(1)}px`);
        layerEl.style.setProperty("--rb-to-x", `${toX.toFixed(1)}px`);
        layerEl.style.setProperty("--rb-from-y", `${fromY.toFixed(1)}px`);
        layerEl.style.setProperty("--rb-to-y", `${toY.toFixed(1)}px`);
      };

      let idx = 0;
      let active = "A";

      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close(true);
        }
      };

      const render = () => {
        lockScrollForOverlay();
        overlayEl.classList.remove("hidden");
        overlayEl.setAttribute("aria-hidden", "false");
        overlayEl.innerHTML = `
          <div class="cinema cinema--reel" role="document" aria-label="星光记忆放映厅：自动放映">
            <div class="reel">
              <div class="reel__frame">
                <div id="reelA" class="reel__layer is-active" data-motion="still">
                  <div class="reel__bg" aria-hidden="true"></div>
                  <img class="reel__fg" alt="" />
                </div>
                <div id="reelB" class="reel__layer" data-motion="still">
                  <div class="reel__bg" aria-hidden="true"></div>
                  <img class="reel__fg" alt="" />
                </div>
                <div class="reel__grain" aria-hidden="true"></div>
                <div class="reel__vignette" aria-hidden="true"></div>
                <div class="reel__badge">
                  <span class="badge">星光记忆放映厅</span>
                  <span class="mono" id="reelIdx">1 / ${escapeHtml(String(list.length))}</span>
                </div>
                <div class="reel__caption" id="reelCaption"></div>
              </div>
            </div>
            <button id="btnReelSkip" class="btn btn-ghost cinema__skip" type="button">自由浏览照片墙</button>
          </div>
        `;
        const frame = overlayEl.querySelector(".reel__frame");
        if (frame) frame.style.setProperty("--reel-dur", `${perMs}ms`);
      };

      const setCaption = (text, kind) => {
        const el = document.getElementById("reelCaption");
        if (!el) return;
        const t = String(text || "").trim();
        const k = String(kind || "").trim();
        el.classList.remove("play");
        el.dataset.kind = k;
        if (!t) {
          el.textContent = "";
          el.classList.add("is-empty");
          return;
        }
        el.classList.remove("is-empty");
        // eslint-disable-next-line no-unused-expressions
        el.offsetWidth;
        el.textContent = t;
        el.classList.add("play");
      };

      const show = (n, immediate = false) => {
        idx = clampIdx(n);
        const cur = list[idx];
        const idxEl = document.getElementById("reelIdx");
        if (idxEl) idxEl.textContent = `${idx + 1} / ${list.length}`;

        preloadAround(idx);

        const a = document.getElementById("reelA");
        const b = document.getElementById("reelB");
        if (!a || !b) return;

        const curLayer = active === "A" ? a : b;
        const nextLayer = active === "A" ? b : a;

        const targetLayer = immediate ? curLayer : nextLayer;
        const targetBg = targetLayer.querySelector(".reel__bg");
        const targetFg = targetLayer.querySelector(".reel__fg");
        if (!targetBg || !targetFg) return;

        const cssUrl = (src) => `"${String(src || "").replace(/["\\\\]/g, "\\\\$&").replace(/\n/g, "")}"`;
        targetBg.style.backgroundImage = `url(${cssUrl(cur.src)})`;
        targetFg.src = cur.src;
        targetFg.alt = cur.alt || "";
        setMotionVars(targetLayer, pickMotion());

        if (immediate) {
          curLayer.classList.add("is-active");
          nextLayer.classList.remove("is-active");
        } else {
          nextLayer.classList.add("is-active");
          curLayer.classList.remove("is-active");
          active = active === "A" ? "B" : "A";
        }

        const plan = reelTextPlan[idx] || { kind: "none", text: "" };
        setCaption(plan.text || "", plan.kind || "none");
      };

      render();
      document.body.classList.add("reel-lock");
      window.addEventListener("keydown", onKey, true);

      const skip = () => close(true);
      document.getElementById("btnReelSkip")?.addEventListener("click", skip);

      // First slide
      preloadAround(0);
      show(0, true);

      if (activeInterval) window.clearInterval(activeInterval);
      activeInterval = window.setInterval(() => {
        const next = idx + 1;
        if (next >= list.length) {
          close(true);
          return;
        }
        show(next, false);
      }, state.settings?.reduceMotion ? Math.max(2600, Math.floor(perMs * 0.6)) : perMs);
    };

    btnReplay?.addEventListener("click", () => openReel({ manual: true }));

    // Auto-play once (first time reaching the final page)
    if (!state.settings?.reduceMotion && imgs.length && !state.fx?.finalReelShown) {
      state.fx = state.fx || {};
      state.fx.finalReelShown = true;
      persist();
      window.setTimeout(() => openReel({ auto: true }), 220);
    }
  }

  function renderBlessings() {
    const list = CONFIG.final?.blessings || [];
    const items = list.length
      ? list.map((t) => `<div class="blessing">${escapeHtml(t)}</div>`).join("")
      : `<div class="blessing" style="color:var(--muted)">未配置祝福文案。</div>`;
    return `
      <div class="blessings">
        <div class="blessings__header">祝福滚动条（可自行增删）</div>
        <div class="blessings__body">
          ${items}
        </div>
      </div>
    `;
  }

  function playDawnTransition() {
    const el = document.createElement("div");
    el.className = "dawn-overlay";
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 3200);
  }

  function renderFinal() {
    stopActiveWork();
    document.body.classList.remove("case6-immersive");
    const shouldDawn = !state.fx?.dawnShown;
    state.warmMode = true;
    state.fx = state.fx || {};
    state.fx.dawnShown = true;
    persist();
    document.body.classList.add("warm");
    audio.setSuspended?.(false);
    audio.setDuck?.(1);
    audio.setVideoDuck?.(1);
    const finalPlaylist = CONFIG.final?.bgmPlaylist;
    if (Array.isArray(finalPlaylist) && finalPlaylist.filter(Boolean).length && typeof audio.setTargetPlaylist === "function") {
      audio.setTargetPlaylist(finalPlaylist);
    } else {
      audio.setTargetTrack(CONFIG.media?.warmBgm);
    }

    const nick = CONFIG.people?.recipientNickname;
    const name = CONFIG.people?.recipientName;
    const recipient = nick && name ? `${nick}（${name}）` : nick || name || "你";
    const birthday = CONFIG.people?.birthdayText ? `（${CONFIG.people.birthdayText}）` : "";
    const title = CONFIG.final?.title || "结案";
    const rank = getRankTitle(state.points ?? 0);

    viewEl.innerHTML = `
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">${escapeHtml(title)}</h2>
          <p class="panel__subtitle">
            生日快乐，<span class="mono">${escapeHtml(recipient)}</span>${escapeHtml(birthday)}。
            你已经把“零点”找回来了。
          </p>
        </div>
        <div class="panel__body">
          <div class="hintbox">
            <div class="badge">你的称号</div>
            <div style="margin-top:8px">
              <span class="mono">${escapeHtml(rank)}</span>（声望：<span class="mono">${escapeHtml(String(state.points ?? 0))}</span>）
            </div>
          </div>

          <div class="gallery" style="margin-top:12px">
            ${renderCarousel()}
          </div>

          <div class="row" style="margin-top:12px">
            <button id="btnReplay" class="btn btn-danger" type="button">重玩（清空进度）</button>
          </div>
        </div>
      </section>
    `;

    document.getElementById("btnReplay")?.addEventListener("click", () => btnResetEl?.click());
    bindCarousel();
    if (shouldDawn) playDawnTransition();
  }
})();
