(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const root = document.documentElement;
  const theme = $("#themeSelect");
  const sound = $("#soundToggle");
  const review = $("#reviewToggle");
  const learned = $("#learnedToggle");
  const toast = $("#actionToast");
  const layer = $("#feedbackLayer");
  const comboEl = $("#comboCount");
  const xpEl = $("#sessionXp");
  const goal = $("#goalProgress");
  const goalText = $("#goalText");
  const line = $("#companionLine");
  const bubble = $("#mascotBubble");
  const achievement = $("#achievementPopover");
  const flashcard = $("#flashcard");

  const today = new Date().toISOString().slice(0, 10);
  const key = `flipwords.ui.${today}`;
  const messages = [
    "漂亮！這個字已經有印象了。",
    "保持節奏，再一張就好。",
    "你正在把陌生單字變成熟悉感。",
    "專注力上線，繼續累積！",
  ];

  let state;

  try {
    state = JSON.parse(localStorage.getItem(key) || '{"xp":0,"combo":0}');
  } catch (error) {
    state = { xp: 0, combo: 0 };
  }

  let soundOn = localStorage.getItem("flipwords.sound") !== "off";
  let audioContext = null;

  function save() {
    localStorage.setItem(key, JSON.stringify(state));
  }

  function render() {
    comboEl.textContent = state.combo;
    xpEl.textContent = state.xp;
    goal.style.width = `${Math.min((state.xp / 1000) * 100, 100)}%`;
    goalText.textContent = `${Math.min(state.xp, 1000)} / 1000`;
    sound.setAttribute("aria-pressed", String(soundOn));
    sound.firstElementChild.textContent = soundOn ? "🔊" : "🔇";
  }

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  }

  function playGentleSound(kind = "tap") {
    if (!soundOn) {
      return;
    }

    const context = getAudioContext();
    if (!context) {
      return;
    }

    const presets = {
      tap: {
        volume: 0.018,
        notes: [
          [392, 0, 0.085],
          [523.25, 0.032, 0.105],
        ],
      },
      field: {
        volume: 0.012,
        notes: [[349.23, 0, 0.075]],
      },
      select: {
        volume: 0.016,
        notes: [
          [392, 0, 0.08],
          [493.88, 0.045, 0.1],
        ],
      },
      navigate: {
        volume: 0.016,
        notes: [
          [329.63, 0, 0.075],
          [440, 0.04, 0.095],
        ],
      },
      flip: {
        volume: 0.015,
        notes: [
          [293.66, 0, 0.08],
          [440, 0.045, 0.12],
        ],
      },
      review: {
        volume: 0.019,
        notes: [
          [392, 0, 0.1],
          [523.25, 0.055, 0.13],
        ],
      },
      learned: {
        volume: 0.019,
        notes: [
          [523.25, 0, 0.105],
          [659.25, 0.055, 0.14],
        ],
      },
      toggle: {
        volume: 0.015,
        notes: [
          [349.23, 0, 0.085],
          [440, 0.045, 0.105],
        ],
      },
      achievement: {
        volume: 0.018,
        notes: [
          [523.25, 0, 0.11],
          [659.25, 0.06, 0.13],
          [783.99, 0.12, 0.16],
        ],
      },
    };

    const preset = presets[kind] || presets.tap;
    const startTime = context.currentTime + 0.006;

    preset.notes.forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startTime + delay;
      const noteEnd = noteStart + duration;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(preset.volume, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
  }

  function burst(element, type) {
    if (!element || !layer) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const icons = type === "learned" ? ["★", "✨", "✓"] : ["🔥", "!", "✦"];

    for (let index = 0; index < 10; index += 1) {
      const particle = document.createElement("span");
      particle.className = "particle";
      particle.textContent = icons[index % icons.length];
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;
      particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 180}px`);
      particle.style.setProperty("--dy", `${-35 - Math.random() * 120}px`);
      layer.append(particle);
      window.setTimeout(() => particle.remove(), 800);
    }
  }

  function show(message) {
    if (toast) {
      toast.textContent = message;
      toast.classList.add("is-visible");
      window.clearTimeout(show.toastTimer);
      show.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1600);
    }

    if (bubble) {
      bubble.textContent = message;
      bubble.classList.add("is-visible");
      window.clearTimeout(show.bubbleTimer);
      show.bubbleTimer = window.setTimeout(() => bubble.classList.remove("is-visible"), 2600);
    }
  }

  function reward(type, checked, element) {
    element.classList.remove("is-punchy");
    void element.offsetWidth;
    element.classList.add("is-punchy");

    burst(element, type);
    playGentleSound(type);

    state.combo = checked ? state.combo + 1 : Math.max(0, state.combo - 1);
    state.xp = Math.max(0, state.xp + (checked ? (type === "learned" ? 20 : 10) : -5));

    save();
    render();

    const message = checked
      ? type === "learned"
        ? "學會啦！+20 XP 🌟"
        : "已加入重點複習！+10 XP 🔥"
      : "已移回未學會牌堆";

    show(message);

    if (line) {
      line.textContent = messages[Math.floor(Math.random() * messages.length)];
    }

    if (state.combo > 0 && state.combo % 5 === 0 && achievement) {
      achievement.classList.add("is-visible");
      playGentleSound("achievement");
      window.setTimeout(() => achievement.classList.remove("is-visible"), 2600);
    }
  }

  function isHiddenOrDisabled(element) {
    return element.matches(":disabled") || element.hidden || Boolean(element.closest("[hidden]"));
  }

  function playClickForElement(element) {
    if (!element || isHiddenOrDisabled(element)) {
      return;
    }

    if (element === sound || element.closest(".status-toggle") || element.matches("select")) {
      return;
    }

    if (element.id === "flashcard") {
      playGentleSound("flip");
      return;
    }

    if (
      element.classList.contains("pile-button") ||
      element.classList.contains("word-row-main") ||
      element.classList.contains("icon-button")
    ) {
      playGentleSound("navigate");
      return;
    }

    if (element.matches("input, textarea")) {
      playGentleSound("field");
      return;
    }

    playGentleSound("tap");
  }

  theme.value = localStorage.getItem("flipwords.theme") || "sakura";
  root.dataset.theme = theme.value;

  theme.addEventListener("change", () => {
    root.dataset.theme = theme.value;
    localStorage.setItem("flipwords.theme", theme.value);
    show("場景已切換 ✨");
  });

  sound.addEventListener("click", () => {
    const nextSoundState = !soundOn;

    if (!nextSoundState) {
      playGentleSound("toggle");
    }

    soundOn = nextSoundState;
    localStorage.setItem("flipwords.sound", soundOn ? "on" : "off");
    render();

    if (soundOn) {
      playGentleSound("toggle");
    }

    show(soundOn ? "互動音效已開啟" : "互動音效已關閉");
  });

  review.addEventListener("change", () => {
    reward("review", review.checked, review.closest(".status-toggle"));
  });

  learned.addEventListener("change", () => {
    reward("learned", learned.checked, learned.closest(".status-toggle"));
  });

  flashcard.addEventListener("click", () => {
    state.xp += 1;
    save();
    render();
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const interactiveElement = target?.closest(
      "button, a[href], .flashcard, .word-row-main, .status-toggle, input, textarea, select",
    );

    playClickForElement(interactiveElement);
  });

  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement && !isHiddenOrDisabled(event.target)) {
      playGentleSound("select");
    }
  });

  render();
})();
