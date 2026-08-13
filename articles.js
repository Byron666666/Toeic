const articles = Array.isArray(window.TOEIC_ARTICLES) ? window.TOEIC_ARTICLES : [];
const rawCards = Array.isArray(window.PDF_VOCAB_CARDS) ? window.PDF_VOCAB_CARDS : [];
const pronunciationLookup = window.VOCAB_PRONUNCIATION || {};
const enrichmentLookup = window.VOCAB_EXTRA_ENRICHMENTS || {};
const detailsLookup = window.VOCAB_AUTO_DETAILS || {};

const elements = {
  articleCount: document.querySelector("#articleCount"),
  usedWordCount: document.querySelector("#usedWordCount"),
  remainingWordCount: document.querySelector("#remainingWordCount"),
  totalWordCount: document.querySelector("#totalWordCount"),
  progressFill: document.querySelector("#progressFill"),
  progressPercent: document.querySelector("#progressPercent"),
  archiveCount: document.querySelector("#archiveCount"),
  articleList: document.querySelector("#articleList"),
  articlePanel: document.querySelector("#articlePanel"),
  wordDialog: document.querySelector("#wordDialog"),
  dialogWord: document.querySelector("#dialogWord"),
  dialogPhonetic: document.querySelector("#dialogPhonetic"),
  dialogPartOfSpeech: document.querySelector("#dialogPartOfSpeech"),
  dialogMeaning: document.querySelector("#dialogMeaning"),
  dialogSynonyms: document.querySelector("#dialogSynonyms"),
  dialogExample: document.querySelector("#dialogExample"),
  dialogExampleMeaning: document.querySelector("#dialogExampleMeaning"),
  dialogSourceNote: document.querySelector("#dialogSourceNote"),
};

function normalizeWord(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const cardMap = new Map();
rawCards.forEach((card) => {
  const key = normalizeWord(card?.word);
  if (key && !cardMap.has(key)) {
    cardMap.set(key, card);
  }
});

function getSupplement(lookup, word) {
  const key = normalizeWord(word);
  return lookup[key] || lookup[String(word || "").trim()] || {};
}

function getAllUsedWords() {
  const used = new Set();
  articles.forEach((article) => {
    (article.targetWords || []).forEach((word) => used.add(normalizeWord(word)));
  });
  return used;
}

function renderProgress() {
  const total = rawCards.length;
  const used = getAllUsedWords().size;
  const remaining = Math.max(total - used, 0);
  const percent = total ? (used / total) * 100 : 0;

  elements.articleCount.textContent = articles.length.toLocaleString("zh-TW");
  elements.usedWordCount.textContent = used.toLocaleString("zh-TW");
  elements.remainingWordCount.textContent = remaining.toLocaleString("zh-TW");
  elements.totalWordCount.textContent = total.toLocaleString("zh-TW");
  elements.archiveCount.textContent = String(articles.length);
  elements.progressFill.style.width = `${Math.min(percent, 100)}%`;
  elements.progressPercent.textContent = `${percent.toFixed(percent < 10 ? 1 : 0)}% 完成`;
}

function createMetaChip(text) {
  const span = document.createElement("span");
  span.className = "meta-chip";
  span.textContent = text;
  return span;
}

function createVocabButton(word, label = word, className = "vocab-word") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.word = word;
  button.textContent = label;
  button.title = `查看 ${word} 的單字卡`;
  button.addEventListener("click", () => openWordCard(word));
  return button;
}

function renderMarkedParagraph(text, targetSet) {
  const paragraph = document.createElement("p");
  const pattern = /\{\{([^}|]+)(?:\|([^}]+))?\}\}/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      paragraph.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    const word = String(match[1] || "").trim();
    const label = String(match[2] || match[1] || "").trim();
    const key = normalizeWord(word);

    if (targetSet.has(key)) {
      paragraph.append(createVocabButton(word, label));
    } else {
      paragraph.append(document.createTextNode(label));
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    paragraph.append(document.createTextNode(text.slice(cursor)));
  }

  return paragraph;
}

function renderTranslationParagraph(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "translation-paragraph";
  paragraph.textContent = text;
  return paragraph;
}

function getDuplicateTargets(article) {
  const words = (article.targetWords || []).map(normalizeWord);
  const withinArticle = words.filter((word, index) => words.indexOf(word) !== index);
  const previousWords = new Set();

  articles
    .filter((item) => Number(item.day) < Number(article.day))
    .forEach((item) => (item.targetWords || []).forEach((word) => previousWords.add(normalizeWord(word))));

  const acrossArticles = words.filter((word) => previousWords.has(word));
  return [...new Set([...withinArticle, ...acrossArticles])];
}

function getUnmatchedTargets(article) {
  return (article.targetWords || []).filter((word) => !cardMap.has(normalizeWord(word)));
}

function applyFlipState(front, back, button, flipped) {
  front.hidden = flipped;
  back.hidden = !flipped;
  button.setAttribute("aria-pressed", String(flipped));
  button.textContent = flipped ? "翻回英文" : "翻面看中文";
  front.setAttribute("aria-hidden", String(flipped));
  back.setAttribute("aria-hidden", String(!flipped));

  if ("inert" in front) {
    front.inert = flipped;
    back.inert = !flipped;
  }
}

function setArticleFlipState(card, front, back, button, flipped) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const finish = () => applyFlipState(front, back, button, flipped);

  if (reduceMotion || typeof card.animate !== "function") {
    finish();
    return;
  }

  const firstHalf = card.animate(
    [
      { transform: "perspective(1200px) rotateY(0deg)", opacity: 1 },
      { transform: "perspective(1200px) rotateY(88deg)", opacity: 0.72 },
    ],
    { duration: 170, easing: "ease-in", fill: "forwards" },
  );

  firstHalf.addEventListener("finish", () => {
    finish();
    card.animate(
      [
        { transform: "perspective(1200px) rotateY(-88deg)", opacity: 0.72 },
        { transform: "perspective(1200px) rotateY(0deg)", opacity: 1 },
      ],
      { duration: 210, easing: "ease-out" },
    );
  }, { once: true });
}

function styleFlipControls(headerActions, button, flipScene, flipCard, back, translationLabel) {
  Object.assign(headerActions.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.9rem",
    flexWrap: "wrap",
  });
  Object.assign(button.style, {
    flex: "0 0 auto",
    padding: "0.62rem 0.95rem",
    border: "1px solid rgba(255,158,196,.48)",
    borderRadius: "999px",
    color: "#fff1f7",
    background: "linear-gradient(135deg,rgba(255,158,196,.18),rgba(169,160,255,.16))",
    cursor: "pointer",
    fontWeight: "800",
  });
  Object.assign(flipScene.style, {
    marginTop: "1.6rem",
    perspective: "1200px",
  });
  Object.assign(flipCard.style, {
    transformOrigin: "center top",
    willChange: "transform, opacity",
  });
  Object.assign(back.style, {
    padding: "clamp(1rem,2.6vw,1.7rem)",
    border: "1px solid rgba(169,160,255,.20)",
    borderRadius: "1.15rem",
    background: "linear-gradient(145deg,rgba(169,160,255,.08),rgba(255,158,196,.055))",
  });
  Object.assign(translationLabel.style, {
    maxWidth: "900px",
    margin: "0 auto .8rem",
    color: "#a9a0ff",
    fontSize: ".78rem",
    fontWeight: "900",
    letterSpacing: ".15em",
    textTransform: "uppercase",
  });
}

function renderArticle(article) {
  if (!article) {
    elements.articlePanel.innerHTML = '<div class="empty-state">目前還沒有文章。</div>';
    return;
  }

  elements.articlePanel.replaceChildren();

  const header = document.createElement("header");
  header.className = "article-header";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Day ${String(article.day).padStart(3, "0")}`;
  const title = document.createElement("h2");
  title.textContent = article.title;
  const headerActions = document.createElement("div");
  headerActions.className = "article-header-actions";
  const meta = document.createElement("div");
  meta.className = "article-meta";
  meta.append(
    createMetaChip(article.date),
    createMetaChip(article.topic),
    createMetaChip(article.level),
    createMetaChip(`${article.targetWords?.length || 0} 個目標字`),
  );
  const flipButton = document.createElement("button");
  flipButton.type = "button";
  flipButton.className = "article-flip-button";
  flipButton.setAttribute("aria-pressed", "false");
  flipButton.textContent = "翻面看中文";
  headerActions.append(meta, flipButton);
  header.append(eyebrow, title, headerActions);

  const targetSet = new Set((article.targetWords || []).map(normalizeWord));
  const flipScene = document.createElement("section");
  flipScene.className = "article-flip-scene";
  flipScene.setAttribute("aria-label", "英文文章與中文翻譯");
  const flipCard = document.createElement("div");
  flipCard.className = "article-flip-card";

  const front = document.createElement("div");
  front.className = "article-face article-face-front";
  const copy = document.createElement("div");
  copy.className = "article-copy";
  copy.style.marginTop = "0";
  (article.paragraphs || []).forEach((paragraph) => copy.append(renderMarkedParagraph(paragraph, targetSet)));
  front.append(copy);

  const back = document.createElement("div");
  back.className = "article-face article-face-back";
  const translationLabel = document.createElement("p");
  translationLabel.className = "translation-kicker";
  translationLabel.textContent = "繁體中文翻譯";
  const translationCopy = document.createElement("div");
  translationCopy.className = "article-copy translation-copy";
  translationCopy.style.marginTop = "0";
  translationCopy.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  (article.translation || []).forEach((text) => translationCopy.append(renderTranslationParagraph(text)));
  back.append(translationLabel, translationCopy);

  styleFlipControls(headerActions, flipButton, flipScene, flipCard, back, translationLabel);
  applyFlipState(front, back, flipButton, false);

  if (!(article.translation?.length)) {
    flipButton.disabled = true;
    flipButton.style.opacity = ".55";
    flipButton.style.cursor = "not-allowed";
    flipButton.textContent = "尚無中文翻譯";
    const missing = document.createElement("p");
    missing.className = "empty-state";
    missing.textContent = "這篇文章目前尚未加入中文翻譯。";
    back.append(missing);
  }

  flipCard.append(front, back);
  flipScene.append(flipCard);

  flipButton.addEventListener("click", () => {
    if (flipButton.disabled) return;
    const flipped = flipButton.getAttribute("aria-pressed") !== "true";
    setArticleFlipState(flipCard, front, back, flipButton, flipped);
  });

  const wordsSection = document.createElement("section");
  wordsSection.className = "section-card";
  const wordsHeading = document.createElement("div");
  wordsHeading.className = "section-heading";
  const wordsTitle = document.createElement("h3");
  wordsTitle.textContent = `本篇 ${article.targetWords?.length || 0} 個目標單字`;
  const wordsCount = document.createElement("span");
  wordsCount.textContent = `${article.targetWords?.length || 0} 個｜點一下看單字卡`;
  wordsHeading.append(wordsTitle, wordsCount);
  const grid = document.createElement("div");
  grid.className = "target-grid";
  (article.targetWords || []).forEach((word) => grid.append(createVocabButton(word, word, "target-chip")));
  wordsSection.append(wordsHeading, grid);

  elements.articlePanel.append(header, flipScene, wordsSection);

  if (article.questions?.length) {
    const details = document.createElement("details");
    details.className = "study-details";
    const summary = document.createElement("summary");
    summary.textContent = `TOEIC 閱讀理解題（${article.questions.length} 題）`;
    const body = document.createElement("div");
    body.className = "details-body";
    article.questions.forEach((item, index) => {
      const question = document.createElement("div");
      question.className = "quiz-question";
      const q = document.createElement("strong");
      q.textContent = `${index + 1}. ${item.question}`;
      question.append(q);
      (item.choices || []).forEach((choice) => {
        const row = document.createElement("span");
        row.className = "quiz-choice";
        row.textContent = choice;
        question.append(row);
      });
      body.append(question);
    });
    const key = document.createElement("p");
    key.className = "answer-key";
    key.textContent = `答案：${article.questions.map((item, index) => `${index + 1}.${item.answer}`).join("　")}`;
    body.append(key);
    details.append(summary, body);
    elements.articlePanel.append(details);
  }

  const duplicates = getDuplicateTargets(article);
  const unmatched = getUnmatchedTargets(article);
  if (duplicates.length || unmatched.length) {
    const warning = document.createElement("div");
    warning.className = "data-warning";
    const messages = [];
    if (duplicates.length) messages.push(`重複目標字：${duplicates.join(", ")}`);
    if (unmatched.length) messages.push(`目前字庫找不到：${unmatched.join(", ")}`);
    warning.textContent = messages.join(" ｜ ");
    elements.articlePanel.append(warning);
  }

  document.querySelectorAll(".article-list-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.articleId === article.id);
  });

  history.replaceState(null, "", `#${article.id}`);
}

function renderArchive() {
  elements.articleList.replaceChildren();
  [...articles].sort((a, b) => Number(b.day) - Number(a.day)).forEach((article) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "article-list-button";
    button.dataset.articleId = article.id;
    const title = document.createElement("strong");
    title.textContent = `Day ${String(article.day).padStart(3, "0")} · ${article.title}`;
    const meta = document.createElement("span");
    meta.textContent = `${article.date} ｜ ${article.targetWords?.length || 0} 字`;
    button.append(title, meta);
    button.addEventListener("click", () => {
      renderArticle(article);
      if (window.matchMedia("(max-width: 960px)").matches) {
        elements.articlePanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    elements.articleList.append(button);
  });
}

function openWordCard(word) {
  const key = normalizeWord(word);
  const card = cardMap.get(key);
  const pronunciation = getSupplement(pronunciationLookup, word);
  const enrichment = getSupplement(enrichmentLookup, word);
  const details = getSupplement(detailsLookup, word);

  elements.dialogWord.textContent = card?.word || word;
  elements.dialogPhonetic.textContent = card?.phonetic || card?.kk || pronunciation?.kk || details?.phonetic || "";
  elements.dialogPartOfSpeech.textContent = card?.partOfSpeech || card?.pos || details?.partOfSpeech || "";
  elements.dialogMeaning.textContent = card?.meaning || "目前字庫找不到這張單字卡。";

  const synonyms = card?.synonyms || enrichment?.synonyms || details?.synonyms || "";
  elements.dialogSynonyms.textContent = synonyms ? `同義詞：${String(synonyms).replace(/\s*[,，/]\s*/g, " / ")}` : "";

  const example = card?.example || details?.example || "";
  const exampleMeaning = card?.exampleMeaning || card?.exampleChinese || details?.exampleMeaning || "";
  elements.dialogExample.textContent = example;
  elements.dialogExampleMeaning.textContent = exampleMeaning;
  elements.dialogSourceNote.textContent = card ? "資料來自你目前的 FlipWords 單字庫。" : "請檢查 articles-data.js 的目標字是否與字庫拼法完全一致。";

  if (typeof elements.wordDialog.showModal === "function") {
    if (!elements.wordDialog.open) elements.wordDialog.showModal();
  } else {
    elements.wordDialog.setAttribute("open", "");
  }
}

function getInitialArticle() {
  const hash = String(location.hash || "").replace(/^#/, "");
  return articles.find((article) => article.id === hash) || [...articles].sort((a, b) => Number(b.day) - Number(a.day))[0] || null;
}

renderProgress();
renderArchive();
renderArticle(getInitialArticle());
