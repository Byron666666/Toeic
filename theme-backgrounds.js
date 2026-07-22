(() => {
  const images = window.FLIPWORDS_THEME_IMAGES || {};
  const themes = ["sakura", "ocean", "cosmos", "cafe"];

  if (!themes.every((theme) => images[theme])) {
    console.warn("FlipWords theme backgrounds could not be loaded.");
    return;
  }

  const overlays = {
    sakura: "linear-gradient(135deg, rgba(7, 8, 22, 0.44), rgba(11, 7, 24, 0.69))",
    ocean: "linear-gradient(135deg, rgba(9, 28, 45, 0.22), rgba(5, 20, 35, 0.50))",
    cosmos: "linear-gradient(135deg, rgba(4, 8, 28, 0.34), rgba(7, 6, 27, 0.68))",
    cafe: "linear-gradient(135deg, rgba(43, 22, 8, 0.18), rgba(31, 15, 5, 0.50))",
  };

  const themeRules = themes
    .map(
      (theme) =>
        `html[data-theme="${theme}"] body{background-image:${overlays[theme]},url("${images[theme]}")!important}`,
    )
    .join("");

  const style = document.createElement("style");
  style.id = "theme-background-style";
  style.textContent = `
    html,body{min-height:100%}
    body{
      background-color:#0c101a!important;
      background-repeat:no-repeat!important;
      background-position:center center!important;
      background-size:cover!important;
      background-attachment:fixed!important;
      transition:background-image 420ms ease,background-color 420ms ease;
    }
    ${themeRules}
    .study-panel,.library-panel{
      background:rgba(13,19,29,.72)!important;
      border-color:rgba(255,255,255,.17)!important;
      box-shadow:0 24px 70px rgba(0,0,0,.42)!important;
      backdrop-filter:blur(17px) saturate(115%);
      -webkit-backdrop-filter:blur(17px) saturate(115%);
    }
    .flashcard-front,.flashcard-back{
      background-color:rgba(17,25,36,.91)!important;
      border-color:rgba(255,255,255,.16)!important;
    }
    .study-mascot,.mascot-bubble,.ambient-orb,.ambient-spark{display:none!important}
    .topbar,.app-shell{position:relative;z-index:1}
    @media(max-width:920px){
      body{background-attachment:scroll!important;background-position:center top!important}
      .study-panel,.library-panel{background:rgba(13,19,29,.82)!important}
    }
    @media(prefers-reduced-motion:reduce){body{transition:none}}
  `;
  document.head.append(style);
})();
