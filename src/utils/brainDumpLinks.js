export const WIKI_LINK_REGEX = /\[\[([^[\]]+?)\]\]/g
const MENTION_TRIGGER_REGEX = /(?:^|[\s([{"'])@([^\s@[\]]*)$/

export function slugifyBrainDumpName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function brainDumpNameFromFilename(filename) {
  return filename.replace(/\.md$/, '').replace(/-/g, ' ')
}

export function resolveBrainDumpLink(label, dumps) {
  const slug = slugifyBrainDumpName(label)
  if (!slug) return null

  return dumps.find(dump => dump.filename === `${slug}.md`) || null
}

export function findBrainDumpAutocompleteMatch(editor) {
  if (!editor) return null

  const { state } = editor
  const { selection } = state
  const { empty, from, $from } = selection

  if (!empty || !$from.parent.isTextblock) {
    return null
  }

  const beforeText = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0')
  const matches = []

  const wikiStart = beforeText.lastIndexOf('[[')
  if (wikiStart !== -1) {
    const query = beforeText.slice(wikiStart + 2)
    const isValidWikiQuery = !query.includes(']') && !query.includes('[[')

    if (isValidWikiQuery) {
      matches.push({
        trigger: '[[',
        query,
        from: from - query.length - 2,
        to: from,
      })
    }
  }

  const mentionMatch = beforeText.match(MENTION_TRIGGER_REGEX)
  if (mentionMatch) {
    const query = mentionMatch[1] || ''
    matches.push({
      trigger: '@',
      query,
      from: from - query.length - 1,
      to: from,
    })
  }

  if (matches.length === 0) {
    return null
  }

  return matches.sort((a, b) => b.from - a.from)[0]
}
