import SentenceTokenizer from 'natural/lib/natural/tokenizers/sentence_tokenizer.js'
import { NGrams } from 'natural/lib/natural/ngrams/index.js'

const sentenceTokenizer = new SentenceTokenizer([], true)
const WORD_TOKEN_REGEX = /[A-Za-z0-9'-]+/g

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(text) {
  return (text || '').replace(/\r\n?/g, '\n')
}

function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values) {
  if (values.length === 0) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function shannonEntropy(frequencies, total) {
  if (total <= 0) return 0

  let entropy = 0
  frequencies.forEach(count => {
    const probability = count / total
    entropy -= probability * Math.log2(probability)
  })

  return entropy
}

function getHumanLikelihoodBand(score) {
  if (score < 0.35) {
    return { key: 'ai-like', label: 'AI-like' }
  }

  if (score < 0.55) {
    return { key: 'mixed', label: 'Mixed' }
  }

  if (score < 0.75) {
    return { key: 'human-like', label: 'Human-like' }
  }

  return { key: 'strongly-human', label: 'Strongly human' }
}

export function tokenizeWithRanges(text) {
  const tokens = []
  WORD_TOKEN_REGEX.lastIndex = 0

  let match
  while ((match = WORD_TOKEN_REGEX.exec(text)) !== null) {
    const token = match[0]
    tokens.push({
      text: token,
      lower: token.toLowerCase(),
      start: match.index,
      end: match.index + token.length,
    })
  }

  return tokens
}

export function buildTipTapTextProjection(doc, blockSeparator = ' ') {
  const text = doc.textBetween(0, doc.content.size, blockSeparator)
  const segments = []
  let searchCursor = 0

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return

    const projectedIndex = text.indexOf(node.text, searchCursor)
    const textStart = projectedIndex === -1 ? searchCursor : projectedIndex
    const textEnd = textStart + node.text.length

    segments.push({
      text: node.text,
      docFrom: pos,
      docTo: pos + node.text.length,
      textStart,
      textEnd,
    })

    searchCursor = textEnd
  })

  return {
    text,
    segments,
  }
}

function findSentenceRanges(text) {
  const sentences = sentenceTokenizer.tokenize(text)
  const ranges = []
  let cursor = 0

  sentences.forEach(sentence => {
    if (!sentence || !sentence.trim()) return

    let start = text.indexOf(sentence, cursor)
    if (start === -1) {
      start = text.indexOf(sentence.trim(), cursor)
    }

    if (start === -1) return

    const end = start + sentence.length
    ranges.push({
      text: sentence,
      start,
      end,
    })
    cursor = end
  })

  return ranges
}

function buildRangeHighlights(segments, highlights) {
  const decorations = []

  highlights.forEach(highlight => {
    segments.forEach(segment => {
      const overlapStart = Math.max(highlight.from, segment.textStart)
      const overlapEnd = Math.min(highlight.to, segment.textEnd)

      if (overlapStart >= overlapEnd) return

      decorations.push({
        from: segment.docFrom + (overlapStart - segment.textStart),
        to: segment.docFrom + (overlapEnd - segment.textStart),
        metric: highlight.metric,
        severity: highlight.severity,
        tone: highlight.tone,
        label: highlight.label,
      })
    })
  })

  return decorations
}

function createTokenFrequency(tokens) {
  const frequencies = new Map()
  const occurrences = new Map()

  tokens.forEach((token, index) => {
    const current = frequencies.get(token.lower) || 0
    frequencies.set(token.lower, current + 1)

    if (!occurrences.has(token.lower)) {
      occurrences.set(token.lower, [])
    }
    occurrences.get(token.lower).push({ index, token })
  })

  return { frequencies, occurrences }
}

function buildTrigramRepetitionStats(tokens) {
  const tokenTexts = tokens.map(token => token.lower)
  const totalTrigrams = Math.max(0, tokenTexts.length - 2)
  if (totalTrigrams === 0) {
    return {
      totalTrigrams,
      repeatedTrigramCount: 0,
      repeatedTrigramRatio: 0,
    }
  }

  const counts = new Map()
  for (let index = 0; index <= tokenTexts.length - 3; index += 1) {
    const phrase = tokenTexts.slice(index, index + 3).join(' ')
    counts.set(phrase, (counts.get(phrase) || 0) + 1)
  }

  const repeatedTrigramCount = [...counts.values()].filter(count => count > 1).length
  return {
    totalTrigrams,
    repeatedTrigramCount,
    repeatedTrigramRatio: repeatedTrigramCount / totalTrigrams,
  }
}

function buildBurstinessHighlights(sentenceRanges, sentenceLengths) {
  if (sentenceRanges.length < 2) {
    return []
  }

  const avg = mean(sentenceLengths)
  const stdDev = standardDeviation(sentenceLengths)
  if (stdDev === 0) return []

  const candidates = sentenceRanges
    .map((sentence, index) => {
      const zScore = (sentenceLengths[index] - avg) / stdDev
      const severity = clamp(Math.abs(zScore) / 2.25, 0.2, 1)
      return {
        from: sentence.start,
        to: sentence.end,
        metric: 'burstiness',
        severity,
        tone: zScore >= 0 ? 'long' : 'short',
        label: `${sentenceLengths[index]} words`,
        zScore,
      }
    })
    .filter(candidate => Math.abs(candidate.zScore) >= 0.5)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

  return candidates.slice(0, 8)
}

function buildRepeatedNGramHighlights(tokens) {
  const tokenTexts = tokens.map(token => token.lower)
  const candidates = []
  const seenPhrases = new Set()
  const repeatedPhraseKeys = new Set()

  ;[4, 3].forEach(n => {
    if (tokenTexts.length < n) return

    const ngrams = n === 3
      ? NGrams.trigrams(tokenTexts)
      : NGrams.multrigrams(tokenTexts, n)

    const positionsByPhrase = new Map()

    ngrams.forEach((ngram, startIndex) => {
      if (ngram.length !== n) return

      const phrase = ngram.join(' ')
      if (!positionsByPhrase.has(phrase)) {
        positionsByPhrase.set(phrase, [])
      }
      positionsByPhrase.get(phrase).push(startIndex)
    })

    const repeatedPhrases = [...positionsByPhrase.entries()]
      .filter(([, positions]) => positions.length > 1)
      .sort((a, b) => b[1].length - a[1].length || b[0].length - a[0].length)
      .slice(0, 5)

    repeatedPhrases.forEach(([phrase, positions]) => {
      const phraseKey = `${n}:${phrase}`
      if (seenPhrases.has(phraseKey)) return
      seenPhrases.add(phraseKey)
      repeatedPhraseKeys.add(phraseKey)

      positions.forEach(startIndex => {
        const tokenStart = tokens[startIndex]
        const tokenEnd = tokens[startIndex + n - 1]
        if (!tokenStart || !tokenEnd) return

        candidates.push({
          from: tokenStart.start,
          to: tokenEnd.end,
          metric: 'ngram',
          severity: clamp((positions.length - 1) / 4, 0.25, 1),
          tone: n === 4 ? 'quad' : 'tri',
          label: `${n}-gram repeat`,
          phrase,
          repeatCount: positions.length,
        })
      })
    })
  })

  return {
    candidates,
    repeatedPhraseCount: repeatedPhraseKeys.size,
  }
}

function buildEntropyHighlights(tokens) {
  const { frequencies, occurrences } = createTokenFrequency(tokens)
  const total = tokens.length

  const repeatedWords = [...frequencies.entries()]
    .filter(([word, count]) => count >= 2 && word.length > 3)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 6)

  const candidates = []

  repeatedWords.forEach(([word, count]) => {
    const wordOccurrences = occurrences.get(word) || []
    const severity = clamp(count / Math.max(total, 1), 0.25, 1)

    wordOccurrences.forEach(({ token }) => {
      candidates.push({
        from: token.start,
        to: token.end,
        metric: 'entropy',
        severity,
        tone: 'repeat',
        label: `${word} repeats`,
        word,
        repeatCount: count,
      })
    })
  })

  return {
    frequencies,
    candidates,
  }
}

export function analyzeWritingMetrics(text) {
  try {
    const normalizedText = normalizeText(text)
    const sentenceRanges = normalizedText ? findSentenceRanges(normalizedText) : []
    const tokens = normalizedText ? tokenizeWithRanges(normalizedText) : []
    const sentenceLengths = sentenceRanges.map(sentence => tokenizeWithRanges(sentence.text).length)
    const tokenFrequencies = new Map()
    const trigramStats = buildTrigramRepetitionStats(tokens)

    tokens.forEach(token => {
      tokenFrequencies.set(token.lower, (tokenFrequencies.get(token.lower) || 0) + 1)
    })

    const uniqueWords = tokenFrequencies.size
    const totalWords = tokens.length
    const entropy = shannonEntropy(tokenFrequencies, totalWords)
    const normalizedEntropy = uniqueWords > 1
      ? entropy / Math.log2(uniqueWords)
      : 0
    const typeTokenRatio = totalWords > 0
      ? uniqueWords / totalWords
      : 0
    const burstinessStdDev = standardDeviation(sentenceLengths)
    const burstinessMean = mean(sentenceLengths)
    const burstinessCoefficient = (burstinessStdDev + burstinessMean) > 0
      ? (burstinessStdDev - burstinessMean) / (burstinessStdDev + burstinessMean)
      : 0
    const normalizedBurstiness = clamp((burstinessCoefficient + 1) / 2, 0, 1)

    const burstinessHighlights = buildBurstinessHighlights(sentenceRanges, sentenceLengths)
    const ngramResult = buildRepeatedNGramHighlights(tokens)
    const entropyHighlights = buildEntropyHighlights(tokens).candidates
    const normalizedNgramScore = clamp(1 - trigramStats.repeatedTrigramRatio, 0, 1)
    const hlsScore = Math.pow(normalizedBurstiness, 0.5)
      * Math.pow(normalizedEntropy, 0.3)
      * Math.pow(normalizedNgramScore, 0.2)
    const hlsBand = getHumanLikelihoodBand(hlsScore)

    return {
      text: normalizedText,
      summary: {
        sentenceCount: sentenceRanges.length,
        wordCount: totalWords,
        uniqueWordCount: uniqueWords,
        burstiness: {
          meanSentenceLength: burstinessMean,
          stdDevSentenceLength: burstinessStdDev,
          gohBarabasiCoefficient: burstinessCoefficient,
          coefficientOfVariation: burstinessCoefficient,
          normalizedScore: normalizedBurstiness,
        },
        ngrams: {
          repeatedPhraseCount: ngramResult.repeatedPhraseCount,
          repeatedOccurrenceCount: ngramResult.candidates.length,
          repeatedTrigramCount: trigramStats.repeatedTrigramCount,
          repeatedTrigramRatio: trigramStats.repeatedTrigramRatio,
          normalizedScore: normalizedNgramScore,
        },
        entropy: {
          shannonBits: entropy,
          normalizedEntropy,
          typeTokenRatio,
          normalizedScore: normalizedEntropy,
        },
        hls: {
          score: hlsScore,
          band: hlsBand,
          normalizedBurstiness,
          normalizedEntropy,
          normalizedNgramScore,
        },
      },
      highlights: [
        ...burstinessHighlights,
        ...ngramResult.candidates,
        ...entropyHighlights,
      ],
    }
  } catch (error) {
    return {
      text: normalizeText(text),
      summary: {
        sentenceCount: 0,
        wordCount: 0,
        uniqueWordCount: 0,
        burstiness: {
          meanSentenceLength: 0,
          stdDevSentenceLength: 0,
          gohBarabasiCoefficient: 0,
          coefficientOfVariation: 0,
          normalizedScore: 0,
        },
        ngrams: {
          repeatedPhraseCount: 0,
          repeatedOccurrenceCount: 0,
          repeatedTrigramCount: 0,
          repeatedTrigramRatio: 0,
          normalizedScore: 0,
        },
        entropy: {
          shannonBits: 0,
          normalizedEntropy: 0,
          typeTokenRatio: 0,
          normalizedScore: 0,
        },
        hls: {
          score: 0,
          band: getHumanLikelihoodBand(0),
          normalizedBurstiness: 0,
          normalizedEntropy: 0,
          normalizedNgramScore: 0,
        },
      },
      highlights: [],
    }
  }
}

export function getMetricHighlightDecorations(doc, analysis) {
  const { segments } = buildTipTapTextProjection(doc)
  return buildRangeHighlights(segments, analysis?.highlights || [])
}
