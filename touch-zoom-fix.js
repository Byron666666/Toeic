(() => {
  "use strict";

  let lastTouchEnd = 0;

  document.addEventListener(
    "dblclick",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();

      if (now - lastTouchEnd <= 350) {
        event.preventDefault();
      }

      lastTouchEnd = now;
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
