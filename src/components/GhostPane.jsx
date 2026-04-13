import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './GhostPane.module.css'
import { GHOST_HIGHLIGHT_COLORS, getNextHighlightColorId } from '../utils/ghostHighlightColors'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function createAnnotationId() {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function rangesIntersect(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

function resolveCaretPoint(x, y) {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y)
    if (!position) return null
    return { node: position.offsetNode, offset: position.offset }
  }

  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    if (!range) return null
    return { node: range.startContainer, offset: range.startOffset }
  }

  return null
}

function getSegmentElement(node) {
  if (!node) return null

  if (node.nodeType === 3) {
    return node.parentElement?.closest('[data-segment-start]')
  }

  return node.closest?.('[data-segment-start]') || null
}

function getSentenceElement(node) {
  if (!node) return null

  if (node.nodeType === 3) {
    return node.parentElement?.closest('[data-sentence-id]')
  }

  return node.closest?.('[data-sentence-id]') || null
}

function getOffsetFromPoint(x, y, rootElement, visibleGhosts) {
  const point = resolveCaretPoint(x, y)

  if (point) {
    const segmentElement = getSegmentElement(point.node)
    if (segmentElement) {
      const start = Number(segmentElement.dataset.segmentStart)
      const end = Number(segmentElement.dataset.segmentEnd)
      const maxOffset = Math.max(0, end - start)
      return start + clamp(point.offset, 0, maxOffset)
    }

    const sentenceElement = getSentenceElement(point.node)
    if (sentenceElement) {
      return point.offset <= 0
        ? Number(sentenceElement.dataset.sentenceStart)
        : Number(sentenceElement.dataset.sentenceEnd)
    }
  }

  const hoveredElement = document.elementFromPoint(x, y)
  const segmentElement = hoveredElement?.closest?.('[data-segment-start]')
  if (segmentElement) {
    const start = Number(segmentElement.dataset.segmentStart)
    const end = Number(segmentElement.dataset.segmentEnd)
    const rect = segmentElement.getBoundingClientRect()
    return x <= rect.left + rect.width / 2 ? start : end
  }

  const sentenceElement = hoveredElement?.closest?.('[data-sentence-id]')
  if (sentenceElement) {
    const start = Number(sentenceElement.dataset.sentenceStart)
    const end = Number(sentenceElement.dataset.sentenceEnd)
    const rect = sentenceElement.getBoundingClientRect()
    return x <= rect.left + rect.width / 2 ? start : end
  }

  if (!rootElement || visibleGhosts.length === 0) return null

  const rootRect = rootElement.getBoundingClientRect()
  if (y < rootRect.top) return visibleGhosts[0].start
  if (y > rootRect.bottom) return visibleGhosts[visibleGhosts.length - 1].end

  return null
}

function mergeRanges(ranges) {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged = [sorted[0]]

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const last = merged[merged.length - 1]

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }

  return merged
}

function subtractRanges(baseRange, existingRanges) {
  if (existingRanges.length === 0) return [baseRange]

  const mergedRanges = mergeRanges(
    existingRanges
      .filter(range => rangesIntersect(baseRange.start, baseRange.end, range.start, range.end))
      .map(range => ({
        start: Math.max(baseRange.start, range.start),
        end: Math.min(baseRange.end, range.end),
      }))
  )

  if (mergedRanges.length === 0) return [baseRange]

  const uncovered = []
  let cursor = baseRange.start

  mergedRanges.forEach(range => {
    if (range.start > cursor) {
      uncovered.push({ start: cursor, end: range.start })
    }
    cursor = Math.max(cursor, range.end)
  })

  if (cursor < baseRange.end) {
    uncovered.push({ start: cursor, end: baseRange.end })
  }

  return uncovered.filter(range => range.end > range.start)
}

function buildSentenceSegments(sentence, sourceText, annotations, selectedAnnotationIds, draftRange) {
  const relevantAnnotations = annotations
    .filter(annotation => rangesIntersect(annotation.start, annotation.end, sentence.start, sentence.end))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const breakpoints = new Set([sentence.start, sentence.end])

  relevantAnnotations.forEach(annotation => {
    breakpoints.add(Math.max(sentence.start, annotation.start))
    breakpoints.add(Math.min(sentence.end, annotation.end))
  })

  if (draftRange && rangesIntersect(draftRange.start, draftRange.end, sentence.start, sentence.end)) {
    breakpoints.add(Math.max(sentence.start, draftRange.start))
    breakpoints.add(Math.min(sentence.end, draftRange.end))
  }

  const sortedBreakpoints = [...breakpoints].sort((a, b) => a - b)
  const selectedIdSet = new Set(selectedAnnotationIds)
  const segments = []

  for (let index = 0; index < sortedBreakpoints.length - 1; index += 1) {
    const start = sortedBreakpoints[index]
    const end = sortedBreakpoints[index + 1]
    if (start >= end) continue

    const applicableAnnotations = relevantAnnotations.filter(annotation => rangesIntersect(annotation.start, annotation.end, start, end))
    const activeAnnotation = applicableAnnotations.length > 0 ? applicableAnnotations[applicableAnnotations.length - 1] : null
    const isDraft = draftRange ? rangesIntersect(draftRange.start, draftRange.end, start, end) : false

    segments.push({
      key: `${sentence.id}-${start}-${end}`,
      text: sourceText.slice(start, end),
      start,
      end,
      annotationId: activeAnnotation?.id || null,
      colorId: activeAnnotation?.colorId || null,
      isSelected: activeAnnotation ? selectedIdSet.has(activeAnnotation.id) : false,
      isDraft,
    })
  }

  return segments
}

function getSelectionText(sourceText, ranges) {
  return mergeRanges(ranges)
    .sort((a, b) => a.start - b.start)
    .map(range => sourceText.slice(range.start, range.end))
    .join('\n')
}

export default function GhostPane({
  ghosts,
  ghostSourceText,
  behavior = 'hide',
  selectionMode = 'sentence',
  removedVisibility = 'show',
  annotations = [],
  onAnnotationsChange,
  onRemoveSentences,
  showHighlights = true,
}) {
  const paneRef = useRef(null)
  const actionBoxRef = useRef(null)
  const dragRef = useRef(null)
  const [draftRange, setDraftRange] = useState(null)
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState([])
  const [actionBoxPosition, setActionBoxPosition] = useState(null)

  const visibleGhosts = useMemo(
    () => ghosts.filter(ghost => {
      if (ghost.removed && removedVisibility === 'hide') return false
      if (ghost.covered && behavior === 'hide') return false
      return true
    }),
    [behavior, ghosts, removedVisibility]
  )

  const visibleAnnotations = useMemo(
    () => annotations.filter(annotation => annotation.end > annotation.start),
    [annotations]
  )

  const selectedAnnotations = useMemo(
    () => visibleAnnotations
      .filter(annotation => selectedAnnotationIds.includes(annotation.id))
      .sort((a, b) => a.start - b.start || a.end - b.end),
    [selectedAnnotationIds, visibleAnnotations]
  )

  const clearSelection = useCallback(() => {
    setSelectedAnnotationIds([])
  }, [])

  const resolveSelectionRange = useCallback((startOffset, endOffset, modeOverride = selectionMode) => {
    if (startOffset == null || endOffset == null) return null

    const start = Math.min(startOffset, endOffset)
    const end = Math.max(startOffset, endOffset)
    if (start === end) return null

    const intersectedSentences = visibleGhosts.filter(ghost => rangesIntersect(ghost.start, ghost.end, start, end))
    if (intersectedSentences.length === 0) return null

    if (modeOverride === 'sentence') {
      return {
        start: intersectedSentences[0].start,
        end: intersectedSentences[intersectedSentences.length - 1].end,
      }
    }

    return { start, end }
  }, [selectionMode, visibleGhosts])

  const updateActionBoxPosition = useCallback(() => {
    if (!paneRef.current || selectedAnnotationIds.length === 0) {
      setActionBoxPosition(null)
      return
    }

    const selectedIdSet = new Set(selectedAnnotationIds)
    const allSegments = [...paneRef.current.querySelectorAll('[data-annotation-id]')]
      .filter(element => selectedIdSet.has(element.dataset.annotationId))

    if (allSegments.length === 0) {
      setActionBoxPosition(null)
      return
    }

    const rootRect = paneRef.current.getBoundingClientRect()
    const scrollLeft = paneRef.current.scrollLeft
    const scrollTop = paneRef.current.scrollTop

    const unionRect = allSegments.reduce((acc, element) => {
      const rect = element.getBoundingClientRect()

      if (!acc) {
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        }
      }

      return {
        left: Math.min(acc.left, rect.left),
        right: Math.max(acc.right, rect.right),
        top: Math.min(acc.top, rect.top),
        bottom: Math.max(acc.bottom, rect.bottom),
      }
    }, null)

    if (!unionRect) {
      setActionBoxPosition(null)
      return
    }

    const desiredLeft = unionRect.left - rootRect.left + scrollLeft + (unionRect.right - unionRect.left) / 2
    const desiredTop = unionRect.top - rootRect.top + scrollTop - 48
    const clampedLeft = clamp(desiredLeft, scrollLeft + 120, scrollLeft + paneRef.current.clientWidth - 120)
    const clampedTop = clamp(desiredTop, scrollTop + 8, scrollTop + paneRef.current.clientHeight - 64)

    setActionBoxPosition({
      left: clampedLeft,
      top: clampedTop,
    })
  }, [selectedAnnotationIds])

  useEffect(() => {
    setSelectedAnnotationIds(prev => prev.filter(annotationId => visibleAnnotations.some(annotation => annotation.id === annotationId)))
  }, [visibleAnnotations])

  useEffect(() => {
    updateActionBoxPosition()
  }, [selectedAnnotationIds, annotations, draftRange, updateActionBoxPosition])

  useEffect(() => {
    if (!paneRef.current) return undefined

    const handlePositionUpdate = () => updateActionBoxPosition()
    const paneNode = paneRef.current

    paneNode.addEventListener('scroll', handlePositionUpdate)
    window.addEventListener('resize', handlePositionUpdate)

    return () => {
      paneNode.removeEventListener('scroll', handlePositionUpdate)
      window.removeEventListener('resize', handlePositionUpdate)
    }
  }, [updateActionBoxPosition])

  useEffect(() => {
    if (selectedAnnotationIds.length === 0) return undefined

    const handleDocumentMouseDown = (event) => {
      const target = event.target

      if (actionBoxRef.current?.contains(target)) return
      if (paneRef.current?.contains(target)) {
        const clickedAnnotation = target.closest?.('[data-annotation-id]')
        const clickedSentence = target.closest?.('[data-sentence-id]')

        if (clickedAnnotation || clickedSentence) return
      }

      clearSelection()
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
    }
  }, [clearSelection, selectedAnnotationIds.length])

  const applyColorToSelection = (colorId) => {
    if (selectedAnnotationIds.length === 0) return

    onAnnotationsChange?.(annotations.map(annotation => (
      selectedAnnotationIds.includes(annotation.id)
        ? { ...annotation, colorId }
        : annotation
    )))
  }

  const handleCopySelection = async () => {
    if (selectedAnnotations.length === 0) return

    await window.electron.writeClipboardText(
      getSelectionText(ghostSourceText, selectedAnnotations.map(annotation => ({
        start: annotation.start,
        end: annotation.end,
      })))
    )
  }

  const handleUnhighlightSelection = () => {
    if (selectedAnnotationIds.length === 0) return

    onAnnotationsChange?.(
      annotations.filter(annotation => !selectedAnnotationIds.includes(annotation.id))
    )
    clearSelection()
  }

  const handleDeleteSelection = () => {
    if (selectedAnnotations.length === 0) return

    const sentenceIdsToRemove = [...new Set(
      visibleGhosts
        .filter(ghost => selectedAnnotations.some(annotation => rangesIntersect(annotation.start, annotation.end, ghost.start, ghost.end)))
        .map(ghost => ghost.id)
    )]

    if (sentenceIdsToRemove.length === 0) return

    const removedGhostRanges = visibleGhosts
      .filter(ghost => sentenceIdsToRemove.includes(ghost.id))
      .map(ghost => ({ start: ghost.start, end: ghost.end }))

    onAnnotationsChange?.(
      annotations.filter(annotation => !removedGhostRanges.some(range => rangesIntersect(annotation.start, annotation.end, range.start, range.end)))
    )
    onRemoveSentences?.(sentenceIdsToRemove)
    clearSelection()
  }

  const createAnnotationsFromRange = (selectionRange) => {
    if (!selectionRange) return

    const overlappingAnnotations = visibleAnnotations.filter(annotation =>
      rangesIntersect(annotation.start, annotation.end, selectionRange.start, selectionRange.end)
    )

    const uncoveredRanges = subtractRanges(
      selectionRange,
      overlappingAnnotations.map(annotation => ({
        start: annotation.start,
        end: annotation.end,
      }))
    )

    if (uncoveredRanges.length === 0) {
      const overlappingIds = overlappingAnnotations.map(annotation => annotation.id)
      if (overlappingIds.length > 0) {
        setSelectedAnnotationIds(overlappingIds)
      }
      return
    }

    const colorId = getNextHighlightColorId(annotations)
    const nextAnnotations = uncoveredRanges.map(range => ({
      id: createAnnotationId(),
      start: range.start,
      end: range.end,
      colorId,
    }))

    onAnnotationsChange?.([...annotations, ...nextAnnotations])
    setSelectedAnnotationIds(nextAnnotations.map(annotation => annotation.id))
  }

  const handleMouseDown = (event) => {
    if (visibleGhosts.length === 0) return
    if (event.button !== 0 && event.button !== 2) return

    const modifierPressed = event.metaKey || event.ctrlKey
    const targetAnnotationId = event.target.closest?.('[data-annotation-id]')?.dataset.annotationId || null
    const clickedSentence = event.target.closest?.('[data-sentence-id]')
    const startOffset = getOffsetFromPoint(event.clientX, event.clientY, paneRef.current, visibleGhosts)
    const gesture = event.button === 2
      ? 'copy'
      : modifierPressed
        ? 'meta'
        : 'annotate'

    dragRef.current = {
      gesture,
      startOffset,
      lastOffset: startOffset,
      pointerMoved: false,
      targetAnnotationId,
      clickedSentence: Boolean(clickedSentence),
    }

    if (gesture === 'copy') {
      event.preventDefault()
    }

    const handleMouseMove = (moveEvent) => {
      if (!dragRef.current) return

      const nextOffset = getOffsetFromPoint(moveEvent.clientX, moveEvent.clientY, paneRef.current, visibleGhosts)
      dragRef.current.lastOffset = nextOffset

      if (nextOffset !== dragRef.current.startOffset) {
        dragRef.current.pointerMoved = true
      }

      const modeOverride = dragRef.current.gesture === 'copy'
        ? 'exact'
        : dragRef.current.gesture === 'meta'
          ? 'sentence'
          : selectionMode

      const selectionRange = resolveSelectionRange(dragRef.current.startOffset, nextOffset, modeOverride)

      setDraftRange(selectionRange)
      window.getSelection()?.removeAllRanges()
    }

    const handleMouseUp = async () => {
      const gestureState = dragRef.current
      dragRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      const modeOverride = gestureState?.gesture === 'copy'
        ? 'exact'
        : gestureState?.gesture === 'meta'
          ? 'sentence'
          : selectionMode
      const selectionRange = gestureState
        ? resolveSelectionRange(gestureState.startOffset, gestureState.lastOffset, modeOverride)
        : null

      setDraftRange(null)

      if (!gestureState) return

      if (!selectionRange) {
        if (gestureState.gesture === 'meta' && gestureState.targetAnnotationId && !gestureState.pointerMoved) {
          setSelectedAnnotationIds(prev => (
            prev.includes(gestureState.targetAnnotationId)
              ? prev.filter(annotationId => annotationId !== gestureState.targetAnnotationId)
              : [...prev, gestureState.targetAnnotationId]
          ))
          return
        }

        if (gestureState.targetAnnotationId && !gestureState.pointerMoved) {
          setSelectedAnnotationIds([gestureState.targetAnnotationId])
          return
        }

        if (!gestureState.clickedSentence) {
          clearSelection()
        }
        return
      }

      if (gestureState.gesture === 'copy') {
        await window.electron.writeClipboardText(
          ghostSourceText.slice(selectionRange.start, selectionRange.end)
        )
        return
      }

      if (gestureState.gesture === 'meta') {
        if (!gestureState.pointerMoved && gestureState.targetAnnotationId) {
          setSelectedAnnotationIds(prev => (
            prev.includes(gestureState.targetAnnotationId)
              ? prev.filter(annotationId => annotationId !== gestureState.targetAnnotationId)
              : [...prev, gestureState.targetAnnotationId]
          ))
          return
        }

        const sentenceIdsToRemove = [...new Set(
          visibleGhosts
            .filter(ghost => rangesIntersect(selectionRange.start, selectionRange.end, ghost.start, ghost.end))
            .map(ghost => ghost.id)
        )]

        if (sentenceIdsToRemove.length > 0) {
          const removedGhostRanges = visibleGhosts
            .filter(ghost => sentenceIdsToRemove.includes(ghost.id))
            .map(ghost => ({ start: ghost.start, end: ghost.end }))

          onAnnotationsChange?.(
            annotations.filter(annotation => !removedGhostRanges.some(range => rangesIntersect(annotation.start, annotation.end, range.start, range.end)))
          )
          onRemoveSentences?.(sentenceIdsToRemove)
          clearSelection()
        }
        return
      }

      createAnnotationsFromRange(selectionRange)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
  }

  const allSelectedSameColor = (colorId) => (
    selectedAnnotations.length > 0 && selectedAnnotations.every(annotation => annotation.colorId === colorId)
  )

  return (
    <div
      ref={paneRef}
      className={styles.pane}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {actionBoxPosition && selectedAnnotations.length > 0 && (
        <div
          ref={actionBoxRef}
          className={styles.actionBox}
          style={{
            left: `${actionBoxPosition.left}px`,
            top: `${actionBoxPosition.top}px`,
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={styles.actionRow}>
            <button type="button" className={styles.actionBtn} onClick={handleCopySelection}>
              Copy
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleDeleteSelection}>
              Delete
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleUnhighlightSelection}>
              Unhighlight
            </button>
          </div>

          <div className={styles.actionColors}>
            {GHOST_HIGHLIGHT_COLORS.map(color => (
              <button
                key={color.id}
                type="button"
                className={`${styles.colorSwatch} ${allSelectedSameColor(color.id) ? styles.colorSwatchActive : ''}`}
                style={{ '--swatch-color': `var(--hl-${color.id}-bg)` }}
                onClick={() => applyColorToSelection(color.id)}
                title={color.label}
              />
            ))}
          </div>
        </div>
      )}

      {visibleGhosts.length === 0 ? (
        <div className={styles.empty}>Ghost source appears here once an AI version is active.</div>
      ) : (
        <div className={styles.content}>
          {visibleGhosts.map(ghost => {
            const segments = buildSentenceSegments(ghost, ghostSourceText, visibleAnnotations, selectedAnnotationIds, draftRange)

            return (
              <div
                key={ghost.id}
                className={[
                  styles.ghost,
                  showHighlights ? styles[ghost.state] : '',
                  (showHighlights && ghost.covered) ? styles.covered : '',
                  (showHighlights && ghost.covered) ? styles[behavior] : '',
                  ghost.removed ? styles.removed : '',
                ].filter(Boolean).join(' ')}
                data-sentence-id={ghost.id}
                data-sentence-start={ghost.start}
                data-sentence-end={ghost.end}
              >
                {segments.map(segment => (
                  <span
                    key={segment.key}
                    className={[
                      styles.segment,
                      segment.annotationId ? styles.segmentHighlighted : '',
                      segment.isSelected ? styles.segmentActive : '',
                      segment.isDraft ? styles.segmentDraft : '',
                    ].filter(Boolean).join(' ')}
                    style={segment.colorId ? { '--segment-highlight-bg': `var(--hl-${segment.colorId}-bg)` } : undefined}
                    data-segment-start={segment.start}
                    data-segment-end={segment.end}
                    data-annotation-id={segment.annotationId || undefined}
                  >
                    {segment.text}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
