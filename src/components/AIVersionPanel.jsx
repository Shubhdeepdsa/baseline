import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownPreview from './MarkdownPreview'
import styles from './AIVersionPanel.module.css'
import {
  applyTextChangeToSegments,
  buildDerivedSegments,
  charRangeToLineRange,
  createSegmentId,
  getLineNumberFromCursor,
  getSegmentsForLine,
  hydrateSegmentsFromProvenance,
  insertTrackedSegment,
  parseVersionInfo,
  serializeSegmentsForPersistence,
} from '../utils/versionProvenance'

function formatDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) {
    return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diffHours < 48) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function SourcePane({
  title,
  content,
  tab,
  onTabChange,
  onClose,
  showClose,
  sourceSelection,
  onInsertSelection,
  allowInsert,
  textAreaRef,
  lineNumberRef,
  onSelectionChange,
  onScroll,
  highlightRange,
}) {
  const lines = (content || '').split('\n')

  return (
    <div className={styles.sourcePane}>
      <div className={styles.sourceHeader}>
        <div>
          <div className={styles.sourceLabel}>Source</div>
          <div className={styles.sourceTitle}>{title || 'Select a saved version'}</div>
        </div>

        <div className={styles.sourceHeaderRight}>
          <div className={styles.sourceTabs}>
            <button
              className={`${styles.sourceTabBtn} ${tab === 'preview' ? styles.sourceTabBtnActive : ''}`}
              onClick={() => onTabChange('preview')}
              type="button"
            >
              Preview
            </button>
            <button
              className={`${styles.sourceTabBtn} ${tab === 'source' ? styles.sourceTabBtnActive : ''}`}
              onClick={() => onTabChange('source')}
              type="button"
            >
              Source
            </button>
          </div>

          {allowInsert && (
            <button
              className={styles.insertBtn}
              onClick={onInsertSelection}
              disabled={!sourceSelection?.text}
              type="button"
            >
              {sourceSelection?.text ? `Insert lines ${sourceSelection.startLine}-${sourceSelection.endLine}` : 'Select text to insert'}
            </button>
          )}

          {showClose && (
            <button className={styles.ghostActionBtn} onClick={onClose} type="button">
              Close source
            </button>
          )}
        </div>
      </div>

      {tab === 'preview' ? (
        <div className={styles.sourcePreviewWrap}>
          {content ? (
            <MarkdownPreview className={`${styles.markdownSurface} ${styles.sourcePreview}`} content={content} />
          ) : (
            <div className={styles.previewEmpty}>Select a version from the list to use it as a source</div>
          )}
        </div>
      ) : (
        <div className={styles.sourceTextWrap}>
          <div className={styles.lineNumbers} ref={lineNumberRef}>
            {lines.map((_, index) => {
              const lineNumber = index + 1
              const isHighlighted =
                highlightRange &&
                lineNumber >= highlightRange.startLine &&
                lineNumber <= highlightRange.endLine

              return (
                <div
                  key={lineNumber}
                  className={`${styles.lineNumber} ${isHighlighted ? styles.lineNumberHighlighted : ''}`}
                >
                  {lineNumber}
                </div>
              )
            })}
          </div>

          <textarea
            ref={textAreaRef}
            className={styles.sourceTextarea}
            value={content}
            readOnly
            spellCheck="false"
            onSelect={onSelectionChange}
            onScroll={onScroll}
          />
        </div>
      )}
    </div>
  )
}

function ProvenanceRail({ segments, text, versionsByFilename, inspectedId, onInspect }) {
  if (!segments.length) return null

  return (
    <div className={styles.provenanceRail}>
      <div className={styles.provenanceRailTitle}>Tracked blocks</div>
      <div className={styles.provenanceRailList}>
        {segments.map((segment) => {
          const lineRange = charRangeToLineRange(text, segment.start, segment.end)
          const sourceRecord = versionsByFilename.get(segment.sourceFilename)
          const sourceInfo = parseVersionInfo(segment.sourceFilename)
          const sourceLabel = sourceRecord?.label || (sourceInfo.versionNumber ? `v${sourceInfo.versionNumber}` : segment.sourceFilename)

          return (
            <button
              key={segment.id}
              className={`${styles.provenanceChip} ${inspectedId === segment.id ? styles.provenanceChipActive : ''}`}
              onClick={() => onInspect(segment.id)}
              type="button"
            >
              <span>{`L${lineRange.currentLineStart}-${lineRange.currentLineEnd}`}</span>
              <span>{`${sourceLabel} · L${segment.sourceStartLine}-${segment.sourceEndLine}`}</span>
              {segment.edited && <span className={styles.editedPill}>edited</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ProvenanceInspectPanel({ segment, text, versionsByFilename, onJump }) {
  if (!segment) return null

  const lineRange = charRangeToLineRange(text, segment.start, segment.end)
  const sourceRecord = versionsByFilename.get(segment.sourceFilename)
  const sourceInfo = parseVersionInfo(segment.sourceFilename)
  const currentSnippet = text.slice(segment.start, segment.end).trim() || '(empty)'

  return (
    <div className={styles.inspectPanel}>
      <div className={styles.inspectLabel}>Line provenance</div>
      <div className={styles.inspectTitle}>
        {sourceRecord?.label || (sourceInfo.versionNumber ? `Version ${sourceInfo.versionNumber}` : segment.sourceFilename)}
      </div>
      <div className={styles.inspectMeta}>
        <span>{`Current lines ${lineRange.currentLineStart}-${lineRange.currentLineEnd}`}</span>
        <span>{`Source lines ${segment.sourceStartLine}-${segment.sourceEndLine}`}</span>
        <span>{segment.edited ? 'Edited from source' : 'Unchanged from source'}</span>
      </div>

      <div className={styles.inspectSnippets}>
        <div>
          <div className={styles.inspectSnippetLabel}>Original inserted text</div>
          <pre className={styles.inspectSnippet}>{segment.originalText || '(empty)'}</pre>
        </div>
        <div>
          <div className={styles.inspectSnippetLabel}>Current text</div>
          <pre className={styles.inspectSnippet}>{currentSnippet}</pre>
        </div>
      </div>

      <button className={styles.jumpBtn} onClick={() => onJump(segment)} type="button">
        Go to source
      </button>
    </div>
  )
}

export default function AIVersionPanel({ projectId, activeVersionFilename, onActiveVersionChange }) {
  const [versions, setVersions] = useState([])
  const [selectedVersionFilename, setSelectedVersionFilename] = useState(null)
  const [selectedContent, setSelectedContent] = useState('')
  const [selectedSegments, setSelectedSegments] = useState([])

  const [sourceVersionFilename, setSourceVersionFilename] = useState(null)
  const [sourceContent, setSourceContent] = useState('')
  const [sourceTab, setSourceTab] = useState('preview')
  const [sourceSelection, setSourceSelection] = useState(null)
  const [sourcePaneVisible, setSourcePaneVisible] = useState(false)
  const [sourceHighlight, setSourceHighlight] = useState(null)

  const [workspaceMode, setWorkspaceMode] = useState('preview')
  const [editingSourceFilename, setEditingSourceFilename] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [draftSegments, setDraftSegments] = useState([])
  const [draftCursor, setDraftCursor] = useState({ start: 0, end: 0 })

  const [pasteContent, setPasteContent] = useState('')
  const [showPasteArea, setShowPasteArea] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showProvenance, setShowProvenance] = useState(false)
  const [inspectedSegmentId, setInspectedSegmentId] = useState(null)

  const draftTextareaRef = useRef(null)
  const sourceTextareaRef = useRef(null)
  const sourceLineNumberRef = useRef(null)
  const draftLineNumberRef = useRef(null)

  const versionsByFilename = useMemo(
    () => new Map(versions.map(version => [version.filename, version])),
    [versions]
  )

  const selectedVersion = versionsByFilename.get(selectedVersionFilename)
  const sourceVersion = versionsByFilename.get(sourceVersionFilename)
  const highlightedListFilename = workspaceMode === 'preview' ? selectedVersionFilename : sourceVersionFilename
  const showSourcePane = workspaceMode === 'master' || workspaceMode === 'derived' || sourcePaneVisible
  const activeText = workspaceMode === 'preview' ? selectedContent : draftText
  const activeSegments = workspaceMode === 'preview' ? selectedSegments : draftSegments
  const inspectedSegment = activeSegments.find(segment => segment.id === inspectedSegmentId) || null
  const draftLineNumber = workspaceMode === 'preview' ? null : getLineNumberFromCursor(draftText, draftCursor.start)
  const currentLineSegments = workspaceMode === 'preview' ? [] : getSegmentsForLine(draftSegments, draftLineNumber, draftText)

  useEffect(() => {
    setShowCreateMenu(false)
  }, [workspaceMode])

  useEffect(() => {
    if (!activeSegments.length) {
      setShowProvenance(false)
      setInspectedSegmentId(null)
      return
    }

    if (inspectedSegmentId && !activeSegments.find(segment => segment.id === inspectedSegmentId)) {
      setInspectedSegmentId(null)
    }
  }, [activeSegments, inspectedSegmentId])

  useEffect(() => {
    if (!sourceHighlight || sourceTab !== 'source' || !sourceTextareaRef.current) return

    const textarea = sourceTextareaRef.current
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 22
    const targetTop = Math.max(0, (sourceHighlight.startLine - 2) * lineHeight)
    textarea.scrollTop = targetTop
    if (sourceLineNumberRef.current) {
      sourceLineNumberRef.current.scrollTop = targetTop
    }

    const timer = window.setTimeout(() => setSourceHighlight(null), 1800)
    return () => window.clearTimeout(timer)
  }, [sourceHighlight, sourceTab])

  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    async function init() {
      setWorkspaceMode('preview')
      setShowPasteArea(false)
      setPasteContent('')
      setDraftText('')
      setDraftSegments([])
      setDraftCursor({ start: 0, end: 0 })
      setSourcePaneVisible(false)
      setSourceVersionFilename(null)
      setSourceContent('')
      setSourceSelection(null)
      setSourceHighlight(null)
      setEditingSourceFilename(null)
      setShowProvenance(false)
      setInspectedSegmentId(null)

      const list = await window.electron.getVersions(projectId)
      if (cancelled) return
      setVersions(list)

      if (list.length === 0) {
        setSelectedVersionFilename(null)
        setSelectedContent('')
        setSelectedSegments([])
        return
      }

      const nextFilename = list.find(version => version.filename === activeVersionFilename)?.filename || list[0].filename
      await selectPreviewVersion(nextFilename)
    }

    init()

    return () => {
      cancelled = true
    }
  }, [projectId])

  async function refreshVersions() {
    const list = await window.electron.getVersions(projectId)
    setVersions(list)
    return list
  }

  async function readVersionSnapshot(filename) {
    const result = await window.electron.readVersion(projectId, filename)
    const content = result.content || ''

    return {
      content,
      segments: hydrateSegmentsFromProvenance(result.provenance, content),
      kind: result.kind,
    }
  }

  async function selectPreviewVersion(filename) {
    if (!filename) return

    const snapshot = await readVersionSnapshot(filename)
    setSelectedVersionFilename(filename)
    setSelectedContent(snapshot.content)
    setSelectedSegments(snapshot.segments)
    setInspectedSegmentId(null)
  }

  async function selectSourceVersion(filename, { openPane = true } = {}) {
    if (!filename) return

    const snapshot = await readVersionSnapshot(filename)
    setSourceVersionFilename(filename)
    setSourceContent(snapshot.content)
    setSourceSelection(null)
    if (openPane) {
      setSourcePaneVisible(true)
    }
  }

  async function handleSetActive(filename) {
    await window.electron.saveFile(projectId, 'active-version', filename)
    if (onActiveVersionChange) {
      onActiveVersionChange(filename)
    }
  }

  async function handleDeleteVersion(filename, event) {
    event.stopPropagation()

    await window.electron.deleteVersion(projectId, filename)
    const list = await refreshVersions()

    if (filename === activeVersionFilename) {
      const nextActive = list[0]?.filename || ''
      await window.electron.saveFile(projectId, 'active-version', nextActive)
      if (nextActive && onActiveVersionChange) {
        onActiveVersionChange(nextActive)
      }
    }

    if (list.length === 0) {
      if (filename === activeVersionFilename && onActiveVersionChange) {
        onActiveVersionChange('')
      }
      setSelectedVersionFilename(null)
      setSelectedContent('')
      setSelectedSegments([])
      setSourceVersionFilename(null)
      setSourceContent('')
      return
    }

    if (workspaceMode === 'preview') {
      const nextPreview = list.find(version => version.filename === selectedVersionFilename)?.filename || list[0].filename
      await selectPreviewVersion(nextPreview)
      return
    }

    const nextSource = list.find(version => version.filename === sourceVersionFilename)?.filename || list[0].filename
    await selectSourceVersion(nextSource, { openPane: showSourcePane })

    if (!list.find(version => version.filename === selectedVersionFilename)) {
      await selectPreviewVersion(list[0].filename)
    }
  }

  async function handleCopy() {
    if (!selectedContent) return
    try {
      await navigator.clipboard.writeText(selectedContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy text: ', error)
    }
  }

  async function handleSaveFullVersion() {
    if (!pasteContent.trim()) return

    const newVersion = await window.electron.saveVersion(projectId, {
      content: pasteContent,
      kind: 'full',
    })

    await window.electron.saveFile(projectId, 'active-version', newVersion.filename)
    if (onActiveVersionChange) {
      onActiveVersionChange(newVersion.filename)
    }

    setPasteContent('')
    setShowPasteArea(false)
    const list = await refreshVersions()
    if (list.find(version => version.filename === newVersion.filename)) {
      await selectPreviewVersion(newVersion.filename)
    }
  }

  async function startMasterGhost() {
    setShowCreateMenu(false)
    setShowPasteArea(false)
    setWorkspaceMode('master')
    setDraftText('')
    setDraftSegments([])
    setDraftCursor({ start: 0, end: 0 })
    setEditingSourceFilename(null)
    setShowProvenance(false)
    setInspectedSegmentId(null)

    const initialSource = sourceVersionFilename || selectedVersionFilename || activeVersionFilename || versions[0]?.filename || null
    if (initialSource) {
      await selectSourceVersion(initialSource, { openPane: true })
    } else {
      setSourcePaneVisible(true)
      setSourceVersionFilename(null)
      setSourceContent('')
    }
  }

  async function startDerivedEdit() {
    if (!selectedVersionFilename || !selectedContent) return

    setWorkspaceMode('derived')
    setEditingSourceFilename(selectedVersionFilename)
    setDraftText(selectedContent)
    setDraftCursor({ start: 0, end: 0 })
    setDraftSegments(
      selectedSegments.length
        ? selectedSegments.map(segment => ({ ...segment }))
        : buildDerivedSegments(selectedVersionFilename, selectedContent)
    )
    setSourcePaneVisible(true)
    setSourceTab('preview')
    setSourceSelection(null)
    setShowProvenance(selectedSegments.length > 0)
    setInspectedSegmentId(null)
    await selectSourceVersion(selectedVersionFilename, { openPane: true })
  }

  function cancelWorkspace() {
    setWorkspaceMode('preview')
    setDraftText('')
    setDraftSegments([])
    setDraftCursor({ start: 0, end: 0 })
    setEditingSourceFilename(null)
    setSourcePaneVisible(false)
    setSourceSelection(null)
    setSourceHighlight(null)
    setShowProvenance(selectedSegments.length > 0)
    setInspectedSegmentId(null)
  }

  async function saveDraft(kind) {
    if (!draftText.trim()) return

    const provenance = serializeSegmentsForPersistence(draftSegments, draftText)
    const newVersion = await window.electron.saveVersion(projectId, {
      content: draftText,
      kind,
      sourceFilename: editingSourceFilename,
      provenance,
    })

    const list = await refreshVersions()
    if (list.find(version => version.filename === newVersion.filename)) {
      await selectPreviewVersion(newVersion.filename)
    }

    setWorkspaceMode('preview')
    setDraftText('')
    setDraftSegments([])
    setDraftCursor({ start: 0, end: 0 })
    setSourcePaneVisible(false)
    setSourceSelection(null)
    setSourceHighlight(null)
    setEditingSourceFilename(null)
    setShowProvenance(true)
    setInspectedSegmentId(null)
  }

  function handleSourceSelectionChange(event) {
    const textarea = event.currentTarget
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start
    const text = sourceContent.slice(start, end)

    if (!text) {
      setSourceSelection(null)
      return
    }

    const lineRange = charRangeToLineRange(sourceContent, start, end)
    setSourceSelection({
      text,
      start,
      end,
      startLine: lineRange.currentLineStart,
      endLine: lineRange.currentLineEnd,
    })
  }

  function handleInsertSelection() {
    if (!sourceSelection?.text) return

    const selectionStart = draftTextareaRef.current?.selectionStart ?? draftCursor.start ?? draftText.length
    const selectionEnd = draftTextareaRef.current?.selectionEnd ?? draftCursor.end ?? selectionStart
    const next = insertTrackedSegment({
      text: draftText,
      segments: draftSegments,
      selectionStart,
      selectionEnd,
      insertText: sourceSelection.text,
      provenance: {
        id: createSegmentId(),
        sourceFilename: sourceVersionFilename,
        sourceStartLine: sourceSelection.startLine,
        sourceEndLine: sourceSelection.endLine,
      },
    })

    setDraftText(next.text)
    setDraftSegments(next.segments)
    const cursor = selectionStart + sourceSelection.text.length
    setDraftCursor({ start: cursor, end: cursor })
    setShowProvenance(true)

    window.requestAnimationFrame(() => {
      if (!draftTextareaRef.current) return
      draftTextareaRef.current.focus()
      draftTextareaRef.current.selectionStart = cursor
      draftTextareaRef.current.selectionEnd = cursor
    })
  }

  function handleDraftChange(event) {
    const nextText = event.target.value
    setDraftSegments(prev => applyTextChangeToSegments(prev, draftText, nextText))
    setDraftText(nextText)
    setDraftCursor({
      start: event.target.selectionStart ?? 0,
      end: event.target.selectionEnd ?? 0,
    })
  }

  function handleDraftSelect(event) {
    setDraftCursor({
      start: event.currentTarget.selectionStart ?? 0,
      end: event.currentTarget.selectionEnd ?? 0,
    })
  }

  async function handleJumpToSource(segment) {
    if (!segment?.sourceFilename) return

    setSourceTab('source')
    setSourcePaneVisible(true)
    setSourceSelection(null)
    await selectSourceVersion(segment.sourceFilename, { openPane: true })
    setSourceHighlight({
      startLine: segment.sourceStartLine,
      endLine: segment.sourceEndLine,
    })
  }

  async function handleVersionClick(version) {
    if (workspaceMode === 'preview') {
      await selectPreviewVersion(version.filename)
      return
    }

    await selectSourceVersion(version.filename, { openPane: true })
  }

  function handleSourceScroll(event) {
    if (!sourceLineNumberRef.current) return
    sourceLineNumberRef.current.scrollTop = event.currentTarget.scrollTop
  }

  function handleDraftScroll(event) {
    if (!draftLineNumberRef.current) return
    draftLineNumberRef.current.scrollTop = event.currentTarget.scrollTop
  }

  const draftLineNumbers = draftText.split('\n')

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.header}>
          <span className={styles.title}>AI versions</span>
          <div className={styles.menuWrap}>
            <button
              className={styles.plusBtn}
              onClick={() => setShowCreateMenu(prev => !prev)}
              type="button"
            >
              +
            </button>

            {showCreateMenu && (
              <div className={styles.menu}>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setShowCreateMenu(false)
                    setShowPasteArea(true)
                  }}
                  type="button"
                >
                  Save full version
                </button>
                <button
                  className={styles.menuItem}
                  onClick={startMasterGhost}
                  type="button"
                >
                  Create master ghost
                </button>
              </div>
            )}
          </div>
        </div>

        {showPasteArea && (
          <div className={styles.pasteArea}>
            <textarea
              className={styles.pasteTextarea}
              value={pasteContent}
              onChange={event => setPasteContent(event.target.value)}
              placeholder="Paste the full AI response here..."
              autoFocus
            />
            <div className={styles.pasteActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setShowPasteArea(false)
                  setPasteContent('')
                }}
                type="button"
              >
                Cancel
              </button>
              <button className={styles.confirmBtn} onClick={handleSaveFullVersion} type="button">
                Save full version
              </button>
            </div>
          </div>
        )}

        <div className={styles.versionList}>
          {versions.length === 0 && (
            <div className={styles.empty}>
              No versions yet. Save a full version first, then build derived or master ghosts from it.
            </div>
          )}

          {versions.map((version) => (
            <div
              key={version.filename}
              className={`${styles.versionItem} ${highlightedListFilename === version.filename ? styles.selected : ''}`}
              onClick={() => handleVersionClick(version)}
            >
              <div className={styles.versionLeft}>
                <span className={`${styles.badge} ${activeVersionFilename === version.filename ? styles.activeBadge : styles.inactiveBadge}`}>
                  v{version.versionNumber || '?'}{activeVersionFilename === version.filename ? ' active' : ''}
                </span>
                <div className={styles.versionMeta}>
                  <div className={styles.versionLabel}>{version.label || `Version ${version.versionNumber}`}</div>
                  <div className={styles.versionSubtitle}>{version.subtitle}</div>
                  <div className={styles.versionDate}>{formatDate(version.createdAt)}</div>
                </div>
              </div>

              <div className={styles.versionRight}>
                {activeVersionFilename === version.filename ? (
                  <span className={styles.ghostLabel}>ghost source</span>
                ) : (
                  <button
                    className={styles.setActiveBtn}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSetActive(version.filename)
                    }}
                    type="button"
                  >
                    Set active
                  </button>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={(event) => handleDeleteVersion(version.filename, event)}
                  title="Delete version"
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.right}>
        {showSourcePane ? (
          <div className={styles.workspaceGrid}>
            <SourcePane
              title={sourceVersion?.label}
              content={sourceContent}
              tab={sourceTab}
              onTabChange={setSourceTab}
              showClose={workspaceMode === 'preview'}
              onClose={() => setSourcePaneVisible(false)}
              sourceSelection={sourceSelection}
              onInsertSelection={handleInsertSelection}
              allowInsert={workspaceMode === 'master'}
              textAreaRef={sourceTextareaRef}
              lineNumberRef={sourceLineNumberRef}
              onSelectionChange={handleSourceSelectionChange}
              onScroll={handleSourceScroll}
              highlightRange={sourceHighlight}
            />

            <div className={styles.previewPane}>
              {workspaceMode === 'preview' ? (
                <>
                  <div className={styles.previewHeader}>
                    <div>
                      <div className={styles.previewEyebrow}>AI version</div>
                      <span className={styles.previewTitle}>{selectedVersion?.label || 'Preview'}</span>
                    </div>

                    <div className={styles.previewActions}>
                      {activeSegments.length > 0 && (
                        <button
                          className={`${styles.ghostActionBtn} ${showProvenance ? styles.ghostActionBtnActive : ''}`}
                          onClick={() => setShowProvenance(prev => !prev)}
                          type="button"
                        >
                          {showProvenance ? 'Hide provenance' : 'Show provenance'}
                        </button>
                      )}
                      <button className={styles.ghostActionBtn} onClick={startDerivedEdit} disabled={!selectedContent} type="button">
                        Edit as new version
                      </button>
                      <button
                        className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                        onClick={handleCopy}
                        type="button"
                      >
                        {copied ? 'Copied!' : 'Copy markdown'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.previewContentArea}>
                    <div className={styles.previewMain}>
                      {selectedContent ? (
                        <MarkdownPreview className={`${styles.markdownSurface} ${styles.preview}`} content={selectedContent} />
                      ) : (
                        <div className={styles.previewEmpty}>Select a version to preview it</div>
                      )}
                    </div>

                    {showProvenance && (
                      <div className={styles.sidePanel}>
                        <ProvenanceRail
                          segments={selectedSegments}
                          text={selectedContent}
                          versionsByFilename={versionsByFilename}
                          inspectedId={inspectedSegmentId}
                          onInspect={setInspectedSegmentId}
                        />
                        <ProvenanceInspectPanel
                          segment={inspectedSegment}
                          text={selectedContent}
                          versionsByFilename={versionsByFilename}
                          onJump={handleJumpToSource}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.previewHeader}>
                    <div>
                      <div className={styles.previewEyebrow}>
                        {workspaceMode === 'master' ? 'Master ghost' : 'Derived version'}
                      </div>
                      <span className={styles.previewTitle}>
                        {workspaceMode === 'master' ? 'Compose a new ghost' : `Editing from ${versionsByFilename.get(editingSourceFilename)?.label || 'source'}`}
                      </span>
                    </div>

                    <div className={styles.previewActions}>
                      {activeSegments.length > 0 && (
                        <button
                          className={`${styles.ghostActionBtn} ${showProvenance ? styles.ghostActionBtnActive : ''}`}
                          onClick={() => setShowProvenance(prev => !prev)}
                          type="button"
                        >
                          {showProvenance ? 'Hide provenance' : 'Show provenance'}
                        </button>
                      )}
                      {currentLineSegments.length > 0 && (
                        <button
                          className={styles.ghostActionBtn}
                          onClick={() => setInspectedSegmentId(currentLineSegments[0].id)}
                          type="button"
                        >
                          Inspect current line
                        </button>
                      )}
                      <button className={styles.cancelBtn} onClick={cancelWorkspace} type="button">
                        Cancel
                      </button>
                      <button
                        className={styles.confirmBtn}
                        onClick={() => saveDraft(workspaceMode === 'master' ? 'master' : 'derived')}
                        type="button"
                      >
                        {workspaceMode === 'master' ? 'Save master ghost' : 'Create new version'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.editorGrid}>
                    <div className={styles.editorShell}>
                      <div className={styles.editorLabel}>Markdown draft</div>
                      <div className={styles.editorFrame}>
                        <div className={styles.lineNumbers} ref={draftLineNumberRef}>
                          {draftLineNumbers.map((_, index) => (
                            <div key={index} className={styles.lineNumber}>
                              {index + 1}
                            </div>
                          ))}
                        </div>
                        <textarea
                          ref={draftTextareaRef}
                          className={styles.editorTextarea}
                          value={draftText}
                          onChange={handleDraftChange}
                          onSelect={handleDraftSelect}
                          onScroll={handleDraftScroll}
                          placeholder={workspaceMode === 'master' ? 'Build your master ghost here...' : 'Refine this version here...'}
                          spellCheck="false"
                        />
                      </div>
                    </div>

                    <div className={styles.editorPreviewWrap}>
                      <div className={styles.editorLabel}>Rendered preview</div>
                      <MarkdownPreview className={`${styles.markdownSurface} ${styles.editorPreview}`} content={draftText} />
                    </div>

                    {showProvenance && (
                      <div className={styles.sidePanel}>
                        <ProvenanceRail
                          segments={draftSegments}
                          text={draftText}
                          versionsByFilename={versionsByFilename}
                          inspectedId={inspectedSegmentId}
                          onInspect={setInspectedSegmentId}
                        />
                        <ProvenanceInspectPanel
                          segment={inspectedSegment}
                          text={draftText}
                          versionsByFilename={versionsByFilename}
                          onJump={handleJumpToSource}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : selectedContent ? (
          <>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.previewEyebrow}>AI version</div>
                <span className={styles.previewTitle}>{selectedVersion?.label || 'Preview'}</span>
              </div>

              <div className={styles.previewActions}>
                {selectedSegments.length > 0 && (
                  <button
                    className={`${styles.ghostActionBtn} ${showProvenance ? styles.ghostActionBtnActive : ''}`}
                    onClick={() => setShowProvenance(prev => !prev)}
                    type="button"
                  >
                    {showProvenance ? 'Hide provenance' : 'Show provenance'}
                  </button>
                )}
                <button className={styles.ghostActionBtn} onClick={startDerivedEdit} type="button">
                  Edit as new version
                </button>
                <button
                  className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                  onClick={handleCopy}
                  type="button"
                >
                  {copied ? 'Copied!' : 'Copy markdown'}
                </button>
              </div>
            </div>

            <div className={styles.previewContentArea}>
              <div className={styles.previewMain}>
                <MarkdownPreview className={`${styles.markdownSurface} ${styles.preview}`} content={selectedContent} />
              </div>

              {showProvenance && (
                <div className={styles.sidePanel}>
                  <ProvenanceRail
                    segments={selectedSegments}
                    text={selectedContent}
                    versionsByFilename={versionsByFilename}
                    inspectedId={inspectedSegmentId}
                    onInspect={setInspectedSegmentId}
                  />
                  <ProvenanceInspectPanel
                    segment={inspectedSegment}
                    text={selectedContent}
                    versionsByFilename={versionsByFilename}
                    onJump={handleJumpToSource}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.previewEmpty}>Select a version to preview it</div>
        )}
      </div>
    </div>
  )
}
