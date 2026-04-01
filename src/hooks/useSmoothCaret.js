import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const HIDDEN_CARET = {
  visible: false,
  left: 0,
  top: 0,
  height: 0,
}

const TYPING_IDLE_MS = 320

function caretChanged(prev, next) {
  return (
    prev.visible !== next.visible ||
    Math.abs(prev.left - next.left) > 0.5 ||
    Math.abs(prev.top - next.top) > 0.5 ||
    Math.abs(prev.height - next.height) > 0.5
  )
}

export function useSmoothCaret(editor, containerRef) {
  const [caret, setCaret] = useState(HIDDEN_CARET)
  const [isTyping, setIsTyping] = useState(false)
  const frameRef = useRef(0)
  const composingRef = useRef(false)
  const typingTimeoutRef = useRef(0)

  const hideCaret = useCallback(() => {
    setCaret(prev => (prev.visible ? HIDDEN_CARET : prev))
  }, [])

  const clearTypingState = useCallback(() => {
    window.clearTimeout(typingTimeoutRef.current)
    setIsTyping(false)
  }, [])

  const markTyping = useCallback(() => {
    window.clearTimeout(typingTimeoutRef.current)
    setIsTyping(true)
    typingTimeoutRef.current = window.setTimeout(() => {
      setIsTyping(false)
    }, TYPING_IDLE_MS)
  }, [])

  const updateCaret = useCallback(() => {
    if (!editor || !containerRef.current) {
      hideCaret()
      return
    }

    const { view, state } = editor
    if (!view.hasFocus() || !state.selection.empty || composingRef.current) {
      hideCaret()
      return
    }

    try {
      const coords = view.coordsAtPos(state.selection.from)
      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      const nextCaret = {
        visible: true,
        left: coords.left - containerRect.left + container.scrollLeft,
        top: coords.top - containerRect.top + container.scrollTop,
        height: Math.max(18, coords.bottom - coords.top),
      }

      setCaret(prev => (caretChanged(prev, nextCaret) ? nextCaret : prev))
    } catch {
      hideCaret()
    }
  }, [containerRef, editor, hideCaret])

  const scheduleCaretUpdate = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(updateCaret)
  }, [updateCaret])

  useLayoutEffect(() => {
    scheduleCaretUpdate()

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(typingTimeoutRef.current)
    }
  }, [scheduleCaretUpdate])

  useEffect(() => {
    if (!editor || !containerRef.current) return undefined

    const container = containerRef.current
    const editorDom = editor.view.dom

    const handleFocus = () => {
      scheduleCaretUpdate()
    }

    const handleBlur = () => {
      clearTypingState()
      hideCaret()
    }

    const handleCompositionStart = () => {
      composingRef.current = true
      markTyping()
      hideCaret()
    }

    const handleCompositionEnd = () => {
      composingRef.current = false
      markTyping()
      scheduleCaretUpdate()
    }

    const handleResize = () => {
      scheduleCaretUpdate()
    }

    editor.on('transaction', scheduleCaretUpdate)
    editor.on('selectionUpdate', scheduleCaretUpdate)
    editor.on('focus', handleFocus)
    editor.on('blur', handleBlur)

    container.addEventListener('scroll', scheduleCaretUpdate, { passive: true })
    window.addEventListener('resize', handleResize)
    editorDom.addEventListener('beforeinput', markTyping)
    editorDom.addEventListener('compositionstart', handleCompositionStart)
    editorDom.addEventListener('compositionend', handleCompositionEnd)
    editorDom.addEventListener('keyup', scheduleCaretUpdate)
    editorDom.addEventListener('mouseup', scheduleCaretUpdate)

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(typingTimeoutRef.current)
      editor.off('transaction', scheduleCaretUpdate)
      editor.off('selectionUpdate', scheduleCaretUpdate)
      editor.off('focus', handleFocus)
      editor.off('blur', handleBlur)
      container.removeEventListener('scroll', scheduleCaretUpdate)
      window.removeEventListener('resize', handleResize)
      editorDom.removeEventListener('beforeinput', markTyping)
      editorDom.removeEventListener('compositionstart', handleCompositionStart)
      editorDom.removeEventListener('compositionend', handleCompositionEnd)
      editorDom.removeEventListener('keyup', scheduleCaretUpdate)
      editorDom.removeEventListener('mouseup', scheduleCaretUpdate)
    }
  }, [clearTypingState, containerRef, editor, hideCaret, markTyping, scheduleCaretUpdate])

  return {
    caret: {
      ...caret,
      blinking: caret.visible && !composingRef.current && !isTyping,
    },
    blinking: caret.visible && !composingRef.current && !isTyping,
    nativeCaretHidden: caret.visible && !composingRef.current,
  }
}
