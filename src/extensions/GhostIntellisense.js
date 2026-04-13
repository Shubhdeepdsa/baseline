import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const GhostIntellisensePluginKey = new PluginKey('ghostIntellisense')

export const GhostIntellisense = Extension.create({
  name: 'ghostIntellisense',

  addCommands() {
    return {
      setGhostSuggestion: (suggestion) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta(GhostIntellisensePluginKey, suggestion)
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: GhostIntellisensePluginKey,
        state: {
          init: () => '',
          apply: (tr, value) => {
            const meta = tr.getMeta(GhostIntellisensePluginKey)
            if (meta !== undefined) {
              return meta
            }
            // Clear suggestion if the user types or selection changes
            if (tr.docChanged || tr.selectionSet) {
              return ''
            }
            return value
          },
        },
        props: {
          decorations: (state) => {
            const suggestion = GhostIntellisensePluginKey.getState(state)
            if (!suggestion) return DecorationSet.empty

            const { selection } = state
            if (!selection.empty) return DecorationSet.empty

            const widget = document.createElement('span')
            widget.classList.add('ghost-suggestion')
            widget.textContent = suggestion
            // Styles to make it look like ghost text
            widget.style.color = 'var(--ghost-y-text, #a3a3a3)'
            widget.style.opacity = '0.6'
            widget.style.pointerEvents = 'none'

            const decoration = Decoration.widget(selection.$head.pos, widget, {
              side: 1,
            })

            return DecorationSet.create(state.doc, [decoration])
          },
          handleKeyDown: (view, event) => {
            const suggestion = GhostIntellisensePluginKey.getState(view.state)
            if (event.key === 'Tab' && suggestion) {
              // Insert the suggestion
              const tr = view.state.tr
              tr.insertText(suggestion, view.state.selection.to)
              tr.setMeta(GhostIntellisensePluginKey, '') // clear it
              view.dispatch(tr)
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
