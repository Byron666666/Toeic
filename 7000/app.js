(() => {
  "use strict";

  const data = window.GSAT_7000_DATA;
  if (!data || !Array.isArray(data.levels)) {
    document.body.innerHTML = "<p style='padding:2rem'>單字資料載入失敗，請重新整理頁面。</p>";
    return;
  }

  const STORAGE_KEY = "flipwords:gsat-7000:progress:v1";
  const PREFS_KEY = "flipwords:gsat-7000:preferences:v1";
  const PAGE_SIZE = 90;
  const numberFormat = new Intl.NumberFormat("zh-TW");
  const levelNames = {
    1: "核心基礎",
    2: "日常進階",
    3: "中階應用",
    4: "高階常用",
    5: "進階字彙",
    6: "挑戰字彙",
  };

  const elements = {
    allWordsCount: document.querySelector("#allWordsCount"),
    levelGrid: document.querySelector("#levelGrid"),
    levelEyebrow: document.querySelector("#levelEyebrow"),
    studyHeading: document.querySelector("#studyHeading"),
    positionText: document.querySelector("#positionText"),
    positionProgress: document.querySelector("#positionProgress"),
    flashcard: document.querySelector("#flashcard"),
    cardLevel: document.querySelector("#cardLevel"),
    cardSourcePage: document.querySelector("#cardSourcePage"),
    cardWord: document.querySelector("#cardWord"),
    cardPhonetic: document.querySelector("#cardPhonetic"),
    cardPartOfSpeech: document.querySelector("#cardPartOfSpeech"),
    cardBackLevel: document.querySelector("#cardBackLevel"),
    cardMeaning: document.querySelector("#cardMeaning"),
    cardBackWord: document.querySelector("#cardBackWord"),
    previousButton: document.querySelector("#previousButton"),
    speakButton: document.querySelector("#speakButton"),
    flipButton: document.querySelector("#flipButton"),
    randomButton: document.querySelector("#randomButton"),
    nextButton: document.querySelector("#nextButton"),
    reviewButton: document.querySelector("#reviewButton"),
    learnedButton: document.querySelector("#learnedButton"),
    voiceStatus: document.querySelector("#voiceStatus"),
    learnedPercent: document.querySelector("#learnedPercent"),
    completionProgress: document.querySelector("#completionProgress"),
    newCount: document.querySelector("#newCount"),
    reviewCount: document.querySelector("#reviewCount"),
    learnedCount: document.querySelector("#learnedCount"),
    clearFiltersButton: document.querySelector("#clearFiltersButton"),
    searchInput: document.querySelector("#searchInput"),
    filterResult: document.querySelector("#filterResult"),
    resultCount: document.querySelector("#resultCount"),
    wordList: document.querySelector("#wordList"),
    loadMoreButton: document.querySelector("#loadMoreButton"),
    toast: document.querySelector("#toast"),
  };

  const readStorage = (key, fallback) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStorage = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      showToast("瀏覽器目前無法儲存進度");
    }
  };

  const savedPreferences = readStorage(PREFS_KEY, {});
  const availableLevels = new Map(data.levels.map((item) => [Number(item.level), item]));
  const firstLevel = Number(data.levels[0]?.level) || 1;
  const savedLevel = Number(savedPreferences.level);
  const progress = readStorage(STORAGE_KEY, {});

  const state = {
    level: availableLevels.has(savedLevel) ? savedLevel : firstLevel,
    currentId: null,
    currentByLevel: savedPreferences.currentByLevel || {},
    statusFilter: "all",
    query: "",
    flipped: false,
    visibleLimit: PAGE_SIZE,
    queue: [],
  };

  let toastTimer = 0;

  function currentLevelData() {
    return availableLevels.get(state.level);
  }

  function getStatus(wordId) {
    return progress[wordId] === "review" || progress[wordId] === "learned"
      ? progress[wordId]
      : "new";
  }

  function statusLabel(status) {
    return { new: "未學", review: "複習", learned: "學會" }[status] || "未學";
  }

  function normalizedQuery() {
    return state.query.trim().toLocaleLowerCase("en");
  }

  function matchesFilters(word) {
    const status = getStatus(word.id);
    if (state.statusFilter !== "all" && status !== state.statusFilter) return false;

    const query = normalizedQuery();
    if (!query) return true;
    return [word.word, word.meaning, word.phonetic, word.partOfSpeech]
      .join(" ")
      .toLocaleLowerCase("en")
      .includes(query);
  }

  function persistPreferences() {
    writeStorage(PREFS_KEY, {
      level: state.level,
      currentByLevel: state.currentByLevel,
    });
  }

  function levelCounts(levelData) {
    return levelData.words.reduce(
      (counts, word) => {
        counts[getStatus(word.id)] += 1;
        return counts;
      },
      { new: 0, review: 0, learned: 0 },
    );
  }

  function renderLevelGrid() {
    const fragment = document.createDocumentFragment();
    data.levels.forEach((levelData) => {
      const level = Number(levelData.level);
      const counts = levelCounts(levelData);
      const percentage = levelData.words.length
        ? Math.round((counts.learned / levelData.words.length) * 100)
        : 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `level-button${level === state.level ? " is-active" : ""}`;
      button.dataset.level = String(level);
      button.setAttribute("aria-pressed", String(level === state.level));
      button.innerHTML = `
        <strong>Level ${level}</strong>
        <span>${levelNames[level] || "分級字彙"} · ${numberFormat.format(levelData.words.length)} 張</span>
        <span class="mini-track" aria-hidden="true"><i style="width:${percentage}%"></i></span>
      `;
      fragment.append(button);
    });
    elements.levelGrid.replaceChildren(fragment);
  }

  function setLevel(level) {
    if (!availableLevels.has(level) || level === state.level) return;
    state.level = level;
    state.currentId = state.currentByLevel[level] || null;
    state.query = "";
    state.statusFilter = "all";
    state.visibleLimit = PAGE_SIZE;
    elements.searchInput.value = "";
    document.querySelector('input[name="statusFilter"][value="all"]').checked = true;
    persistPreferences();
    refresh({ preserveCurrent: true });
  }

  function syncQueue({ preserveCurrent = true } = {}) {
    const previousId = preserveCurrent ? state.currentId : null;
    state.queue = currentLevelData().words.filter(matchesFilters);

    if (previousId && state.queue.some((word) => word.id === previousId)) {
      state.currentId = previousId;
    } else {
      const savedId = state.currentByLevel[state.level];
      state.currentId = state.queue.some((word) => word.id === savedId)
        ? savedId
        : state.queue[0]?.id || null;
    }

    if (state.currentId) {
      state.currentByLevel[state.level] = state.currentId;
    }
    state.flipped = false;
    persistPreferences();
  }

  function currentWord() {
    return state.queue.find((word) => word.id === state.currentId) || null;
  }

  function renderHeading() {
    elements.levelEyebrow.textContent = `LEVEL ${state.level}`;
    elements.studyHeading.textContent = `${levelNames[state.level] || "分級"}單字練習`;
  }

  function renderCard() {
    const word = currentWord();
    const queueLength = state.queue.length;
    const index = word ? state.queue.findIndex((item) => item.id === word.id) : -1;
    const position = index + 1;
    const positionPercent = queueLength ? (position / queueLength) * 100 : 0;

    elements.positionText.textContent = word
      ? `${numberFormat.format(position)} / ${numberFormat.format(queueLength)}`
      : "0 / 0";
    elements.positionProgress.style.width = `${positionPercent}%`;
    elements.flashcard.classList.toggle("is-flipped", Boolean(word && state.flipped));
    elements.flashcard.disabled = !word;

    if (!word) {
      elements.cardLevel.textContent = `LEVEL ${state.level}`;
      elements.cardBackLevel.textContent = `LEVEL ${state.level}`;
      elements.cardSourcePage.textContent = "沒有符合項目";
      elements.cardWord.textContent = "找不到單字";
      elements.cardPhonetic.textContent = "";
      elements.cardPartOfSpeech.textContent = "";
      elements.cardMeaning.textContent = "請調整搜尋或學習狀態篩選";
      elements.cardBackWord.textContent = "";
      elements.reviewButton.classList.remove("is-active");
      elements.learnedButton.classList.remove("is-active");
      elements.reviewButton.setAttribute("aria-pressed", "false");
      elements.learnedButton.setAttribute("aria-pressed", "false");
      return;
    }

    const status = getStatus(word.id);
    elements.cardLevel.textContent = `LEVEL ${state.level}`;
    elements.cardBackLevel.textContent = `LEVEL ${state.level}`;
    elements.cardSourcePage.textContent = `PDF p.${word.sourcePage}`;
    elements.cardWord.textContent = word.word;
    elements.cardWord.classList.toggle("is-long", word.word.length > 26);
    elements.cardPhonetic.textContent = word.phonetic || "音標未列於原始表格";
    elements.cardPartOfSpeech.textContent = word.partOfSpeech || "詞性未標示";
    elements.cardMeaning.textContent = word.meaning;
    elements.cardMeaning.classList.toggle("is-long", word.meaning.length > 42);
    elements.cardBackWord.textContent = word.word;
    elements.reviewButton.classList.toggle("is-active", status === "review");
    elements.learnedButton.classList.toggle("is-active", status === "learned");
    elements.reviewButton.setAttribute("aria-pressed", String(status === "review"));
    elements.learnedButton.setAttribute("aria-pressed", String(status === "learned"));
    elements.flashcard.setAttribute(
      "aria-label",
      state.flipped ? `回到 ${word.word} 的英文卡面` : `查看 ${word.word} 的中文意思`,
    );
  }

  function renderStats() {
    const levelData = currentLevelData();
    const counts = levelCounts(levelData);
    const learnedPercent = levelData.words.length
      ? Math.round((counts.learned / levelData.words.length) * 100)
      : 0;
    elements.newCount.textContent = numberFormat.format(counts.new);
    elements.reviewCount.textContent = numberFormat.format(counts.review);
    elements.learnedCount.textContent = numberFormat.format(counts.learned);
    elements.learnedPercent.textContent = `${learnedPercent}%`;
    elements.completionProgress.style.width = `${learnedPercent}%`;
  }

  function renderFilterSummary() {
    const statusText = state.statusFilter === "all" ? "全部狀態" : statusLabel(state.statusFilter);
    const queryText = state.query.trim() ? `，搜尋「${state.query.trim()}」` : "";
    elements.filterResult.textContent = `${statusText}${queryText}：${numberFormat.format(state.queue.length)} 張卡片`;
    elements.resultCount.textContent = `${numberFormat.format(state.queue.length)} 個結果`;
  }

  function renderWordList() {
    const words = state.queue.slice(0, state.visibleLimit);
    const fragment = document.createDocumentFragment();

    if (!words.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "沒有符合條件的單字，試著清除篩選。";
      fragment.append(empty);
    } else {
      words.forEach((word) => {
        const status = getStatus(word.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `word-row${word.id === state.currentId ? " is-current" : ""}`;
        button.dataset.id = word.id;
        button.dataset.status = status;
        button.setAttribute("aria-label", `練習 ${word.word}，狀態：${statusLabel(status)}`);

        const dot = document.createElement("span");
        dot.className = "status-dot";
        dot.setAttribute("aria-hidden", "true");

        const copy = document.createElement("span");
        copy.className = "word-copy";
        const title = document.createElement("strong");
        title.textContent = word.word;
        const meaning = document.createElement("small");
        meaning.textContent = word.meaning;
        copy.append(title, meaning);

        const page = document.createElement("small");
        page.textContent = `p.${word.sourcePage}`;
        button.append(dot, copy, page);
        fragment.append(button);
      });
    }

    elements.wordList.replaceChildren(fragment);
    const hasMore = state.visibleLimit < state.queue.length;
    elements.loadMoreButton.hidden = !hasMore;
    if (hasMore) {
      elements.loadMoreButton.textContent = `再顯示 ${numberFormat.format(
        Math.min(PAGE_SIZE, state.queue.length - state.visibleLimit),
      )} 個`;
    }
  }

  function refresh(options = {}) {
    syncQueue(options);
    renderHeading();
    renderLevelGrid();
    renderCard();
    renderStats();
    renderFilterSummary();
    renderWordList();
  }

  function moveCard(offset) {
    if (!state.queue.length) return;
    const currentIndex = Math.max(
      0,
      state.queue.findIndex((word) => word.id === state.currentId),
    );
    const nextIndex = (currentIndex + offset + state.queue.length) % state.queue.length;
    selectWord(state.queue[nextIndex].id);
  }

  function selectWord(wordId, { scroll = false } = {}) {
    if (!state.queue.some((word) => word.id === wordId)) return;
    state.currentId = wordId;
    state.currentByLevel[state.level] = wordId;
    state.flipped = false;
    persistPreferences();
    renderCard();
    renderWordList();
    if (scroll) {
      elements.flashcard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function flipCard() {
    if (!currentWord()) return;
    state.flipped = !state.flipped;
    renderCard();
  }

  function randomCard() {
    if (!state.queue.length) return;
    if (state.queue.length === 1) {
      selectWord(state.queue[0].id);
      return;
    }
    const currentIndex = state.queue.findIndex((word) => word.id === state.currentId);
    let randomIndex = currentIndex;
    while (randomIndex === currentIndex) {
      randomIndex = Math.floor(Math.random() * state.queue.length);
    }
    selectWord(state.queue[randomIndex].id);
  }

  function setCurrentStatus(nextStatus) {
    const word = currentWord();
    if (!word) return;
    const currentStatus = getStatus(word.id);
    if (currentStatus === nextStatus) {
      delete progress[word.id];
      showToast(`${word.word} 已改回未學`);
    } else {
      progress[word.id] = nextStatus;
      showToast(nextStatus === "learned" ? `${word.word} 已標記學會` : `${word.word} 已加入重點複習`);
    }
    writeStorage(STORAGE_KEY, progress);

    const oldIndex = state.queue.findIndex((item) => item.id === word.id);
    syncQueue({ preserveCurrent: true });
    if (!state.currentId && state.queue.length) {
      state.currentId = state.queue[Math.min(oldIndex, state.queue.length - 1)].id;
    }
    renderLevelGrid();
    renderCard();
    renderStats();
    renderFilterSummary();
    renderWordList();
  }

  function speakCurrentWord() {
    const word = currentWord();
    if (!word) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      elements.voiceStatus.textContent = "這個瀏覽器不支援語音朗讀。";
      return;
    }

    const spokenWord = word.word
      .replace(/\([^)]*\)/g, " ")
      .split("/")[0]
      .replace(/\s+/g, " ")
      .trim();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenWord);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.onstart = () => {
      elements.voiceStatus.textContent = `正在朗讀：${spokenWord}`;
    };
    utterance.onend = () => {
      elements.voiceStatus.textContent = "";
    };
    utterance.onerror = () => {
      elements.voiceStatus.textContent = "暫時無法播放發音。";
    };
    window.speechSynthesis.speak(utterance);
  }

  function clearFilters() {
    state.query = "";
    state.statusFilter = "all";
    state.visibleLimit = PAGE_SIZE;
    elements.searchInput.value = "";
    document.querySelector('input[name="statusFilter"][value="all"]').checked = true;
    refresh({ preserveCurrent: true });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
  }

  elements.levelGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (button) setLevel(Number(button.dataset.level));
  });
  elements.flashcard.addEventListener("click", flipCard);
  elements.flipButton.addEventListener("click", flipCard);
  elements.previousButton.addEventListener("click", () => moveCard(-1));
  elements.nextButton.addEventListener("click", () => moveCard(1));
  elements.randomButton.addEventListener("click", randomCard);
  elements.speakButton.addEventListener("click", speakCurrentWord);
  elements.reviewButton.addEventListener("click", () => setCurrentStatus("review"));
  elements.learnedButton.addEventListener("click", () => setCurrentStatus("learned"));
  elements.clearFiltersButton.addEventListener("click", clearFilters);

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.visibleLimit = PAGE_SIZE;
    refresh({ preserveCurrent: true });
  });

  document.querySelectorAll('input[name="statusFilter"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.statusFilter = event.target.value;
      state.visibleLimit = PAGE_SIZE;
      refresh({ preserveCurrent: true });
    });
  });

  elements.wordList.addEventListener("click", (event) => {
    const row = event.target.closest("button[data-id]");
    if (row) selectWord(row.dataset.id, { scroll: true });
  });

  elements.loadMoreButton.addEventListener("click", () => {
    state.visibleLimit += PAGE_SIZE;
    renderWordList();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select, button")) return;
    if (event.code === "Space") {
      event.preventDefault();
      flipCard();
    } else if (event.key === "ArrowLeft") {
      moveCard(-1);
    } else if (event.key === "ArrowRight") {
      moveCard(1);
    }
  });

  const allWords = data.levels.reduce((sum, level) => sum + level.words.length, 0);
  elements.allWordsCount.textContent = numberFormat.format(allWords);
  state.currentId = state.currentByLevel[state.level] || null;
  refresh({ preserveCurrent: true });
})();
