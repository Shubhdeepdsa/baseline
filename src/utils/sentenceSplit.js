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

export function normalizeGhostText(text) {
  if (!text || !text.trim()) return ''
  return text.replace(/\s+/g, ' ').trim()
}

// Split a block of text (AI version) into individual sentences with stable offsets.
export function splitIntoGhostSentences(text) {
  const normalizedText = normalizeGhostText(text)

  if (!normalizedText) {
    return { normalizedText: '', sentences: [] }
  }

  const sentences = []
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g
  let match
  let sentenceIndex = 0

  while ((match = sentenceRegex.exec(normalizedText)) !== null) {
    const raw = match[0]
    const trimmed = raw.trim()
    if (trimmed.length <= 10) continue

    const leadingWhitespace = raw.match(/^\s*/)?.[0].length || 0
    const trailingWhitespace = raw.match(/\s*$/)?.[0].length || 0
    const start = match.index + leadingWhitespace
    const end = match.index + raw.length - trailingWhitespace

    sentences.push({
      id: `ghost-${sentenceIndex}-${start}-${end}`,
      text: normalizedText.slice(start, end),
      start,
      end,
    })
    sentenceIndex += 1
  }

  return { normalizedText, sentences }
}
