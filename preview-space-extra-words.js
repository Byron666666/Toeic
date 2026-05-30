const fs = require("fs");

const backupPath = "C:/Users/TY_HONG/Downloads/flipwords-backup-2026-05-30 (2).json";
const cards = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const extraStart = cards.findIndex((card) => String(card.id) === "toeic-all-0156");
const baseCards = cards.slice(0, extraStart);
const extraCards = cards.slice(extraStart);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

function compact(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

const baseByCompact = new Map();
for (const card of baseCards) {
  const key = compact(card.word);
  if (key && !baseByCompact.has(key)) {
    baseByCompact.set(key, card.word);
  }
}

const manual = new Map(
  Object.entries({
    addupto: "add up to",
    bedesignedtodo: "be designed to do",
    aroundthecorner: "around the corner",
    asaresultof: "as a result of",
    assoonaspossible: "as soon as possible",
    atadiscountedprice: "at a discounted price",
    atafastpace: "at a fast pace",
    atarapidrate: "at a rapid rate",
    atastretch: "at a stretch",
    atallcosts: "at all costs",
    atalltimes: "at all times",
    atnoextracharge: "at no extra charge",
    atthediscretionof: "at the discretion of",
    answerthephone: "answer the phone",
    beinapositiontodo: "be in a position to do",
    beonatrip: "be on a trip",
    bereluctanttodo: "be reluctant to do",
    besupposedtodo: "be supposed to do",
    beunwillingtodo: "be unwilling to do",
    blameaonb: "blame A on B",
    combineawithb: "combine A with B",
    cometoadecision: "come to a decision",
    cometoastandstill: "come to a standstill",
    cometoanend: "come to an end",
    commercialspace: "commercial space",
    commoninterest: "common interest",
    doaafavor: "do A a favor",
    doonesutmost: "do one's utmost",
    drawacheck: "draw a check",
    drawon: "draw on",
    drawthelineat: "draw the line at",
    drydishes: "dry dishes",
    digwithashovel: "dig with a shovel",
    cutoneslosses: "cut one's losses",
    fastenthestrap: "fasten the strap",
    filloutin: "fill out in",
    fillinfor: "fill in for",
    exertpressureon: "exert pressure on",
    haveadayoff: "have a day off",
    haveadiscussion: "have a discussion",
    haveagoodview: "have a good view",
    havealongday: "have a long day",
    havereasontodo: "have reason to do",
    haveyettodo: "have yet to do",
    getapermit: "get a permit",
    getaphonecall: "get a phone call",
    getapromotion: "get a promotion",
    getareplacement: "get a replacement",
    getaticket: "get a ticket",
    getanappointment: "get an appointment",
    getbackintouch: "get back in touch",
    getinline: "get in line",
    getintouchwith: "get in touch with",
    giveaaride: "give A a ride",
    giveaanadvance: "give A an advance",
    giveacall: "give a call",
    giveagoodprice: "give a good price",
    giveahand: "give a hand",
    giveapresentation: "give a presentation",
    giveitatry: "give it a try",
    godownthesteps: "go down the steps",
    gointobusiness: "go into business",
    goon: "go on",
    goonvacation: "go on vacation",
    gooutofbusiness: "go out of business",
    gotofilm: "go to a film",
    gowrongwith: "go wrong with",
    forlargepurchases: "for large purchases",
    forthesakeof: "for the sake of",
    foryourownsafety: "for your own safety",
    fulltimework: "full time work",
    inwriting: "in writing",
    itsnouseing: "it's no use -ing",
    makearevision: "make a revision",
    makeaselection: "make a selection",
    onaregularbasis: "on a regular basis",
    pickupthecheck: "pick up the check",
    playarolein: "play a role in",
    relyon: "rely on",
    raiseoneshand: "raise one's hand",
    reachaconclusion: "reach a conclusion",
    realestatesale: "real estate sale",
    putarush: "put a rush",
    putastrainon: "put a strain on",
    putaway: "put away",
    putinplace: "put in place",
    putinsomeovertime: "put in some overtime",
    putintoeffect: "put into effect",
    puton: "put on",
    putoutfordisplay: "put out for display",
    serveacustomer: "serve a customer",
    setdowntowork: "set down to work",
    sitinalterateseats: "sit in alternate seats",
    segregateafromb: "segregate A from B",
    sendanotitication: "send a notification",
    takeavacation: "take a vacation",
    takeanexamination: "take an examination",
    takenotes: "take notes",
    takeonresponsibilty: "take on responsibility",
    stopatalight: "stop at a light",
    subwaystation: "subway station",
    standinaline: "stand in a line",
    standinline: "stand in line",
    waitforatable: "wait for a table",
    waitinline: "wait in line",
    tumonitsside: "turn on its side",
    tumout: "turn out",
    tunup: "turn up",
    tumover: "turn over",
    toonesadvantage: "to one's advantage",
    tostartwith: "to start with",
    whenitcomesto: "when it comes to",
    winacontract: "win a contract",
  }),
);

function cleanupWord(word) {
  return String(word || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*$/, "")
    .replace(/\s*\.\s*$/, "")
    .replace(/\s*==\s*$/, "")
    .trim();
}

function correctedWord(word) {
  const cleaned = cleanupWord(word);
  const key = compact(cleaned);
  if (manual.has(key)) {
    return manual.get(key);
  }
  if (baseByCompact.has(key)) {
    return baseByCompact.get(key);
  }
  if (key.length >= 6) {
    let best = null;
    for (const [baseKey, baseWord] of baseByCompact.entries()) {
      if (Math.abs(baseKey.length - key.length) > 1) {
        continue;
      }
      const distance = levenshtein(key, baseKey);
      if (distance <= 1 && (!best || baseWord.length > best.length)) {
        best = baseWord;
      }
    }
    if (best) {
      return best;
    }
  }
  return cleaned;
}

const changes = [];
for (const card of extraCards) {
  const nextWord = correctedWord(card.word);
  if (nextWord !== card.word) {
    changes.push([card.id, card.word, nextWord]);
  }
}

console.log(JSON.stringify({ extraCards: extraCards.length, changes: changes.length }, null, 2));
console.log(changes.map(([id, from, to]) => `${id}\t${from}\t=>\t${to}`).join("\n"));
