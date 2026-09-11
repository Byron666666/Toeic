(() => {
  "use strict";
  const irregular = {
    be: "am is are was were been being", have: "has had having", do: "does did done doing",
    go: "goes went gone going", become: "became become", begin: "began begun", break: "broke broken",
    bring: "brought", buy: "bought", catch: "caught", choose: "chose chosen", come: "came",
    cost: "cost", cut: "cut", dig: "dug", draw: "drew drawn", drink: "drank drunk",
    drive: "drove driven", eat: "ate eaten", fall: "fell fallen", feel: "felt", fight: "fought",
    find: "found", fly: "flew flown", forget: "forgot forgotten", forgive: "forgave forgiven",
    freeze: "froze frozen", get: "got gotten", give: "gave given", grow: "grew grown",
    hang: "hung", hear: "heard", hide: "hid hidden", hit: "hit", hold: "held", hurt: "hurt",
    keep: "kept", know: "knew known", lay: "laid", lead: "led", leave: "left", lend: "lent",
    let: "let", lie: "lay lain lying", lose: "lost", make: "made making", mean: "meant",
    meet: "met", pay: "paid", put: "put", read: "read", ride: "rode ridden", ring: "rang rung",
    rise: "rose risen", run: "ran running", say: "said", see: "saw seen", sell: "sold",
    send: "sent", set: "set", shake: "shook shaken", shine: "shone", shoot: "shot",
    show: "showed shown", shut: "shut", sing: "sang sung", sink: "sank sunk", sit: "sat sitting",
    sleep: "slept", speak: "spoke spoken", spend: "spent", stand: "stood", steal: "stole stolen",
    stick: "stuck", strike: "struck stricken", swear: "swore sworn", sweep: "swept",
    swim: "swam swum swimming", take: "took taken taking", teach: "taught", tear: "tore torn",
    tell: "told", think: "thought", throw: "threw thrown", understand: "understood",
    wake: "woke woken", wear: "wore worn", win: "won winning", write: "wrote written writing",
    blow: "blew blown", bear: "bore borne born", beat: "beat beaten", bend: "bent", bind: "bound",
    bleed: "bled", breed: "bred", burst: "burst", deal: "dealt", feed: "fed", flee: "fled",
    forbid: "forbade forbidden", quit: "quit", seek: "sought", slide: "slid", spin: "spun",
    split: "split", spread: "spread", spring: "sprang sprung",
    swing: "swung", weep: "wept", withdraw: "withdrew withdrawn", arise: "arose arisen",
    child: "children", foot: "feet", tooth: "teeth", mouse: "mice", goose: "geese",
    man: "men", woman: "women", person: "people", ox: "oxen", knife: "knives",
    wife: "wives", life: "lives", leaf: "leaves", wolf: "wolves", shelf: "shelves",
    half: "halves", calf: "calves", thief: "thieves", loaf: "loaves", self: "selves",
    analysis: "analyses", basis: "bases", crisis: "crises", thesis: "theses", diagnosis: "diagnoses",
    criterion: "criteria", phenomenon: "phenomena", datum: "data", medium: "media",
    good: "better best", well: "better best", bad: "worse worst", far: "farther farthest further furthest",
    kneel: "knelt", rebuild: "rebuilt", strew: "strewn", awake: "awoke awoken", creep: "crept",
    shrink: "shrank shrunk", spit: "spat", sting: "stung", weave: "wove woven", cling: "clung",
    dwell: "dwelt", slay: "slew slain", stride: "strode stridden", wring: "wrung", fling: "flung",
    mislead: "misled", misunderstand: "misunderstood", overcome: "overcame", overthrow: "overthrew overthrown",
    outdo: "outdid outdone", overhear: "overheard", oversleep: "overslept", repay: "repaid",
    further: "farther", oneself: "myself yourself himself herself itself ourselves yourselves themselves",
  };
  const fixed = new Set("a an the to of in on at for from with by as and or but not one's someone's sb sth someone somebody something A B C".toLowerCase().split(" "));
  const cache = new Map();
  const normalize = value => value.toLowerCase().replace(/[’‘]/g, "'");
  function forms(value) {
    const word = normalize(value);
    if (cache.has(word)) return cache.get(word);
    const result = new Set([word]);
    if (!fixed.has(word)) {
      (irregular[word] || "").split(" ").filter(Boolean).forEach(form => result.add(form));
      if (/^[a-z]+$/.test(word) && word.length > 1) {
        for (const suffix of ["s", "es", "ed", "ing", "er", "est"]) result.add(word + suffix);
        if (/[^aeiou]y$/.test(word)) {
          for (const suffix of ["ies", "ied", "ier", "iest"]) result.add(word.slice(0, -1) + suffix);
        }
        if (/e$/.test(word)) {
          for (const suffix of ["d", "r", "st"]) result.add(word + suffix);
          result.add(word.slice(0, -1) + "ing");
        }
        if (/ie$/.test(word)) result.add(word.slice(0, -2) + "ying");
        if (/[aeiou][bcdfghjklmnpqrstvz]$/.test(word)) {
          for (const suffix of ["ed", "ing", "er", "est"]) result.add(word + word.at(-1) + suffix);
        }
      }
    }
    cache.set(word, result);
    return result;
  }
  const tokenize = value => [...value.matchAll(/[A-Za-z](?:\.[A-Za-z])+\.?|[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g)].map(match =>
    ({ value: normalize(match[0]), raw: match[0], start: match.index, end: match.index + match[0].length }));
  function variants(headword) {
    const aliases = {
      'shop (1) store': 'shop / store', 'argue(ment)': 'argue / argument',
      'pay (1) (ment)': 'pay / payment', 'makeup1': 'makeup / make up', 's w am p': 'swamp',
      'cross one\'s arms': 'cross one\'s arms / one\'s arms crossed',
      'credit money to one\'s account': 'credit money to one\'s account / credit to one\'s account',
      'public relations (PR) department': 'public relations department / PR department',
      'keep one\'s eye on': 'keep one\'s eye on / keep an eye on',
    };
    const cleaned = (aliases[headword] || headword).replace(/\[.*$/, '')
      .replace(/\(\d+\)|\d+/g, "").replace(/\s+(?:a|adj|n|v|adv)\.$/i, '')
      .replace(/-ing\b/g, 'doing').trim();
    const expanded = [cleaned];
    for (let i = 0; i < expanded.length && i < 24; i++) {
      const value = expanded[i];
      const optional = value.match(/\(([^)]+)\)/);
      if (optional) {
        expanded.push(value.replace(optional[0], ''));
        for (const alternative of optional[1].split('/')) expanded.push(value.replace(optional[0], alternative));
      }
    }
    const output = new Set(expanded.filter(value => !value.includes('(')).flatMap(value => value.split(/\s*[/;]\s*/)));
    return [...output].map(tokenize).filter(tokens => tokens.length);
  }
  function placeholder(token) {
    return /^[ABC]$/.test(token.raw) || /^(sb|sth|someone|somebody|something|doing)$/.test(token.value);
  }
  function findRanges(example, headword) {
    const words = tokenize(example);
    const ranges = [];
    for (const pattern of variants(headword)) {
      // Trailing "to do" denotes a grammar slot, not the literal verb do.
      if (pattern.length > 1 && pattern.at(-1).value === "do" && /^(to|better)$/.test(pattern.at(-2).value)) pattern.pop();
      const isSlot = token => pattern.length > 1 && placeholder(token);
      const concrete = pattern.filter(token => !isSlot(token));
      if (!concrete.length) continue;
      function align(pi, wi, chosen) {
        if (pi === pattern.length) return chosen;
        const target = pattern[pi];
        if (isSlot(target)) {
          for (let skip = 1; skip <= 8 && wi + skip <= words.length; skip++) {
            const found = align(pi + 1, wi + skip, chosen);
            if (found) return found;
          }
          return null;
        }
        const possessive = /^(one's|someone's|somebody's)$/.test(target.value);
        const article = pattern.length > 1 && /^(a|an)$/.test(target.value);
        const boundary = pi > 0 && isSlot(pattern[pi - 1]) ? /[.!?;:]/ : /[.!?;:,]/;
        for (let gap = 0; gap <= (pi && concrete.length > 1 ? 3 : 0); gap++) {
          const index = wi + gap;
          if (!words[index]) break;
          // Never bridge a sentence or clause boundary.
          if (chosen.length && boundary.test(example.slice(chosen.at(-1).end, words[index].start))) break;
          if (index > wi && boundary.test(example.slice(words[wi].start, words[index].start))) break;
          const matches = possessive
            ? /^(my|your|his|her|its|our|their)$|'s$/.test(words[index].value)
            : article ? /^(a|an|the|this|that|these|those|my|your|his|her|our|their)$/.test(words[index].value)
            : forms(target.value).has(words[index].value) || forms(target.value).has(words[index].value.replace(/'s$/, ''));
          if (!matches) continue;
          const found = align(pi + 1, index + 1, [...chosen, words[index]]);
          if (found) return found;
        }
        if (article) return align(pi + 1, wi, chosen);
        return null;
      }
      for (let start = 0; start < words.length; start++) {
        const found = align(0, start, []);
        if (found) ranges.push(...found.map(word => [word.start, word.end]));
      }
    }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && (range[0] <= last[1] || /^[\s-]*$/.test(example.slice(last[1], range[0])))) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    return merged;
  }
  window.FlipWordsExampleMatcher = { findRanges };
})();
