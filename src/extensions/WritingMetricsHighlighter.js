import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { getMetricHighlightDecorations } from '../utils/writingMetrics'

export const WritingMetricsPluginKey = new PluginKey('writingMetricsHighlighter')

function getDecorationAttrs(highlight) {
  const intensity = Math.max(0.08, Math.min(0.28, 0.08 + (highlight.severity || 0) * 0.20))

  if (highlight.metric === 'burstiness') {
    const base = highlight.tone === 'long'
      ? [245, 158, 11]
      : [59, 130, 246]
    const fill = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${intensity})`
    const accent = `rgba(${base[0]}, ${base[1]}, ${base[2]}, 0.92)`
    return {
      class: `writingMetricRange writingMetricRangeBurstiness writingMetricRangeBurstiness-${highlight.tone}`,
      style: `--writing-metric-fill: ${fill}; --writing-metric-accent: ${accent};`,
      title: `Burstiness: ${highlight.label}`,
    }
  }

  if (highlight.metric === 'ngram') {
    const fill = `rgba(34, 197, 94, ${intensity})`
    const accent = 'rgba(34, 197, 94, 0.95)'
    return {
      class: 'writingMetricRange writingMetricRangeNgram',
      style: `--writing-metric-fill: ${fill}; --writing-metric-accent: ${accent};`,
      title: `Repeated phrase: ${highlight.phrase}`,
    }
  }

  const fill = `rgba(236, 72, 153, ${intensity})`
  const accent = 'rgba(236, 72, 153, 0.95)'
  return {
    class: 'writingMetricRange writingMetricRangeEntropy',
    style: `--writing-metric-fill: ${fill}; --writing-metric-accent: ${accent};`,
    title: `Entropy signal: ${highlight.label}`,
  }
}

export const WritingMetricsHighlighter = Extension.create({
  name: 'writingMetricsHighlighter',

  addCommands() {
    return {
      setWritingMetrics: (payload) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta(WritingMetricsPluginKey, payload)
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: WritingMetricsPluginKey,
        state: {
          init: () => ({ enabled: false, analysis: null }),
          apply: (tr, value) => {
            const meta = tr.getMeta(WritingMetricsPluginKey)
            if (meta !== undefined) {
              return meta
            }
            return value
          },
        },
        props: {
          decorations: (state) => {
            const payload = WritingMetricsPluginKey.getState(state)
            if (!payload?.enabled || !payload.analysis?.highlights?.length) {
              return DecorationSet.empty
            }

            const decorationSpecs = getMetricHighlightDecorations(state.doc, payload.analysis)
            if (decorationSpecs.length === 0) return DecorationSet.empty

            const decorations = decorationSpecs.map((highlight) => (
              Decoration.inline(highlight.from, highlight.to, getDecorationAttrs(highlight))
            ))

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
