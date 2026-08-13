(() => {
  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed || 1;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleTargetGrid(grid) {
    if (!grid || grid.dataset.mixedOrder === "true") return;
    const items = Array.from(grid.children);
    if (items.length < 2) return;

    const seedSource = `${location.hash}|${items.map((item) => item.dataset.word || item.textContent).join("|")}`;
    const random = seededRandom(hashText(seedSource));

    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(item));
    grid.append(fragment);
    grid.dataset.mixedOrder = "true";
  }

  function mixVisibleWords() {
    document.querySelectorAll(".target-grid").forEach(shuffleTargetGrid);
  }

  const observer = new MutationObserver(() => {
    requestAnimationFrame(mixVisibleWords);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  mixVisibleWords();
})();
