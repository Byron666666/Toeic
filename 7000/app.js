(() => {
  "use strict";

  const data = window.GSAT_7000_DATA;
  if (!data || !Array.isArray(data.levels) || !data.levels.length) {
    document.body.innerHTML = "<p style='padding:2rem'>單字資料載入失敗，請重新整理頁面。</p>";
    return;
  }

  const STORAGE_KEY = "flipwords:gsat-7000:progress:v1";
  const PREFS_KEY = "flipwords:gsat-7000:preferences:v1";
  const numberFormat = new Intl.NumberFormat("zh-TW");
  const enrichment = window.GSAT_7000_ENRICHMENT?.entries || {};
  const levelNames = {
    1: "核心基礎", 2: "日常進階", 3: "中階應用",
    4: "高階常用", 5: "進階字彙", 6: "挑戰字彙",
  };
  const pileNames = { new: "未學會牌堆", review: "重點複習牌堆", learned: "已學會牌堆" };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    levelGrid: $("#levelGrid"), levelSelect: $("#levelSelect"), levelEyebrow: $("#levelEyebrow"),
    studyTitle: $("#studyTitle"), levelTotal: $("#levelTotal"), libraryTitle: $("#libraryTitle"),
    unlearnedPileButton: $("#unlearnedPileButton"), reviewPileButton: $("#reviewPileButton"),
    learnedPileButton: $("#learnedPileButton"), unlearnedPileCount: $("#unlearnedPileCount"),
    reviewPileCount: $("#reviewPileCount"), learnedPileCount: $("#learnedPileCount"),
    activePileLabel: $("#activePileLabel"), visibleCount: $("#visibleCount"),
    positionText: $("#positionText"), progressFill: $("#progressFill"), flashcard: $("#flashcard"),
    cardTag: $("#cardTag"), cardBackTag: $("#cardBackTag"), cardWord: $("#cardWord"),
    cardPhonetic: $("#cardPhonetic"), cardPartOfSpeech: $("#cardPartOfSpeech"),
    cardMeaning: $("#cardMeaning"), cardSource: $("#cardSource"),
    cardEnrichment: $("#cardEnrichment"), cardBack: $("#cardBack"),
    pronounceButton: $("#pronounceButton"), voiceStatus: $("#voiceStatus"), flipButton: $("#flipButton"),
    previousButton: $("#previousButton"), nextButton: $("#nextButton"), shuffleButton: $("#shuffleButton"),
    reviewToggle: $("#reviewToggle"), learnedToggle: $("#learnedToggle"),
    searchInput: $("#searchInput"), cardList: $("#cardList"),
  };

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new window.CustomEvent("flipwords:local-change", {
          detail: { scope: "gsat-7000", key },
        }));
      }
    } catch {
      elements.voiceStatus.textContent = "瀏覽器目前無法儲存進度。";
    }
  }

  const levels = new Map(data.levels.map((item) => [Number(item.level), item]));
  const preferences = readStorage(PREFS_KEY, {});
  const progress = readStorage(STORAGE_KEY, {});
  const savedPositions = preferences.currentByLevel;
  const savedLevel = Number(preferences.level);
  const firstLevel = Number(data.levels[0].level);
  const state = {
    level: levels.has(savedLevel) ? savedLevel : firstLevel,
    statusFilter: ["new", "review", "learned"].includes(preferences.pile) ? preferences.pile : "new",
    query: "",
    currentId: null,
    currentByLevel: savedPositions && typeof savedPositions === "object" && !Array.isArray(savedPositions)
      ? savedPositions : {},
    flipped: false,
    queue: [],
    lastRandomId: null,
  };

  function currentLevelData() {
    return levels.get(state.level);
  }

  function getStatus(wordId) {
    return progress[wordId] === "review" || progress[wordId] === "learned" ? progress[wordId] : "new";
  }

  function matchesFilters(word) {
    if (getStatus(word.id) !== state.statusFilter) return false;
    const query = state.query.trim().toLocaleLowerCase("en");
    if (!query) return true;
    return [word.word, word.meaning, word.phonetic, word.partOfSpeech,
      ...(enrichment[word.id] || []).flat()]
      .join(" ").toLocaleLowerCase("en").includes(query);
  }

  function text(className, value, lang) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = value;
    if (lang) span.setAttribute("lang", lang);
    return span;
  }

  function exampleWordVariants(word) {
    const variants = new Set();
    (word?.word || "").split("/").map((part) => part.trim()).filter(Boolean).forEach((part) => {
      variants.add(part);
      const optionalEnding = part.match(/^(.*)\(([^)]+)\)$/);
      if (optionalEnding) {
        variants.add(optionalEnding[1]);
        variants.add(`${optionalEnding[1]}${optionalEnding[2]}`);
      }
    });
    return [...variants].filter((variant) => /[A-Za-z]/.test(variant))
      .sort((left, right) => right.length - left.length);
  }

  function renderExample(example, word) {
    const span = text("enrichment-example", "", "en");
    const variants = exampleWordVariants(word).map((variant) =>
      variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!variants.length) {
      span.textContent = example;
      return span;
    }
    const matcher = new RegExp(`\\b(?:${variants.join("|")})\\b`, "gi");
    let cursor = 0;
    let found = false;
    for (const match of example.matchAll(matcher)) {
      found = true;
      if (match.index > cursor) span.append(text("", example.slice(cursor, match.index)));
      span.append(text("example-word", match[0]));
      cursor = match.index + match[0].length;
    }
    if (!found) {
      span.textContent = example;
      return span;
    }
    if (cursor < example.length) span.append(text("", example.slice(cursor)));
    return span;
  }

  function renderEnrichment(word) {
    const fragment = document.createDocumentFragment();
    const senses = word ? enrichment[word.id] : null;
    if (word && !senses?.length) {
      fragment.append(text("enrichment-note", "用法資料暫時無法載入，請重新整理頁面。"));
    }
    (senses || []).forEach(([sense, synonyms, example, translation, note]) => {
      const item = document.createElement("span");
      item.className = "enrichment-sense";
      item.append(text("enrichment-sense-label", sense));
      item.append(text("enrichment-synonyms", `同義／近義詞：${synonyms}`));
      item.append(renderExample(example, word));
      item.append(text("enrichment-translation", translation, "zh-Hant"));
      if (note) item.append(text("enrichment-note", note));
      fragment.append(item);
    });
    elements.cardEnrichment.replaceChildren(fragment);
    elements.cardBack.scrollTop = 0;
  }

  function persistPreferences() {
    writeStorage(PREFS_KEY, {
      level: state.level,
      pile: state.statusFilter,
      currentByLevel: state.currentByLevel,
    });
  }

  function currentWord() {
    return state.queue.find((word) => word.id === state.currentId) || null;
  }

  function levelCounts() {
    return currentLevelData().words.reduce((counts, word) => {
      counts[getStatus(word.id)] += 1;
      return counts;
    }, { new: 0, review: 0, learned: 0 });
  }

  function syncQueue({ preserveCurrent = true } = {}) {
    const previousId = preserveCurrent ? state.currentId : null;
    state.queue = currentLevelData().words.filter(matchesFilters);
    if (previousId && state.queue.some((word) => word.id === previousId)) {
      state.currentId = previousId;
    } else {
      const savedId = state.currentByLevel[state.level];
      state.currentId = state.queue.some((word) => word.id === savedId)
        ? savedId : state.queue[0]?.id || null;
    }
    if (state.currentId) state.currentByLevel[state.level] = state.currentId;
    state.flipped = false;
    persistPreferences();
  }

  function renderLevelControls() {
    const fragment = document.createDocumentFragment();
    data.levels.forEach((levelData) => {
      const level = Number(levelData.level);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `level-button${level === state.level ? " is-active" : ""}`;
      button.dataset.level = String(level);
      button.setAttribute("aria-pressed", String(level === state.level));
      button.textContent = `Level ${level}`;
      fragment.append(button);
    });
    elements.levelGrid.replaceChildren(fragment);
    elements.levelSelect.value = String(state.level);
  }

  function renderPileControls() {
    const counts = levelCounts();
    elements.unlearnedPileCount.textContent = numberFormat.format(counts.new);
    elements.reviewPileCount.textContent = numberFormat.format(counts.review);
    elements.learnedPileCount.textContent = numberFormat.format(counts.learned);
    const entries = [
      [elements.unlearnedPileButton, "new"],
      [elements.reviewPileButton, "review"],
      [elements.learnedPileButton, "learned"],
    ];
    entries.forEach(([button, pile]) => {
      const active = pile === state.statusFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    elements.activePileLabel.textContent = pileNames[state.statusFilter];
  }

  function renderCard() {
    const word = currentWord();
    renderEnrichment(word);
    const index = word ? state.queue.findIndex((item) => item.id === word.id) : -1;
    elements.positionText.textContent = word
      ? `${numberFormat.format(index + 1)} / ${numberFormat.format(state.queue.length)}` : "0 / 0";
    elements.progressFill.style.width = state.queue.length ? `${((index + 1) / state.queue.length) * 100}%` : "0%";
    elements.flashcard.classList.toggle("is-flipped", Boolean(word && state.flipped));
    elements.flashcard.classList.toggle("is-disabled", !word);
    elements.flashcard.setAttribute("aria-disabled", String(!word));
    elements.flashcard.tabIndex = word ? 0 : -1;
    for (const control of [elements.previousButton, elements.nextButton, elements.shuffleButton,
      elements.flipButton, elements.pronounceButton, elements.reviewToggle, elements.learnedToggle]) {
      control.disabled = !word;
    }

    if (!word) {
      elements.cardTag.textContent = `Level ${state.level}`;
      elements.cardBackTag.textContent = "沒有符合項目";
      elements.cardWord.textContent = "這個牌堆目前是空的";
      elements.cardWord.className = "card-word";
      elements.cardPhonetic.textContent = "";
      elements.cardPartOfSpeech.textContent = "";
      elements.cardMeaning.textContent = "請切換牌堆、Level 或清除搜尋";
      elements.cardMeaning.classList.remove("is-long");
      elements.cardSource.textContent = "";
      elements.reviewToggle.checked = false;
      elements.learnedToggle.checked = false;
      elements.flashcard.setAttribute("aria-label", "目前沒有符合條件的單字");
      return;
    }

    const status = getStatus(word.id);
    elements.cardTag.textContent = `Level ${state.level}`;
    elements.cardBackTag.textContent = "詞義與用法";
    elements.cardWord.textContent = word.word;
    elements.cardWord.className = "card-word";
    if (word.word.length > 26) elements.cardWord.classList.add("is-long-phrase");
    else if (/\s|\//.test(word.word)) elements.cardWord.classList.add("is-phrase");
    elements.cardPhonetic.textContent = word.phonetic || "音標未列於原始表格";
    elements.cardPartOfSpeech.textContent = word.partOfSpeech || "詞性未標示";
    elements.cardMeaning.textContent = word.meaning;
    elements.cardMeaning.classList.toggle("is-long", word.meaning.length > 42);
    elements.cardSource.textContent = `詞條來源：PDF 第 ${word.sourcePage} 頁 · 例句與近義詞為補充內容`;
    elements.reviewToggle.checked = status === "review";
    elements.learnedToggle.checked = status === "learned";
    elements.flashcard.setAttribute(
      "aria-label",
      state.flipped ? `回到 ${word.word} 的英文卡面` : `查看 ${word.word} 的詞義、近義詞與例句`,
    );
  }

  function renderList() {
    const fragment = document.createDocumentFragment();
    if (!state.queue.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "沒有符合條件的單字。";
      fragment.append(empty);
    } else {
      state.queue.forEach((word) => {
        const row = document.createElement("div");
        row.className = `word-row${word.id === state.currentId ? " is-active" : ""}`;
        row.dataset.id = word.id;
        row.classList.toggle("is-review", getStatus(word.id) === "review");
        row.classList.toggle("is-learned", getStatus(word.id) === "learned");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "word-row-main";
        button.dataset.id = word.id;
        button.setAttribute("aria-label", `練習 ${word.word}`);
        const title = document.createElement("span");
        title.className = "list-word";
        const dot = document.createElement("span");
        dot.className = "learned-dot";
        dot.setAttribute("aria-hidden", "true");
        const strong = document.createElement("strong");
        strong.textContent = word.word;
        const page = document.createElement("small");
        page.className = "list-level";
        page.textContent = `p.${word.sourcePage}`;
        title.append(dot, strong, page);
        const phonetic = document.createElement("span");
        phonetic.className = "list-phonetic";
        phonetic.textContent = word.phonetic || word.partOfSpeech;
        const meaning = document.createElement("span");
        meaning.className = "list-meta";
        meaning.textContent = word.meaning;
        button.append(title, phonetic, meaning);
        row.append(button);
        fragment.append(row);
      });
    }
    elements.cardList.replaceChildren(fragment);
    elements.visibleCount.textContent = `${numberFormat.format(state.queue.length)} 張`;
  }

  function updateActiveListItem() {
    if (typeof elements.cardList.querySelectorAll !== "function") return;
    elements.cardList.querySelectorAll(".word-row[data-id]").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.id === state.currentId);
    });
  }

  function renderHeadings() {
    const count = currentLevelData().words.length;
    elements.levelEyebrow.textContent = `Level ${state.level} · ${levelNames[state.level] || "分級字彙"}`;
    elements.studyTitle.textContent = "7000 單字複習";
    elements.levelTotal.textContent = `${numberFormat.format(count)} 張`;
    elements.libraryTitle.textContent = `Level ${state.level} 單字庫`;
  }

  function refresh(options = {}) {
    syncQueue(options);
    renderHeadings();
    renderLevelControls();
    renderPileControls();
    renderCard();
    renderList();
  }

  function setLevel(level) {
    if (!levels.has(level)) return;
    state.level = level;
    state.currentId = state.currentByLevel[level] || null;
    state.query = "";
    elements.searchInput.value = "";
    elements.voiceStatus.textContent = "";
    refresh({ preserveCurrent: true });
  }

  function setPile(pile) {
    if (!["new", "review", "learned"].includes(pile) || pile === state.statusFilter) return;
    state.statusFilter = pile;
    state.currentId = null;
    elements.voiceStatus.textContent = "";
    refresh({ preserveCurrent: false });
  }

  function selectWord(wordId, { scroll = false } = {}) {
    if (!state.queue.some((word) => word.id === wordId)) return;
    state.currentId = wordId;
    state.currentByLevel[state.level] = wordId;
    state.flipped = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    elements.voiceStatus.textContent = "";
    persistPreferences();
    renderCard();
    updateActiveListItem();
    if (scroll) elements.flashcard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function moveCard(offset) {
    if (!state.queue.length) return;
    const index = Math.max(0, state.queue.findIndex((word) => word.id === state.currentId));
    selectWord(state.queue[(index + offset + state.queue.length) % state.queue.length].id);
  }

  function flipCard() {
    if (!currentWord()) return;
    state.flipped = !state.flipped;
    renderCard();
  }

  function randomCard() {
    if (!state.queue.length) return;
    if (state.queue.length === 1) return selectWord(state.queue[0].id);
    const candidates = state.queue.filter((word) =>
      word.id !== state.currentId && word.id !== state.lastRandomId);
    const fallback = state.queue.filter((word) => word.id !== state.lastRandomId);
    const pool = candidates.length ? candidates : fallback;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    state.lastRandomId = selected.id;
    selectWord(selected.id);
  }

  function setCurrentStatus(nextStatus) {
    const word = currentWord();
    if (!word) return;
    const oldIndex = state.queue.findIndex((item) => item.id === word.id);
    if (nextStatus === "new") delete progress[word.id];
    else progress[word.id] = nextStatus;
    writeStorage(STORAGE_KEY, progress);
    syncQueue({ preserveCurrent: true });
    if (!state.queue.some((item) => item.id === word.id) && state.queue.length) {
      state.currentId = state.queue[Math.min(oldIndex, state.queue.length - 1)].id;
      state.currentByLevel[state.level] = state.currentId;
      persistPreferences();
    }
    renderPileControls();
    renderCard();
    renderList();
  }

  function speakCurrentWord() {
    const word = currentWord();
    if (!word) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      elements.voiceStatus.textContent = "這個瀏覽器不支援語音朗讀。";
      return;
    }
    const spokenWord = word.word.split("/")[0].replace(/\(\d+\)/g, " ")
      .replace(/\(([^)]*)\)/g, "$1").replace(/\d+$/, "").replace(/\s+/g, " ").trim();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenWord);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.onstart = () => { elements.voiceStatus.textContent = `正在朗讀：${spokenWord}`; };
    utterance.onend = () => { elements.voiceStatus.textContent = ""; };
    utterance.onerror = () => { elements.voiceStatus.textContent = "暫時無法播放發音。"; };
    window.speechSynthesis.speak(utterance);
  }

  function clearFilters() {
    state.query = "";
    elements.searchInput.value = "";
    refresh({ preserveCurrent: true });
  }

  data.levels.forEach((levelData) => {
    const option = document.createElement("option");
    option.value = String(levelData.level);
    option.textContent = `Level ${levelData.level} · ${numberFormat.format(levelData.words.length)} 張`;
    elements.levelSelect.append(option);
  });

  elements.levelGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (button) setLevel(Number(button.dataset.level));
  });
  elements.levelSelect.addEventListener("change", () => setLevel(Number(elements.levelSelect.value)));
  elements.unlearnedPileButton.addEventListener("click", () => setPile("new"));
  elements.reviewPileButton.addEventListener("click", () => setPile("review"));
  elements.learnedPileButton.addEventListener("click", () => setPile("learned"));
  elements.flashcard.addEventListener("click", flipCard);
  elements.flipButton.addEventListener("click", flipCard);
  elements.previousButton.addEventListener("click", () => moveCard(-1));
  elements.nextButton.addEventListener("click", () => moveCard(1));
  elements.shuffleButton.addEventListener("click", randomCard);
  elements.pronounceButton.addEventListener("click", speakCurrentWord);
  elements.reviewToggle.addEventListener("change", () => {
    const checked = elements.reviewToggle.checked;
    queueMicrotask(() => setCurrentStatus(checked ? "review" : "new"));
  });
  elements.learnedToggle.addEventListener("change", () => {
    const checked = elements.learnedToggle.checked;
    queueMicrotask(() => setCurrentStatus(checked ? "learned" : "new"));
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    refresh({ preserveCurrent: true });
  });
  elements.cardList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (button) selectWord(button.dataset.id, { scroll: true });
  });
  elements.flashcard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.code === "Space") {
      event.preventDefault();
      flipCard();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.isContentEditable
      || event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.code === "Space") {
      if (event.target.closest("button, a, #flashcard")) return;
      event.preventDefault();
      flipCard();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveCard(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveCard(1);
    }
  });

  refresh({ preserveCurrent: true });
})();
