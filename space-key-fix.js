(() => {
  "use strict";

  const flashcard = document.querySelector("#flashcard");

  if (!flashcard) {
    return;
  }

  function isTextEntryTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return true;
    }

    if (target instanceof HTMLInputElement) {
      return ![
        "checkbox",
        "radio",
        "button",
        "submit",
        "reset",
        "file",
        "color",
        "range",
        "hidden",
      ].includes(target.type);
    }

    return target.isContentEditable;
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== " " || isTextEntryTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!event.repeat) {
        flashcard.click();
      }
    },
    true,
  );
})();

(() => {
  "use strict";

  const statusGroup = document.querySelector(".status-toggles");
  const reviewToggle = document.querySelector("#reviewToggle");
  const learnedToggle = document.querySelector("#learnedToggle");
  const cardWord = document.querySelector("#cardWord");
  const toast = document.querySelector("#actionToast");

  if (!statusGroup || !reviewToggle || !learnedToggle || document.querySelector("#unlearnedToggle")) {
    return;
  }

  const unlearnedLabel = document.createElement("label");
  unlearnedLabel.className = "status-toggle unlearned-toggle";
  unlearnedLabel.dataset.feedback = "unlearned";
  unlearnedLabel.innerHTML = `
    <input id="unlearnedToggle" type="checkbox" />
    <span class="toggle-icon" aria-hidden="true">📘</span>
    <span class="toggle-copy"><strong>未學會</strong></span>
    <span class="toggle-check" aria-hidden="true">✓</span>
  `;
  statusGroup.prepend(unlearnedLabel);

  const unlearnedToggle = unlearnedLabel.querySelector("#unlearnedToggle");
  let audioContext = null;
  let toastTimer = 0;

  function syncUnlearnedStatus() {
    const disabled = reviewToggle.disabled || learnedToggle.disabled;
    unlearnedToggle.disabled = disabled;
    unlearnedToggle.checked = !disabled && !reviewToggle.checked && !learnedToggle.checked;
  }

  function playUnlearnedSound() {
    if (localStorage.getItem("flipwords.sound") === "off") {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const startTime = audioContext.currentTime + 0.006;
    [329.63, 392].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = startTime + index * 0.045;
      const noteEnd = noteStart + 0.11;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.015, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
  }

  function showUnlearnedMessage() {
    if (!toast) {
      return;
    }

    toast.textContent = "已移回未學會牌堆";
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1600);
  }

  unlearnedToggle.addEventListener("change", () => {
    if (unlearnedToggle.disabled) {
      return;
    }

    const alreadyUnlearned = !reviewToggle.checked && !learnedToggle.checked;
    unlearnedToggle.checked = true;

    if (!alreadyUnlearned && typeof updateCardState === "function") {
      updateCardState("unlearned");
      showUnlearnedMessage();
    }

    playUnlearnedSound();
    window.requestAnimationFrame(syncUnlearnedStatus);
  });

  reviewToggle.addEventListener("change", () => window.requestAnimationFrame(syncUnlearnedStatus));
  learnedToggle.addEventListener("change", () => window.requestAnimationFrame(syncUnlearnedStatus));

  if (cardWord) {
    new MutationObserver(syncUnlearnedStatus).observe(cardWord, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  document.addEventListener("click", () => window.requestAnimationFrame(syncUnlearnedStatus));
  document.addEventListener("keydown", (event) => {
    if ([" ", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      window.requestAnimationFrame(syncUnlearnedStatus);
    }
  });

  syncUnlearnedStatus();
})();