import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { WIKI_LINK_REGEX } from './brainDumpLinks'

export const wikiLinkPluginKey = new PluginKey('brainDumpWikiLinks')
export const WIKI_LINK_REFRESH_META = 'brainDumpWikiLinksRefresh'

function createDecorations(doc, resolveLink) {
  const decorations = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return

    WIKI_LINK_REGEX.lastIndex = 0
    let match = WIKI_LINK_REGEX.exec(node.text)

    while (match) {
      const from = pos + match.index
      const to = from + match[0].length
      const resolved = resolveLink(match[1].trim())

      decorations.push(
        Decoration.inline(from, to, {
          class: resolved ? 'brainDumpWikiLink' : 'brainDumpWikiLink brainDumpWikiLinkBroken',
          'data-brain-dump-link': resolved ? 'true' : 'false',
          'data-filename': resolved?.filename || '',
          title: resolved ? `Open ${resolved.name}` : 'No matching brain dump',
        }),
      )

      match = WIKI_LINK_REGEX.exec(node.text)
    }
  })

  return DecorationSet.create(doc, decorations)
}

export function createWikiLinkExtension({ resolveLink, onNavigate }) {
  return Extension.create({
    name: 'brainDumpWikiLinks',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: wikiLinkPluginKey,
          state: {
            init: (_, state) => createDecorations(state.doc, resolveLink),
            apply: (transaction, oldState, _oldEditorState, newEditorState) => {
              if (transaction.docChanged || transaction.getMeta(WIKI_LINK_REFRESH_META)) {
                return createDecorations(newEditorState.doc, resolveLink)
              }

              return oldState.map(transaction.mapping, transaction.doc)
            },
          },
          props: {
            decorations(state) {
              return this.getState(state)
            },
            handleClick(view, _pos, event) {
              const target = event.target instanceof Element
                ? event.target.closest('[data-brain-dump-link="true"]')
                : null

              const filename = target?.getAttribute('data-filename')
              if (!filename) return false

              event.preventDefault()
              onNavigate(filename)
              return true
            },
          },
        }),
      ]
    },
  })
}
