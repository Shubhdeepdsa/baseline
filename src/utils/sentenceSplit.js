// Split full text into:
// - completedSentences: sentences that have ended (. ! ?)
// - currentSentence: the in-progress text after the last sentence end
export function splitSentences(text) {
  if (!text || !text.trim()) {
    return { completedSentences: [], currentSentence: '' }
  }

  // Match sentence endings: . ! ? followed by space or end of string
  const sentenceEndRegex = /[.!?](?:\s|$)/g
  let lastEnd = 0
  const completedSentences = []
  let match

  while ((match = sentenceEndRegex.exec(text)) !== null) {
    const sentence = text.slice(lastEnd, match.index + 1).trim()
    if (sentence.length > 4) {
      completedSentences.push(sentence)
    }
    lastEnd = match.index + match[0].length
  }

  const currentSentence = text.slice(lastEnd).trim()

  return { completedSentences, currentSentence }
}

// Split a block of text (AI version) into individual sentences
export function splitIntoGhostSentences(text) {
  if (!text || !text.trim()) return []

  // Split on sentence endings, keeping the punctuation
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)

  return sentences
}
