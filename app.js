const STORAGE_KEY = "flipwords.cards.v1";
const LIBRARY_VERSION_KEY = "flipwords.libraryVersion.v1";
const BUILT_IN_LIBRARY_VERSION = "pdf-vocab-2026-05-30-abcd-pos-examples-kk-audio-json-1-enrichment-1-toeic-all-details-5";
const DEMO_CARD_IDS = new Set(["seed-sustainable", "seed-improve", "seed-confident"]);

const fallbackCards = [
  {
    id: "seed-sustainable",
    word: "sustainable",
    meaning: "永續的",
    phonetic: "[səˋstenəbḷ]",
    partOfSpeech: "adj.",
    example: "A sustainable habit is easier to keep for a long time.",
    exampleMeaning: "永續的習慣比較容易長期維持。",
    synonyms: "durable / renewable",
    tag: "A 基礎單字",
    learned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "seed-improve",
    word: "improve",
    meaning: "改善；進步",
    phonetic: "[ɪmˋpruv]",
    partOfSpeech: "v.",
    example: "Small daily reviews can improve your vocabulary.",
    exampleMeaning: "每天小量複習可以提升你的字彙量。",
    synonyms: "enhance / upgrade",
    tag: "A 基礎單字",
    learned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "seed-confident",
    word: "confident",
    meaning: "有自信的",
    phonetic: "[ˋkɑnfədənt]",
    partOfSpeech: "adj.",
    example: "She became more confident after practicing every day.",
    exampleMeaning: "她每天練習後變得更有自信。",
    synonyms: "assured / self-reliant",
    tag: "C 形容副詞",
    learned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const pronunciationLookup = window.VOCAB_PRONUNCIATION || {};
const extraEnrichmentLookup = window.VOCAB_EXTRA_ENRICHMENTS || {};
const autoDetailsLookup = window.VOCAB_AUTO_DETAILS || {};
const builtInCards = normalizeBuiltInCards(
  window.PDF_VOCAB_CARDS?.length ? window.PDF_VOCAB_CARDS : fallbackCards,
);

const elements = {
  totalCount: document.querySelector("#totalCount"),
  learnedCount: document.querySelector("#learnedCount"),
  unlearnedPileButton: document.querySelector("#unlearnedPileButton"),
  learnedPileButton: document.querySelector("#learnedPileButton"),
  unlearnedPileCount: document.querySelector("#unlearnedPileCount"),
  learnedPileCount: document.querySelector("#learnedPileCount"),
  activePileLabel: document.querySelector("#activePileLabel"),
  visibleCount: document.querySelector("#visibleCount"),
  positionText: document.querySelector("#positionText"),
  progressFill: document.querySelector("#progressFill"),
  flashcard: document.querySelector("#flashcard"),
  cardTag: document.querySelector("#cardTag"),
  cardBackTag: document.querySelector("#cardBackTag"),
  cardWord: document.querySelector("#cardWord"),
  cardPhonetic: document.querySelector("#cardPhonetic"),
  cardPartOfSpeech: document.querySelector("#cardPartOfSpeech"),
  cardMeaning: document.querySelector("#cardMeaning"),
  cardExample: document.querySelector("#cardExample"),
  cardExampleMeaning: document.querySelector("#cardExampleMeaning"),
  cardSynonyms: document.querySelector("#cardSynonyms"),
  pronounceButton: document.querySelector("#pronounceButton"),
  voiceStatus: document.querySelector("#voiceStatus"),
  flipButton: document.querySelector("#flipButton"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  shuffleButton: document.querySelector("#shuffleButton"),
  learnedToggle: document.querySelector("#learnedToggle"),
  wordForm: document.querySelector("#wordForm"),
  editingId: document.querySelector("#editingId"),
  wordInput: document.querySelector("#wordInput"),
  meaningInput: document.querySelector("#meaningInput"),
  phoneticInput: document.querySelector("#phoneticInput"),
  partOfSpeechInput: document.querySelector("#partOfSpeechInput"),
  exampleInput: document.querySelector("#exampleInput"),
  exampleMeaningInput: document.querySelector("#exampleMeaningInput"),
  synonymsInput: document.querySelector("#synonymsInput"),
  tagInput: document.querySelector("#tagInput"),
  tagSuggestions: document.querySelector("#tagSuggestions"),
  saveButton: document.querySelector("#saveButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  searchInput: document.querySelector("#searchInput"),
  tagFilter: document.querySelector("#tagFilter"),
  cardList: document.querySelector("#cardList"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  importFile: document.querySelector("#importFile"),
};

let cards = loadCards();
let filteredCards = [];
let activePile = "unlearned";
let currentIndex = 0;
let isFlipped = false;
let availableVoices = [];
let voiceStatusTimer = 0;

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeWordKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSynonyms(value) {
  return String(value || "")
    .trim()
    .replace(/\s*[,，]\s*/g, " / ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ");
}

function getPronunciation(word) {
  return pronunciationLookup[normalizeWordKey(word)] || pronunciationLookup[String(word || "").trim()];
}

function getExtraEnrichment(word) {
  return extraEnrichmentLookup[normalizeWordKey(word)] || extraEnrichmentLookup[String(word || "").trim()];
}

function getAutoDetails(word) {
  return autoDetailsLookup[normalizeWordKey(word)] || autoDetailsLookup[String(word || "").trim()];
}

function getPhonetic(card) {
  return String(card?.phonetic || getPronunciation(card?.word)?.kk || getAutoDetails(card?.word)?.phonetic || "").trim();
}

function getSpeakText(card) {
  const pronunciation = getPronunciation(card?.word);
  return String(card?.speakText || pronunciation?.speak || card?.word || "").trim();
}

function loadCards() {
  const savedCards = localStorage.getItem(STORAGE_KEY);
  const savedLibraryVersion = localStorage.getItem(LIBRARY_VERSION_KEY);

  if (!savedCards) {
    const initialCards = cloneCards(builtInCards);
    localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
    return initialCards;
  }

  try {
    const parsedCards = JSON.parse(savedCards);
    if (Array.isArray(parsedCards)) {
      let savedLibrary = parsedCards
        .map((card, index) => sanitizeCard(card, `imported-${index}`))
        .filter(Boolean);

      if (savedLibraryVersion !== BUILT_IN_LIBRARY_VERSION) {
        savedLibrary = savedLibrary.filter((card) => !DEMO_CARD_IDS.has(card.id));
        const upgradedLibrary = mergeBuiltInCards(savedLibrary);
        localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(upgradedLibrary));
        return upgradedLibrary;
      }

      return savedLibrary;
    }
  } catch (error) {
    console.warn("Could not parse saved cards.", error);
  }

  const initialCards = cloneCards(builtInCards);
  localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
  return initialCards;
}

function saveCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function normalizeBuiltInCards(rawCards) {
  return rawCards
    .map((card, index) => sanitizeCard(card, `built-in-${index}`))
    .filter(Boolean);
}

function sanitizeCard(card, fallbackId) {
  const word = String(card.word || "").trim();
  const meaning = String(card.meaning || "").trim();

  if (!word || !meaning) {
    return null;
  }

  const pronunciation = getPronunciation(word);
  const extraEnrichment = getExtraEnrichment(word) || {};
  const autoDetails = getAutoDetails(word) || {};
  const phonetic = String(card.phonetic || card.kk || pronunciation?.kk || autoDetails.phonetic || "").trim();
  const speakText = String(card.speakText || pronunciation?.speak || word).trim();

  return {
    id: String(card.id || fallbackId || createId()),
    word,
    meaning,
    phonetic,
    speakText,
    partOfSpeech: String(card.partOfSpeech || card.pos || autoDetails.partOfSpeech || "").trim(),
    example: String(card.example || autoDetails.example || "").trim(),
    exampleMeaning: String(
      card.exampleMeaning || card.exampleChinese || extraEnrichment.exampleMeaning || autoDetails.exampleMeaning || "",
    ).trim(),
    synonyms: normalizeSynonyms(card.synonyms || extraEnrichment.synonyms || autoDetails.synonyms || ""),
    tag: normalizeTag(String(card.tag || "")),
    learned: Boolean(card.learned),
    createdAt: card.createdAt || new Date().toISOString(),
  };
}

function cloneCards(cardsToClone) {
  return cardsToClone.map((card) => ({ ...card }));
}

function cardKey(card) {
  return `${normalizeWordKey(card.word)}::${String(card.meaning || "").trim().toLowerCase()}`;
}

function mergeBuiltInCards(existingCards) {
  const existingCardsById = new Map(existingCards.map((card) => [card.id, card]));
  const existingCardsByKey = new Map(existingCards.map((card) => [cardKey(card), card]));
  const builtInIds = new Set(builtInCards.map((card) => card.id));
  const builtInKeys = new Set(builtInCards.map(cardKey));

  const upgradedBuiltInCards = builtInCards.map((builtInCard) => {
    const savedCard =
      existingCardsById.get(builtInCard.id) || existingCardsByKey.get(cardKey(builtInCard));

    if (!savedCard) {
      return { ...builtInCard };
    }

    return {
      ...builtInCard,
      learned: Boolean(savedCard.learned),
      createdAt: savedCard.createdAt || builtInCard.createdAt,
    };
  });

  const customCards = existingCards.filter(
    (card) =>
      !DEMO_CARD_IDS.has(card.id) &&
      !builtInIds.has(card.id) &&
      !builtInKeys.has(cardKey(card)),
  );

  return [...upgradedBuiltInCards, ...customCards];
}

function normalizeTag(tag) {
  return tag.trim() || "General";
}

function getPileCounts() {
  const learned = cards.filter((card) => card.learned).length;
  return {
    learned,
    unlearned: cards.length - learned,
  };
}

function getPileLabel(pile = activePile) {
  return pile === "learned" ? "已學會牌堆" : "未學會牌堆";
}

function getCurrentCard() {
  return filteredCards[currentIndex] ?? null;
}

function getFilters() {
  return {
    query: elements.searchInput.value.trim().toLowerCase(),
    tag: elements.tagFilter.value,
  };
}

function cardMatchesActivePile(card) {
  return activePile === "learned" ? Boolean(card.learned) : !card.learned;
}

function applyFilters() {
  const { query, tag } = getFilters();

  filteredCards = cards.filter((card) => {
    const matchesPile = cardMatchesActivePile(card);
    const matchesQuery =
      !query ||
      [
        card.word,
        card.meaning,
        card.phonetic,
        card.partOfSpeech,
        card.example,
        card.exampleMeaning,
        card.synonyms,
        card.tag,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    const matchesTag = tag === "all" || card.tag === tag;
    return matchesPile && matchesQuery && matchesTag;
  });

  if (currentIndex >= filteredCards.length) {
    currentIndex = Math.max(filteredCards.length - 1, 0);
  }
}

function renderPileControls() {
  const counts = getPileCounts();
  const pileButtons = [
    ["unlearned", elements.unlearnedPileButton],
    ["learned", elements.learnedPileButton],
  ];

  elements.unlearnedPileCount.textContent = counts.unlearned;
  elements.learnedPileCount.textContent = counts.learned;
  elements.activePileLabel.textContent = getPileLabel();

  pileButtons.forEach(([pile, button]) => {
    const isActive = pile === activePile;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderStats() {
  const learnedCards = cards.filter((card) => card.learned).length;
  const currentPosition = filteredCards.length ? currentIndex + 1 : 0;
  const progress = filteredCards.length
    ? Math.round((currentPosition / filteredCards.length) * 100)
    : 0;

  elements.totalCount.textContent = cards.length;
  elements.learnedCount.textContent = learnedCards;
  elements.visibleCount.textContent = `${getPileLabel()}：${filteredCards.length} 張`;
  elements.positionText.textContent = `${currentPosition} / ${filteredCards.length}`;
  elements.progressFill.style.width = `${progress}%`;
}

function setFlashcardDisabled(disabled) {
  elements.flashcard.classList.toggle("is-disabled", disabled);
  elements.flashcard.setAttribute("aria-disabled", String(disabled));
  elements.flashcard.tabIndex = disabled ? -1 : 0;
}

function renderCurrentCard() {
  const card = getCurrentCard();
  elements.flashcard.classList.toggle("is-flipped", isFlipped);

  if (!card) {
    elements.cardTag.textContent = getPileLabel();
    elements.cardBackTag.textContent = "Meaning";
    elements.cardWord.textContent = "這個牌堆目前沒有單字";
    elements.cardWord.classList.remove("is-phrase", "is-long-phrase");
    elements.cardPhonetic.textContent = "";
    elements.cardPartOfSpeech.textContent = "";
    elements.cardMeaning.textContent = "切換牌堆，或調整搜尋與分類條件";
    elements.cardExample.textContent = "";
    elements.cardExampleMeaning.textContent = "";
    elements.cardSynonyms.textContent = "";
    elements.learnedToggle.checked = false;
    elements.learnedToggle.disabled = true;
    elements.previousButton.disabled = true;
    elements.nextButton.disabled = true;
    elements.flipButton.disabled = true;
    elements.pronounceButton.disabled = true;
    elements.shuffleButton.disabled = true;
    setFlashcardDisabled(true);
    return;
  }

  const phonetic = getPhonetic(card);

  elements.cardTag.textContent = card.tag;
  elements.cardBackTag.textContent = card.tag;
  elements.cardWord.textContent = card.word;
  elements.cardWord.classList.toggle("is-phrase", card.word.length > 12 || card.word.includes(" "));
  elements.cardWord.classList.toggle("is-long-phrase", card.word.length > 22);
  elements.cardPhonetic.textContent = phonetic || "KK 音標尚未填寫";
  elements.cardPartOfSpeech.textContent = card.partOfSpeech || "詞性尚未填寫";
  elements.cardMeaning.textContent = card.meaning;
  elements.cardSynonyms.textContent = card.synonyms ? `同義詞：${normalizeSynonyms(card.synonyms)}` : "";
  elements.cardExample.textContent = card.example || "尚未填寫例句";
  elements.cardExampleMeaning.textContent = card.exampleMeaning || "";
  elements.learnedToggle.checked = Boolean(card.learned);
  elements.learnedToggle.disabled = false;
  elements.previousButton.disabled = filteredCards.length <= 1;
  elements.nextButton.disabled = filteredCards.length <= 1;
  elements.flipButton.disabled = false;
  elements.pronounceButton.disabled = false;
  elements.shuffleButton.disabled = filteredCards.length <= 1;
  setFlashcardDisabled(false);
}

function renderTags() {
  const activeTag = elements.tagFilter.value;
  const tags = [...new Set(cards.map((card) => card.tag).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  elements.tagFilter.innerHTML = '<option value="all">全部分類</option>';
  elements.tagSuggestions.innerHTML = "";

  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    elements.tagFilter.append(option);

    const suggestion = document.createElement("option");
    suggestion.value = tag;
    elements.tagSuggestions.append(suggestion);
  });

  elements.tagFilter.value = tags.includes(activeTag) ? activeTag : "all";
}

function renderList() {
  const currentCard = getCurrentCard();
  elements.cardList.innerHTML = "";

  if (!filteredCards.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = `${getPileLabel()}沒有符合條件的字卡。`;
    elements.cardList.append(emptyState);
    return;
  }

  filteredCards.forEach((card, index) => {
    const row = document.createElement("article");
    row.className = "word-row";
    row.classList.toggle("is-active", currentCard?.id === card.id);
    row.classList.toggle("is-learned", Boolean(card.learned));

    const content = document.createElement("button");
    content.className = "word-row-main";
    content.type = "button";
    content.setAttribute("aria-label", `切換到 ${card.word}`);
    content.innerHTML = `
      <span class="list-word">
        <span class="learned-dot" aria-hidden="true"></span>
        <strong></strong>
      </span>
      <span class="list-phonetic"></span>
      <span class="list-meta"></span>
    `;
    content.querySelector("strong").textContent = card.word;
    content.querySelector(".list-phonetic").textContent = getPhonetic(card);
    content.querySelector(".list-meta").textContent = [card.partOfSpeech, card.meaning, card.tag]
      .filter(Boolean)
      .join(" ｜ ");
    content.addEventListener("click", () => {
      currentIndex = index;
      isFlipped = false;
      render();
    });

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const speakButton = document.createElement("button");
    speakButton.type = "button";
    speakButton.textContent = "發音";
    speakButton.title = "播放英文發音";
    speakButton.setAttribute("aria-label", `播放 ${card.word} 的發音`);
    speakButton.addEventListener("click", () => speakCard(card));

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "編輯";
    editButton.title = "編輯";
    editButton.setAttribute("aria-label", `編輯 ${card.word}`);
    editButton.addEventListener("click", () => startEditing(card.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.title = "刪除";
    deleteButton.setAttribute("aria-label", `刪除 ${card.word}`);
    deleteButton.addEventListener("click", () => deleteCard(card.id));

    actions.append(speakButton, editButton, deleteButton);
    row.append(content, actions);
    elements.cardList.append(row);
  });
}

function render() {
  renderTags();
  applyFilters();
  renderPileControls();
  renderStats();
  renderCurrentCard();
  renderList();
}

function setActivePile(pile) {
  if (activePile === pile) {
    return;
  }

  activePile = pile;
  currentIndex = 0;
  isFlipped = false;
  render();
}

function toggleFlip() {
  if (!getCurrentCard()) {
    return;
  }

  isFlipped = !isFlipped;
  renderCurrentCard();
}

function moveCard(direction) {
  if (!filteredCards.length) {
    return;
  }

  currentIndex = (currentIndex + direction + filteredCards.length) % filteredCards.length;
  isFlipped = false;
  render();
}

function shuffleCard() {
  if (filteredCards.length <= 1) {
    return;
  }

  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * filteredCards.length);
  }

  currentIndex = nextIndex;
  isFlipped = false;
  render();
}

function resetForm() {
  elements.wordForm.reset();
  elements.editingId.value = "";
  elements.saveButton.textContent = "新增單字";
  elements.cancelEditButton.hidden = true;
}

function startEditing(id) {
  const card = cards.find((item) => item.id === id);
  if (!card) {
    return;
  }

  elements.editingId.value = card.id;
  elements.wordInput.value = card.word;
  elements.meaningInput.value = card.meaning;
  elements.phoneticInput.value = getPhonetic(card);
  elements.partOfSpeechInput.value = card.partOfSpeech || "";
  elements.exampleInput.value = card.example || "";
  elements.exampleMeaningInput.value = card.exampleMeaning || "";
  elements.synonymsInput.value = normalizeSynonyms(card.synonyms);
  elements.tagInput.value = card.tag;
  elements.saveButton.textContent = "儲存變更";
  elements.cancelEditButton.hidden = false;
  elements.wordInput.focus();
}

function deleteCard(id) {
  const card = cards.find((item) => item.id === id);
  if (!card || !window.confirm(`確定要刪除「${card.word}」嗎？`)) {
    return;
  }

  cards = cards.filter((item) => item.id !== id);
  saveCards();
  resetForm();
  isFlipped = false;
  render();
}

function upsertCard(event) {
  event.preventDefault();

  const editingId = elements.editingId.value;
  const existingCard = cards.find((card) => card.id === editingId);
  const word = elements.wordInput.value.trim();
  const pronunciation = getPronunciation(word);
  const cardData = {
    id: editingId || createId(),
    word,
    meaning: elements.meaningInput.value.trim(),
    phonetic: elements.phoneticInput.value.trim() || pronunciation?.kk || "",
    speakText: pronunciation?.speak || word,
    partOfSpeech: elements.partOfSpeechInput.value.trim(),
    example: elements.exampleInput.value.trim(),
    exampleMeaning: elements.exampleMeaningInput.value.trim(),
    synonyms: normalizeSynonyms(elements.synonymsInput.value),
    tag: normalizeTag(elements.tagInput.value),
    learned: existingCard?.learned || false,
    createdAt: existingCard?.createdAt || new Date().toISOString(),
  };

  if (!cardData.word || !cardData.meaning) {
    return;
  }

  if (editingId) {
    cards = cards.map((card) => (card.id === editingId ? cardData : card));
  } else {
    cards = [cardData, ...cards];
    activePile = "unlearned";
    currentIndex = 0;
  }

  saveCards();
  resetForm();
  isFlipped = false;
  render();
}

function updateLearnedState() {
  const currentCard = getCurrentCard();
  if (!currentCard) {
    return;
  }

  cards = cards.map((card) =>
    card.id === currentCard.id ? { ...card, learned: elements.learnedToggle.checked } : card,
  );
  saveCards();
  isFlipped = false;
  render();
}

function cacheVoices() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  availableVoices = window.speechSynthesis.getVoices();
}

function getEnglishVoice() {
  return (
    availableVoices.find((voice) => voice.lang.toLowerCase() === "en-us") ||
    availableVoices.find((voice) => voice.lang.toLowerCase().startsWith("en-")) ||
    null
  );
}

function setVoiceStatus(message, persist = false) {
  window.clearTimeout(voiceStatusTimer);
  elements.voiceStatus.textContent = message;

  if (message && !persist) {
    voiceStatusTimer = window.setTimeout(() => {
      elements.voiceStatus.textContent = "";
    }, 2500);
  }
}

function speakCard(card = getCurrentCard()) {
  if (!card) {
    return;
  }

  if (!("speechSynthesis" in window)) {
    setVoiceStatus("這個瀏覽器不支援語音播放。");
    return;
  }

  cacheVoices();
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(getSpeakText(card));
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  utterance.pitch = 1;

  const voice = getEnglishVoice();
  if (voice) {
    utterance.voice = voice;
  }

  utterance.addEventListener("start", () => setVoiceStatus("播放中...", true));
  utterance.addEventListener("end", () => setVoiceStatus(""));
  utterance.addEventListener("error", () => setVoiceStatus("無法播放發音，請確認瀏覽器允許語音。"));

  window.speechSynthesis.speak(utterance);
}

function exportCards() {
  const data = JSON.stringify(cards, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flipwords-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importCards(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const importedCards = JSON.parse(String(reader.result));
      if (!Array.isArray(importedCards)) {
        throw new Error("Backup is not an array.");
      }

      const sanitizedCards = importedCards
        .map((card, index) => sanitizeCard(card, `imported-${index}`))
        .filter(Boolean);

      cards = mergeBuiltInCards(sanitizedCards);
      activePile = "unlearned";
      currentIndex = 0;
      isFlipped = false;
      localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
      saveCards();
      resetForm();
      render();
    } catch (error) {
      window.alert("匯入失敗，請確認檔案是 FlipWords 匯出的 JSON。");
      console.error(error);
    } finally {
      elements.importFile.value = "";
    }
  });
  reader.readAsText(file);
}

elements.unlearnedPileButton.addEventListener("click", () => setActivePile("unlearned"));
elements.learnedPileButton.addEventListener("click", () => setActivePile("learned"));
elements.flashcard.addEventListener("click", () => toggleFlip());
elements.flashcard.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    toggleFlip();
  }
});
elements.flipButton.addEventListener("click", toggleFlip);
elements.pronounceButton.addEventListener("click", () => speakCard());
elements.previousButton.addEventListener("click", () => moveCard(-1));
elements.nextButton.addEventListener("click", () => moveCard(1));
elements.shuffleButton.addEventListener("click", shuffleCard);
elements.learnedToggle.addEventListener("change", updateLearnedState);
elements.wordForm.addEventListener("submit", upsertCard);
elements.cancelEditButton.addEventListener("click", resetForm);
elements.searchInput.addEventListener("input", () => {
  currentIndex = 0;
  isFlipped = false;
  render();
});
elements.tagFilter.addEventListener("change", () => {
  currentIndex = 0;
  isFlipped = false;
  render();
});
elements.exportButton.addEventListener("click", exportCards);
elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", importCards);

document.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement;
  const isTyping =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;

  if (isTyping) {
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    toggleFlip();
  }

  if (event.key === "ArrowLeft") {
    moveCard(-1);
  }

  if (event.key === "ArrowRight") {
    moveCard(1);
  }
});

if ("speechSynthesis" in window) {
  cacheVoices();
  window.speechSynthesis.addEventListener("voiceschanged", cacheVoices);
}

saveCards();
render();
