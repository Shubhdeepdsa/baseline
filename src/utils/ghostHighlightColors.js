export const GHOST_HIGHLIGHT_COLORS = [
  { id: 'amber', label: 'Amber' },
  { id: 'coral', label: 'Coral' },
  { id: 'peach', label: 'Peach' },
  { id: 'lime', label: 'Lime' },
  { id: 'mint', label: 'Mint' },
  { id: 'teal', label: 'Teal' },
  { id: 'sky', label: 'Sky' },
  { id: 'cobalt', label: 'Cobalt' },
  { id: 'violet', label: 'Violet' },
  { id: 'rose', label: 'Rose' },
]

export function getNextHighlightColorId(existingAnnotations = []) {
  return GHOST_HIGHLIGHT_COLORS[existingAnnotations.length % GHOST_HIGHLIGHT_COLORS.length].id
}
