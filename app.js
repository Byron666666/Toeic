const LEGACY_STORAGE_KEY = "flipwords.cards.v1";
const LEGACY_LIBRARY_VERSION_KEY = "flipwords.libraryVersion.v1";
const STORAGE_SCOPE = getStorageScope();
const STORAGE_KEY = `flipwords.${STORAGE_SCOPE}.cards.v2`;
const LIBRARY_VERSION_KEY = `flipwords.${STORAGE_SCOPE}.libraryVersion.v2`;
const BUILT_IN_LIBRARY_VERSION = "flipwords-backup-2026-05-30-2-json-5018-deduped-replace";
const DEMO_CARD_IDS = new Set(["seed-sustainable", "seed-improve", "seed-confident"]);

const fallbackCards = [
  {
    id: "seed-sustainable",
    word: "sustainable",
    meaning: "永續的",
    phonetic: "[səˋstenəbḷ]",
    partOfSpeech: "adj.",
    example: "The hotel switched to sustainable cleaning products.",
    exampleMeaning: "這家飯店改用永續的清潔用品。",
    synonyms: "durable / renewable",
    tag: "A 基礎單字",
    review: false,
    learned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "seed-improve",
    word: "improve",
    meaning: "改善；進步",
    phonetic: "[ɪmˋpruv]",
    partOfSpeech: "v.",
    example: "The new checklist helped improve service speed.",
    exampleMeaning: "新的檢查清單幫助提升服務速度。",
    synonyms: "enhance / upgrade",
    tag: "A 基礎單字",
    review: false,
    learned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "seed-confident",
    word: "confident",
    meaning: "有自信的",
    phonetic: "[ˋkɑnfədənt]",
    partOfSpeech: "adj.",
    example: "The sales representative sounded confident during the call.",
    exampleMeaning: "業務代表在電話中聽起來很有自信。",
    synonyms: "assured / self-reliant",
    tag: "C 形容副詞",
    review: false,
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
  reviewCount: document.querySelector("#reviewCount"),
  learnedCount: document.querySelector("#learnedCount"),
  unlearnedPileButton: document.querySelector("#unlearnedPileButton"),
  reviewPileButton: document.querySelector("#reviewPileButton"),
  learnedPileButton: document.querySelector("#learnedPileButton"),
  unlearnedPileCount: document.querySelector("#unlearnedPileCount"),
  reviewPileCount: document.querySelector("#reviewPileCount"),
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
  cardSynonyms: document.querySelector("#cardSynonyms"),
  cardExample: document.querySelector("#cardExample"),
  cardExampleMeaning: document.querySelector("#cardExampleMeaning"),
  pronounceButton: document.querySelector("#pronounceButton"),
  voiceStatus: document.querySelector("#voiceStatus"),
  flipButton: document.querySelector("#flipButton"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  shuffleButton: document.querySelector("#shuffleButton"),
  reviewToggle: document.querySelector("#reviewToggle"),
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

const PREFERRED_ENGLISH_VOICE_NAMES = [
  "google us english",
  "samantha",
  "alex",
  "ava",
  "allison",
  "susan",
  "tom",
  "victoria",
  "microsoft aria",
  "microsoft guy",
];

const AVOID_ENGLISH_VOICE_NAMES = [
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "pipe organ",
  "trinoids",
  "whisper",
  "zarvox",
];

function getStorageScope() {
  const host = String(window.location.hostname || "local").toLowerCase();
  const pathParts = String(window.location.pathname || "")
    .split("/")
    .filter(Boolean);
  const projectPath = host.endsWith("github.io") ? pathParts[0] || "root" : pathParts.slice(0, -1).join("/") || "root";
  return `${host}/${projectPath}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "local-root";
}

function shouldMigrateLegacyStorage() {
  const href = String(window.location.href || "").toLowerCase();
  return href.includes("toeic") || href.includes("%e5%a4%9a%e7%9b%8a") || href.includes("localhost") || href.includes("127.0.0.1");
}

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
  let savedCards = localStorage.getItem(STORAGE_KEY);
  let savedLibraryVersion = localStorage.getItem(LIBRARY_VERSION_KEY);
  let migratedFromLegacy = false;

  if (!savedCards && shouldMigrateLegacyStorage()) {
    savedCards = localStorage.getItem(LEGACY_STORAGE_KEY);
    savedLibraryVersion = localStorage.getItem(LEGACY_LIBRARY_VERSION_KEY);
    migratedFromLegacy = Boolean(savedCards);
  }

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
        const upgradedLibrary = cloneCards(builtInCards);
        localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(upgradedLibrary));
        return upgradedLibrary;
      }

      if (migratedFromLegacy) {
        localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLibrary));
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
  const review = Boolean(card.review);

  return {
    id: String(card.id || fallbackId || createId()),
    word,
    meaning,
    phonetic,
    speakText,
    partOfSpeech: String(card.partOfSpeech || card.pos || autoDetails.partOfSpeech || "").trim(),
    example: String(card.example || autoDetails.example || "").trim(),
    exampleMeaning: String(card.exampleMeaning || card.exampleChinese || autoDetails.exampleMeaning || "").trim(),
    synonyms: normalizeSynonyms(card.synonyms || extraEnrichment.synonyms || autoDetails.synonyms || ""),
    tag: normalizeTag(String(card.tag || "")),
    review,
    learned: Boolean(card.learned) && !review,
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
      review: Boolean(savedCard.review),
      learned: Boolean(savedCard.learned) && !savedCard.review,
      createdAt: savedCard.createdAt || builtInCard.createdAt,
    };
  });

  const customCards = existingCards.filter(
    (card) =>
      !DEMO_CARD_IDS.has(card.id) &&
      !builtInIds.has(card.id) &&
      !builtInKeys.has(cardKey(card)) &&
      !isGeneratedLibraryCard(card),
  );

  return [...upgradedBuiltInCards, ...customCards];
}

function isGeneratedLibraryCard(card) {
  const id = String(card?.id || "");
  return /^pdf-[a-z]-\d+$/i.test(id) || /^toeic-all-\d+$/i.test(id);
}

function normalizeTag(tag) {
  return tag.trim() || "General";
}

function getPileCounts() {
  const counts = {
    unlearned: 0,
    review: 0,
    learned: 0,
  };

  cards.forEach((card) => {
    counts[getCardPile(card)] += 1;
  });

  return counts;
}

function getCardPile(card) {
  if (card.review) {
    return "review";
  }

  if (card.learned) {
    return "learned";
  }

  return "unlearned";
}

function getPileLabel(pile = activePile) {
  const labels = {
    unlearned: "未學會牌堆",
    review: "重點複習牌堆",
    learned: "已學會牌堆",
  };

  return labels[pile] || labels.unlearned;
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
  return getCardPile(card) === activePile;
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
    ["review", elements.reviewPileButton],
    ["learned", elements.learnedPileButton],
  ];

  elements.unlearnedPileCount.textContent = counts.unlearned;
  elements.reviewPileCount.textContent = counts.review;
  elements.learnedPileCount.textContent = counts.learned;
  elements.activePileLabel.textContent = getPileLabel();

  pileButtons.forEach(([pile, button]) => {
    const isActive = pile === activePile;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderStats() {
  const counts = getPileCounts();
  const currentPosition = filteredCards.length ? currentIndex + 1 : 0;
  const progress = filteredCards.length
    ? Math.round((currentPosition / filteredCards.length) * 100)
    : 0;

  elements.totalCount.textContent = cards.length;
  elements.reviewCount.textContent = counts.review;
  elements.learnedCount.textContent = counts.learned;
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
    elements.reviewToggle.checked = false;
    elements.reviewToggle.disabled = true;
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
  elements.reviewToggle.checked = Boolean(card.review);
  elements.reviewToggle.disabled = false;
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
    row.classList.toggle("is-review", getCardPile(card) === "review");
    row.classList.toggle("is-learned", getCardPile(card) === "learned");

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
    review: existingCard?.review || false,
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

function updateCardState(nextPile) {
  const currentCard = getCurrentCard();
  if (!currentCard) {
    return;
  }

  cards = cards.map((card) =>
    card.id === currentCard.id
      ? {
          ...card,
          review: nextPile === "review",
          learned: nextPile === "learned",
        }
      : card,
  );
  saveCards();
  isFlipped = false;
  render();
}

function updateReviewState() {
  updateCardState(elements.reviewToggle.checked ? "review" : "unlearned");
}

function updateLearnedState() {
  updateCardState(elements.learnedToggle.checked ? "learned" : "unlearned");
}

function cacheVoices() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  availableVoices = window.speechSynthesis.getVoices();
}

function getEnglishVoice() {
  return availableVoices
    .filter((voice) => voice.lang.toLowerCase().startsWith("en-"))
    .map((voice) => ({ voice, score: scoreEnglishVoice(voice) }))
    .sort((a, b) => b.score - a.score)[0]?.voice || null;
}

function scoreEnglishVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (lang === "en-us") {
    score += 100;
  } else if (lang.startsWith("en-")) {
    score += 40;
  }

  PREFERRED_ENGLISH_VOICE_NAMES.forEach((preferredName, index) => {
    if (name.includes(preferredName)) {
      score += 80 - index * 4;
    }
  });

  if (name.includes("natural") || name.includes("premium") || name.includes("enhanced")) {
    score += 20;
  }

  if (voice.localService) {
    score += 8;
  }

  if (AVOID_ENGLISH_VOICE_NAMES.some((avoidName) => name.includes(avoidName))) {
    score -= 200;
  }

  return score;
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
  const includeProgress = window.confirm(
    "要把「重點複習」與「已學會」進度一起匯出嗎？\n\n" +
      "確定：自己備份，保留目前的學習狀態\n" +
      "取消：分享給別人，全部改成未學會",
  );
  const exportedCards = cards.map((card) => ({
    ...card,
    review: includeProgress ? Boolean(card.review) : false,
    learned: includeProgress ? Boolean(card.learned) : false,
  }));
  const data = JSON.stringify(exportedCards, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flipwords-${includeProgress ? "backup" : "share"}-${new Date().toISOString().slice(0, 10)}.json`;
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
elements.reviewPileButton.addEventListener("click", () => setActivePile("review"));
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
elements.reviewToggle.addEventListener("change", updateReviewState);
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
