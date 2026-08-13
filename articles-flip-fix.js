(() => {
  window.setArticleFlipState = function setArticleFlipStateFixed(card, front, back, button, flipped) {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const isMobile = window.matchMedia?.("(max-width: 960px)")?.matches;
    const finish = () => applyFlipState(front, back, button, flipped);

    if (button.dataset.flipAnimating === "true") return;

    if (typeof card.getAnimations === "function") {
      card.getAnimations().forEach((animation) => animation.cancel());
    }
    card.style.removeProperty("transform");
    card.style.removeProperty("opacity");

    if (reduceMotion || typeof card.animate !== "function") {
      finish();
      return;
    }

    button.dataset.flipAnimating = "true";
    const cleanup = () => {
      button.dataset.flipAnimating = "false";
      card.style.removeProperty("transform");
      card.style.removeProperty("opacity");
    };

    if (isMobile) {
      const fadeOut = card.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0.18, transform: "translateY(6px)" },
        ],
        { duration: 110, easing: "ease-in", fill: "forwards" },
      );

      fadeOut.finished
        .then(() => {
          fadeOut.cancel();
          finish();
          const fadeIn = card.animate(
            [
              { opacity: 0.18, transform: "translateY(-6px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 160, easing: "ease-out" },
          );
          return fadeIn.finished.finally(() => fadeIn.cancel());
        })
        .catch(() => finish())
        .finally(cleanup);
      return;
    }

    const firstHalf = card.animate(
      [
        { transform: "perspective(1200px) rotateY(0deg)", opacity: 1 },
        { transform: "perspective(1200px) rotateY(88deg)", opacity: 0.72 },
      ],
      { duration: 170, easing: "ease-in", fill: "forwards" },
    );

    firstHalf.finished
      .then(() => {
        firstHalf.cancel();
        finish();
        const secondHalf = card.animate(
          [
            { transform: "perspective(1200px) rotateY(-88deg)", opacity: 0.72 },
            { transform: "perspective(1200px) rotateY(0deg)", opacity: 1 },
          ],
          { duration: 210, easing: "ease-out" },
        );
        return secondHalf.finished.finally(() => secondHalf.cancel());
      })
      .catch(() => finish())
      .finally(cleanup);
  };
})();
