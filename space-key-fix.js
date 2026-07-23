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
