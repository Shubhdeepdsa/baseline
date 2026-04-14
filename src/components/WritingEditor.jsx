import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { GhostIntellisense } from '../extensions/GhostIntellisense'
import { WritingMetricsHighlighter } from '../extensions/WritingMetricsHighlighter'
import styles from './WritingEditor.module.css'
import { useGhostLogic } from '../hooks/useGhostLogic'
import { useSmoothCaret } from '../hooks/useSmoothCaret'
import GhostPane from './GhostPane'
import SmoothCaret from './SmoothCaret'
import { editorToMarkdown, markdownToHtml } from '../utils/tiptapMarkdown'
import { analyzeWritingMetrics } from '../utils/writingMetrics'

function countWords(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function getTipTapText(editor) {
  if (!editor) return ''
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function joinClasses(...classes) {
  return classes.filter(Boolean).join(' ')
}

function getBandTone(value, thresholds, reverse = false) {
  if (reverse) {
    if (value <= thresholds[0]) return 'good'
    if (value <= thresholds[1]) return 'warning'
    return 'bad'
  }

  if (value < thresholds[0]) return 'bad'
  if (value < thresholds[1]) return 'warning'
  return 'good'
}

function getBurstinessTone(value) {
  return getBandTone(value, [0.4, 0.65])
}

function getEntropyTone(value) {
  return getBandTone(value, [0.6, 0.8])
}

function getNgramTone(value) {
  return getBandTone(value, [3, 6], true)
}

function getHlsTone(value) {
  if (value < 0.35) return 'bad'
  if (value < 0.55) return 'warning'
  if (value < 0.75) return 'good'
  return 'strong'
}

function getHlsLabel(value) {
  if (value < 0.35) return 'AI-like'
  if (value < 0.55) return 'Mixed'
  if (value < 0.75) return 'Human-like'
  return 'Strongly human'
}

const SPLIT_DIVIDER_SIZE = 12

function getEmptyVersionState() {
  return { annotations: [], removedSentenceIds: [] }
}

function getVersionGhostState(ghostState, activeVersionFilename) {
  if (!activeVersionFilename) return getEmptyVersionState()
  return ghostState.versions?.[activeVersionFilename] || getEmptyVersionState()
}

function ToolBtn({ onClick, active, children, title }) {
  return (
    <button
      className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

export default function WritingEditor({ 
  projectId, 
  activeVersionFilename, 
  activeVersionContent,
  settings,
  saveSetting
}) {
  const [wordCount, setWordCount] = useState(0)
  const [saved, setSaved] = useState(true)
  const [ghostState, setGhostState] = useState({ versions: {} })
  const [writingMetrics, setWritingMetrics] = useState(() => analyzeWritingMetrics(''))
  const [metricsViewEnabled, setMetricsViewEnabled] = useState(false)
  const [paneRatio, setPaneRatio] = useState(0.62)
  const saveTimerRef = useRef(null)
  const paneRatioRef = useRef(0.62)
  const editorWrapRef = useRef(null)
  const splitViewRef = useRef(null)
  
  const ghostBehavior = settings.ghostBehavior || 'hide'
  const ghostSelectionMode = settings.ghostSelectionMode || 'sentence'
  const ghostSplitOrientation = settings.ghostSplitOrientation || 'horizontal'
  const ghostRemovedVisibility = settings.ghostRemovedVisibility || 'show'
  const ghostSplitRatioHorizontal = settings.ghostSplitRatioHorizontal ?? 0.62
  const ghostSplitRatioVertical = settings.ghostSplitRatioVertical ?? 0.58

  const versionGhostState = useMemo(
    () => getVersionGhostState(ghostState, activeVersionFilename),
    [ghostState, activeVersionFilename]
  )
  const annotations = versionGhostState.annotations || []
  const removedSentenceIds = versionGhostState.removedSentenceIds || []

  const { ghosts, ghostSourceText, embedStatus, processText, suggestion } = useGhostLogic(activeVersionContent, removedSentenceIds, settings)
  const coveredCount = ghosts.filter(ghost => ghost.covered && !ghost.removed).length
  const visibleGhostCount = ghosts.filter(ghost => !ghost.removed).length

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      GhostIntellisense,
      WritingMetricsHighlighter,
      Placeholder.configure({
        placeholder: 'Start writing here...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: styles.editorContent,
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const text = getTipTapText(nextEditor)
      const nextMetrics = analyzeWritingMetrics(text)
      setWordCount(countWords(text))
      setWritingMetrics(nextMetrics)
      setSaved(false)
      processText(nextEditor.getText())

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const markdown = editorToMarkdown(nextEditor)
        window.electron.saveFile(projectId, 'writing', markdown)
        setSaved(true)
      }, 2000)
    },
  })

  const { caret, nativeCaretHidden } = useSmoothCaret(editor, editorWrapRef)

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      if (settings.enableIntellisense === false) {
        editor.commands.setGhostSuggestion('')
        return
      }

      editor.commands.setGhostSuggestion(suggestion)
    }
  }, [editor, suggestion, settings.enableIntellisense])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    editor.commands.setWritingMetrics({
      enabled: metricsViewEnabled,
      analysis: writingMetrics,
    })
  }, [editor, metricsViewEnabled, writingMetrics])

  const persistGhostState = useCallback((nextState) => {
    if (!projectId) return
    window.electron.saveGhostState(projectId, nextState)
  }, [projectId])

  const updateVersionGhostState = useCallback((updater) => {
    if (!activeVersionFilename) return

    setGhostState(prevState => {
      const current = getVersionGhostState(prevState, activeVersionFilename)
      const nextVersionState = updater(current)
      const nextState = {
        ...prevState,
        versions: {
          ...(prevState.versions || {}),
          [activeVersionFilename]: nextVersionState,
        },
      }

      persistGhostState(nextState)
      return nextState
    })
  }, [activeVersionFilename, persistGhostState])

  useEffect(() => {
    if (!projectId) return

    window.electron.readGhostState(projectId).then(state => {
      setGhostState(state?.versions ? state : { versions: {} })
    })
  }, [projectId])

  useEffect(() => {
    const ratioFromSettings = ghostSplitOrientation === 'horizontal'
      ? ghostSplitRatioHorizontal
      : ghostSplitRatioVertical

    setPaneRatio(ratioFromSettings)
    paneRatioRef.current = ratioFromSettings
  }, [ghostSplitOrientation, ghostSplitRatioHorizontal, ghostSplitRatioVertical])

  useEffect(() => {
    paneRatioRef.current = paneRatio
  }, [paneRatio])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!editor || !projectId) return

    window.electron.readFile(projectId, 'writing').then(result => {
      let loadedText = ''
      if (result.content) {
        editor.commands.setContent(markdownToHtml(result.content), false)
        loadedText = getTipTapText(editor)
      } else {
        editor.commands.setContent('', false)
        loadedText = ''
      }

      const nextMetrics = analyzeWritingMetrics(loadedText)
      setWordCount(countWords(loadedText))
      setWritingMetrics(nextMetrics)
      setSaved(true)
      processText(editor.getText())
    })
  }, [editor, projectId])

  useEffect(() => {
    if (!editor) return
    processText(editor.getText())
  }, [editor, processText, activeVersionContent, removedSentenceIds])

  const handleAnnotationsChange = useCallback((nextAnnotations) => {
    updateVersionGhostState(current => ({
      ...current,
      annotations: nextAnnotations,
    }))
  }, [updateVersionGhostState])

  const handleRemoveSentences = useCallback((sentenceIds) => {
    updateVersionGhostState(current => ({
      ...current,
      removedSentenceIds: [...new Set([...(current.removedSentenceIds || []), ...sentenceIds])],
    }))
  }, [updateVersionGhostState])

  const handleSplitDragStart = (event) => {
    if (!splitViewRef.current) return

    event.preventDefault()

    const handleMouseMove = (moveEvent) => {
      if (!splitViewRef.current) return

      const rect = splitViewRef.current.getBoundingClientRect()
      const usableSize = ghostSplitOrientation === 'horizontal'
        ? rect.height - SPLIT_DIVIDER_SIZE
        : rect.width - SPLIT_DIVIDER_SIZE
      const pointerOffset = ghostSplitOrientation === 'horizontal'
        ? moveEvent.clientY - rect.top - SPLIT_DIVIDER_SIZE / 2
        : moveEvent.clientX - rect.left - SPLIT_DIVIDER_SIZE / 2
      const rawRatio = usableSize <= 0 ? paneRatioRef.current : pointerOffset / usableSize

      const nextRatio = clamp(rawRatio, 0.2, 0.8)
      setPaneRatio(nextRatio)
      paneRatioRef.current = nextRatio
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      const settingKey = ghostSplitOrientation === 'horizontal'
        ? 'ghostSplitRatioHorizontal'
        : 'ghostSplitRatioVertical'

      saveSetting(settingKey, paneRatioRef.current)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  async function handleExport(format) {
    if (!editor) return

    const markdown = editorToMarkdown(editor)

    function arrayBufferToBase64(buffer) {
      let binary = ''
      const bytes = new Uint8Array(buffer)
      const len = bytes.byteLength
      for (let index = 0; index < len; index += 1) {
        binary += String.fromCharCode(bytes[index])
      }
      return btoa(binary)
    }

    if (format === 'md') {
      await window.electron.exportFile(projectId, 'md', markdown)
      return
    }

    if (format === 'pdf') {
      const { exportToPDF } = await import('../utils/exporters')
      const arrayBuffer = await exportToPDF(editor.getHTML(), projectId)
      const base64 = arrayBufferToBase64(arrayBuffer)
      await window.electron.exportFile(projectId, 'pdf', base64)
      return
    }

    if (format === 'docx') {
      const { exportToDocx } = await import('../utils/exporters')
      const arrayBuffer = await exportToDocx(markdown, projectId)
      const base64 = arrayBufferToBase64(arrayBuffer)
      await window.electron.exportFile(projectId, 'docx', base64)
    }
  }

  const burstinessScore = writingMetrics.summary.burstiness.normalizedScore ?? 0
  const entropyScore = writingMetrics.summary.entropy.normalizedScore ?? 0
  const ngramCount = writingMetrics.summary.ngrams.repeatedPhraseCount ?? 0
  const hlsScore = writingMetrics.summary.hls.score ?? 0
  const hlsLabel = writingMetrics.summary.hls.band?.label || getHlsLabel(hlsScore)
  const hlsTone = getHlsTone(hlsScore)
  const hlsFillWidth = `${clamp(hlsScore, 0, 1) * 100}%`

  if (!editor) return null

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <em>I</em>
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolBtn>

        <div className={styles.sep} />

        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolBtn>

        <div className={styles.sep} />

        <ToolBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          •—
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          1.
        </ToolBtn>

        <div className={styles.exportGroup}>
          <span className={styles.exportLabel}>Export</span>
          <button className={styles.exportBtn} onClick={() => handleExport('md')} title="Export as Markdown">.md</button>
          <button className={styles.exportBtn} onClick={() => handleExport('pdf')} title="Export as PDF">.pdf</button>
          <button className={styles.exportBtn} onClick={() => handleExport('docx')} title="Export as Word">.docx</button>
        </div>
      </div>

      <div
        ref={splitViewRef}
        className={`${styles.splitView} ${ghostSplitOrientation === 'horizontal' ? styles.splitHorizontal : styles.splitVertical}`}
        style={{
          '--pane-ratio': String(paneRatio),
          '--pane-ratio-inverse': String(1 - paneRatio),
          '--split-divider-size': `${SPLIT_DIVIDER_SIZE}px`,
        }}
      >
        <div
          className={styles.pane}
        >
          <div
            ref={editorWrapRef}
            className={`${styles.editorWrap} ${nativeCaretHidden ? styles.editorWrapSmoothCaret : ''}`}
          >
            <EditorContent editor={editor} className={styles.editor} />
            <SmoothCaret caret={caret} />
          </div>
        </div>

        <div
          className={`${styles.divider} ${ghostSplitOrientation === 'horizontal' ? styles.dividerHorizontal : styles.dividerVertical}`}
          onMouseDown={handleSplitDragStart}
        >
          <div className={styles.dividerGrip} />
        </div>

        <div className={`${styles.pane} ${styles.ghostPaneWrap}`}>
          <GhostPane
            ghosts={ghosts}
            ghostSourceText={ghostSourceText}
            behavior={ghostBehavior}
            selectionMode={ghostSelectionMode}
            removedVisibility={ghostRemovedVisibility}
            annotations={annotations}
            onAnnotationsChange={handleAnnotationsChange}
            onRemoveSentences={handleRemoveSentences}
            showHighlights={settings.enableMiniLM !== false}
          />
        </div>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusMeta}>
          <div className={styles.metricsPanel}>
            <button
              type="button"
              className={`${styles.metricsToggle} ${metricsViewEnabled ? styles.metricsToggleActive : ''}`}
              onClick={() => setMetricsViewEnabled(enabled => !enabled)}
              aria-pressed={metricsViewEnabled}
              title="Toggle live metric highlights for the main writer"
            >
              Metrics view
            </button>

            <div className={styles.metricChip} title="Burstiness. Higher is better and means sentence lengths vary more naturally.">
              <span className={joinClasses(
                styles.metricChipDot,
                styles.metricChipDotBurstiness,
                styles[`metricChipDot${getBurstinessTone(burstinessScore).charAt(0).toUpperCase()}${getBurstinessTone(burstinessScore).slice(1)}`],
              )} />
              <span className={styles.metricChipBody}>
                <span className={styles.metricChipLabel}>Burstiness</span>
                <span className={styles.metricChipValue}>{burstinessScore.toFixed(2)}</span>
              </span>
            </div>

            <div className={styles.metricChip} title="Entropy. Higher is better and means word choice is more varied.">
              <span className={joinClasses(
                styles.metricChipDot,
                styles.metricChipDotEntropy,
                styles[`metricChipDot${getEntropyTone(entropyScore).charAt(0).toUpperCase()}${getEntropyTone(entropyScore).slice(1)}`],
              )} />
              <span className={styles.metricChipBody}>
                <span className={styles.metricChipLabel}>Entropy</span>
                <span className={styles.metricChipValue}>{entropyScore.toFixed(2)}</span>
              </span>
            </div>

            <div className={styles.metricChip} title="Repeated n-grams. Lower is better and means fewer repeated phrases.">
              <span className={joinClasses(
                styles.metricChipDot,
                styles.metricChipDotNgram,
                styles[`metricChipDot${getNgramTone(ngramCount).charAt(0).toUpperCase()}${getNgramTone(ngramCount).slice(1)}`],
              )} />
              <span className={styles.metricChipBody}>
                <span className={styles.metricChipLabel}>N-grams</span>
                <span className={styles.metricChipValue}>{ngramCount}</span>
              </span>
            </div>

            <div className={styles.hlsPanel} title="Human Likelihood Score. The meter fills from AI-like to strongly human-like.">
              <div className={styles.hlsHeader}>
                <div className={styles.hlsTitle}>HLS</div>
                <div className={styles.hlsReadout}>
                  <span className={styles.hlsValue}>{hlsScore.toFixed(2)}</span>
                  <span className={styles.hlsLabel}>{hlsLabel}</span>
                </div>
              </div>
              <div className={joinClasses(
                styles.hlsMeter,
                styles[`hlsMeter${hlsTone.charAt(0).toUpperCase()}${hlsTone.slice(1)}`],
              )} aria-hidden="true">
                <div className={styles.hlsMeterTrack} />
                <div
                  className={styles.hlsMeterFill}
                  style={{
                    width: hlsFillWidth,
                  }}
                />
                <span className={styles.hlsMarker} style={{ left: '35%' }} />
                <span className={styles.hlsMarker} style={{ left: '55%' }} />
                <span className={styles.hlsMarker} style={{ left: '75%' }} />
              </div>
              <div className={styles.hlsBands}>
                <span className={styles.hlsBand}>AI-like</span>
                <span className={styles.hlsBand}>Mixed</span>
                <span className={styles.hlsBand}>Human-like</span>
                <span className={styles.hlsBand}>Strongly human</span>
              </div>
            </div>
          </div>

          {metricsViewEnabled && (
            <div className={styles.metricsLegend} aria-label="Metrics highlight legend">
              <div className={styles.metricsLegendItem} title="Burstiness highlights sentences that differ from the document's average length.">
                <span className={`${styles.metricsLegendSwatch} ${styles.metricsLegendBurstiness}`} />
                <span className={styles.metricsLegendText}>Burstiness: sentence-length variance</span>
              </div>
              <div className={styles.metricsLegendItem} title="N-gram highlights repeated 3- and 4-word phrases in the text.">
                <span className={`${styles.metricsLegendSwatch} ${styles.metricsLegendNgram}`} />
                <span className={styles.metricsLegendText}>N-grams: repeated phrases</span>
              </div>
              <div className={styles.metricsLegendItem} title="Entropy highlights repeated words that lower vocabulary diversity.">
                <span className={`${styles.metricsLegendSwatch} ${styles.metricsLegendEntropy}`} />
                <span className={styles.metricsLegendText}>Entropy: low vocabulary diversity</span>
              </div>
            </div>
          )}

          {settings.enableMiniLM !== false && (
            <>
              <div className={styles.statusItem}>
                <div className={styles.statusDot} />
                {ghosts.length > 0 ? `${coveredCount} of ${visibleGhostCount} covered` : 'Ghost tracking idle'}
              </div>

              <div className={styles.statusSep} />
            </>
          )}

          <div className={styles.statusItem}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </div>

          {settings.enableMiniLM !== false && (
            <>
              <div className={styles.statusSep} />

              <div className={styles.legend}>
                <div className={styles.legendItem} title="High overlap">
                  <div className={styles.legendBlock} style={{ background: 'var(--ghost-g-bg)', border: '1px solid var(--ghost-g-text)' }} />
                  Covering
                </div>
                <div className={styles.legendItem} title="Strong overlap">
                  <div className={styles.legendBlock} style={{ background: 'var(--ghost-o-bg)', border: '1px solid var(--ghost-o-text)' }} />
                  Strong
                </div>
                <div className={styles.legendItem} title="Moderate overlap">
                  <div className={styles.legendBlock} style={{ background: 'var(--ghost-y-bg)', border: '1px solid var(--ghost-y-text)' }} />
                  Moderate
                </div>
                <div className={styles.legendItem} title="Not yet addressed">
                  <div className={styles.legendBlock} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)' }} />
                  Not yet
                </div>
              </div>

              <div className={styles.statusSep} />

              <div className={styles.statusItem}>
                {embedStatus === 'loading' && <span className={styles.badge}>Loading model...</span>}
                {embedStatus === 'ready' && <span className={styles.badge}>MiniLM ready</span>}
                {embedStatus.startsWith('error') && <span style={{ color: '#E24B4A', fontSize: 10 }}>{embedStatus}</span>}
              </div>
            </>
          )}

          <div className={styles.statusItem} style={{ marginLeft: 'auto' }}>
            {saved ? 'Saved' : 'Saving...'}
          </div>
        </div>
      </div>
    </div>
  )
}
