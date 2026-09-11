(() => {
  "use strict";

  let lastTouchEnd = 0;
  let lastTouchTarget = null;
  const isInteractive = (target) => Boolean(target?.closest?.(
    "button, a[href], input, select, textarea, label, [role='button'], [tabindex], [contenteditable='true']",
  ));

  document.addEventListener(
    "dblclick",
    (event) => {
      if (isInteractive(event.target)) return;
      event.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      // Controls already use touch-action: manipulation. Canceling touchend here
      // would also cancel their native click, including taps on different buttons.
      if (isInteractive(event.target)) {
        lastTouchEnd = 0;
        lastTouchTarget = null;
        return;
      }
      const now = Date.now();

      if (event.target === lastTouchTarget && now - lastTouchEnd <= 350) {
        event.preventDefault();
      }

      lastTouchEnd = now;
      lastTouchTarget = event.target;
    },
    { passive: false },
  );

  ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      (event) => {
        event.preventDefault();
      },
      { passive: false },
    );
  });
})();
