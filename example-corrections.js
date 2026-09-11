// Correct known built-in examples at display time, including existing saved libraries.
// Exact headword + original sentence matching leaves edited/custom examples intact.
(() => {
  const corrections = [
    ['fuel', 'The aircraft needs to refuel before the next flight.',
      'The aircraft needs more fuel before the next flight.', '飛機在下次飛行前需要更多燃料。'],
    ['have a tendency to do', 'Sales tend to increase in the winter.',
      'Sales have a tendency to increase in the winter.', '銷售額有在冬季增加的傾向。'],
    ['lace', 'Your shoelace is untied.',
      'One of your shoe laces is untied.', '你的一條鞋帶鬆了。'],
    ['engage', "The speaker used a surprising story to capture the audience's attention.",
      "The speaker used a surprising story to engage the audience's attention.", '講者用一個出人意料的故事吸引觀眾的注意力。'],
    ['revenge', "In the novel, the soldier vows to avenge his brother's death.",
      "In the novel, the soldier vows to revenge himself on his brother's killer.", '在這本小說中，這名士兵發誓要向殺害兄弟的兇手報仇。'],
    ['paddle', 'He used two oars to row the boat.',
      'She used a paddle to guide the canoe toward the shore.', '她用一支槳將獨木舟划向岸邊。'],
    ['triple', 'The new filter gives the machine three times the lifespan of the old one.',
      'The new filter gives the machine triple the lifespan of the old one.', '新濾心讓機器的壽命達到舊濾心的三倍。'],
    ['selective', 'She is discerning when choosing suppliers.',
      'She is selective about which suppliers she works with.', '她對合作供應商的選擇很挑剔。'],
  ];
  window.FlipWordsExampleCorrections = (word, example, translation) => {
    const correction = corrections.find(row => row[0] === word && row[1] === example);
    return correction ? { example: correction[2], translation: correction[3] } : { example, translation };
  };
})();
