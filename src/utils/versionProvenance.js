function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getSharedPrefixLength(a, b) {
  const max = Math.min(a.length, b.length)
  let index = 0

  while (index < max && a[index] === b[index]) {
    index += 1
  }

  return index
}

function getSharedSuffixLength(a, b, prefixLength) {
  const max = Math.min(a.length, b.length) - prefixLength
  let index = 0

  while (
    index < max &&
    a[a.length - 1 - index] === b[b.length - 1 - index]
  ) {
    index += 1
  }

  return index
}

export function parseVersionInfo(filename) {
  const match = filename?.match(/^v(\d+)(?:_(master|derived-from-v(\d+)))?(?:_.+)?\.md$/)

  if (!match) {
    return {
      versionNumber: null,
      kind: 'full',
      sourceVersionNumber: null,
    }
  }

  const versionNumber = Number(match[1])
  const tag = match[2] || null
  const sourceVersionNumber = match[3] ? Number(match[3]) : null

  if (tag === 'master') {
    return { versionNumber, kind: 'master', sourceVersionNumber: null }
  }

  if (tag?.startsWith('derived-from-v')) {
    return { versionNumber, kind: 'derived', sourceVersionNumber }
  }

  return { versionNumber, kind: 'full', sourceVersionNumber: null }
}

export function charIndexToLineNumber(text, index) {
  const safeIndex = clamp(index, 0, text.length)
  let line = 1

  for (let i = 0; i < safeIndex; i += 1) {
    if (text[i] === '\n') line += 1
  }

  return line
}

export function lineRangeToCharRange(text, startLine, endLine) {
  const normalizedText = text || ''
  const lineStarts = [0]

  for (let i = 0; i < normalizedText.length; i += 1) {
    if (normalizedText[i] === '\n') {
      lineStarts.push(i + 1)
    }
  }

  const safeStartLine = Math.max(1, startLine || 1)
  const safeEndLine = Math.max(safeStartLine, endLine || safeStartLine)
  const start = lineStarts[safeStartLine - 1] ?? normalizedText.length
  const end = safeEndLine >= lineStarts.length
    ? normalizedText.length
    : lineStarts[safeEndLine] - 1

  return { start, end: Math.max(start, end) }
}

export function charRangeToLineRange(text, start, end) {
  const safeStart = clamp(start, 0, text.length)
  const safeEnd = clamp(end, safeStart, text.length)
  const endAnchor = safeEnd > safeStart ? safeEnd - 1 : safeStart

  return {
    currentLineStart: charIndexToLineNumber(text, safeStart),
    currentLineEnd: charIndexToLineNumber(text, endAnchor),
  }
}

export function sortSegments(segments) {
  return [...segments].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return a.end - b.end
  })
}

export function applyTextChangeToSegments(segments, oldText, newText) {
  if (oldText === newText) return sortSegments(segments)

  const prefixLength = getSharedPrefixLength(oldText, newText)
  const suffixLength = getSharedSuffixLength(oldText, newText, prefixLength)

  const removedStart = prefixLength
  const removedEnd = oldText.length - suffixLength
  const insertedEnd = newText.length - suffixLength
  const delta = insertedEnd - removedEnd
  const isInsertion = removedStart === removedEnd

  const nextSegments = []

  for (const segment of segments) {
    let nextSegment = { ...segment }

    if (isInsertion) {
      if (nextSegment.end <= removedStart) {
        nextSegments.push(nextSegment)
        continue
      }

      if (nextSegment.start >= removedStart) {
        nextSegment.start += delta
        nextSegment.end += delta
        nextSegments.push(nextSegment)
        continue
      }

      if (nextSegment.start < removedStart && nextSegment.end > removedStart) {
        nextSegment.end += delta
        nextSegment.edited = true
        nextSegments.push(nextSegment)
        continue
      }

      nextSegments.push(nextSegment)
      continue
    }

    if (nextSegment.end <= removedStart) {
      nextSegments.push(nextSegment)
      continue
    }

    if (nextSegment.start >= removedEnd) {
      nextSegment.start += delta
      nextSegment.end += delta
      nextSegments.push(nextSegment)
      continue
    }

    const nextStart = nextSegment.start < removedStart ? nextSegment.start : removedStart
    const nextEnd = Math.max(nextStart, nextSegment.end + delta)

    if (nextEnd === nextStart) {
      continue
    }

    nextSegment.start = nextStart
    nextSegment.end = nextEnd
    nextSegment.edited = true
    nextSegments.push(nextSegment)
  }

  return sortSegments(nextSegments)
}

export function insertTrackedSegment({
  text,
  segments,
  selectionStart,
  selectionEnd,
  insertText,
  provenance,
}) {
  const start = selectionStart ?? 0
  const end = selectionEnd ?? start
  const nextText = `${text.slice(0, start)}${insertText}${text.slice(end)}`
  const adjustedSegments = applyTextChangeToSegments(segments, text, nextText)

  if (!insertText) {
    return { text: nextText, segments: adjustedSegments }
  }

  const nextSegments = sortSegments([
    ...adjustedSegments,
    {
      id: provenance.id,
      sourceFilename: provenance.sourceFilename,
      sourceStartLine: provenance.sourceStartLine,
      sourceEndLine: provenance.sourceEndLine,
      originalText: insertText,
      start,
      end: start + insertText.length,
      edited: false,
    },
  ])

  return { text: nextText, segments: nextSegments }
}

export function hydrateSegmentsFromProvenance(provenance, text) {
  if (!Array.isArray(provenance?.segments)) return []

  return sortSegments(
    provenance.segments
      .map((segment) => {
        let start = Number.isFinite(segment.currentCharStart) ? segment.currentCharStart : null
        let end = Number.isFinite(segment.currentCharEnd) ? segment.currentCharEnd : null

        if (start === null || end === null) {
          const range = lineRangeToCharRange(text, segment.currentLineStart, segment.currentLineEnd)
          start = range.start
          end = range.end
        }

        start = clamp(start, 0, text.length)
        end = clamp(end, start, text.length)

        if (start === end) {
          return null
        }

        return {
          id: segment.id,
          sourceFilename: segment.sourceFilename,
          sourceStartLine: segment.sourceStartLine,
          sourceEndLine: segment.sourceEndLine,
          originalText: segment.originalText || text.slice(start, end),
          start,
          end,
          edited: Boolean(segment.edited),
        }
      })
      .filter(Boolean)
  )
}

export function serializeSegmentsForPersistence(segments, text) {
  const serializedSegments = sortSegments(segments)
    .filter(segment => segment.end > segment.start)
    .map((segment) => {
      const lineRange = charRangeToLineRange(text, segment.start, segment.end)
      return {
        id: segment.id,
        sourceFilename: segment.sourceFilename,
        sourceStartLine: segment.sourceStartLine,
        sourceEndLine: segment.sourceEndLine,
        currentCharStart: segment.start,
        currentCharEnd: segment.end,
        currentLineStart: lineRange.currentLineStart,
        currentLineEnd: lineRange.currentLineEnd,
        originalText: segment.originalText,
        edited: Boolean(segment.edited || text.slice(segment.start, segment.end) !== segment.originalText),
      }
    })

  const sourceMap = new Map()
  for (const segment of serializedSegments) {
    if (!sourceMap.has(segment.sourceFilename)) {
      sourceMap.set(segment.sourceFilename, {
        filename: segment.sourceFilename,
      })
    }
  }

  return {
    segments: serializedSegments,
    sources: Array.from(sourceMap.values()),
  }
}

export function buildDerivedSegments(sourceFilename, text) {
  if (!text) return []

  return [{
    id: `segment-${Date.now()}-0`,
    sourceFilename,
    sourceStartLine: 1,
    sourceEndLine: charIndexToLineNumber(text, text.length),
    originalText: text,
    start: 0,
    end: text.length,
    edited: false,
  }]
}

export function getSegmentsForLine(segments, lineNumber, text) {
  return sortSegments(segments).filter((segment) => {
    const range = charRangeToLineRange(text, segment.start, segment.end)
    return lineNumber >= range.currentLineStart && lineNumber <= range.currentLineEnd
  })
}

export function getLineNumberFromCursor(text, selectionStart) {
  return charIndexToLineNumber(text, selectionStart || 0)
}

export function createSegmentId() {
  return `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
