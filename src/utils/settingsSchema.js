export const SETTINGS_SCHEMA = [
  {
    id: 'theme',
    category: 'Appearance',
    title: 'Theme',
    description: 'Switch between light and dark mode',
    type: 'theme-toggle',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
    searchTerms: ['light', 'dark', 'mode', 'appearance', 'color']
  },
  {
    id: 'enableMiniLM',
    category: 'AI & Matching',
    title: 'Enable AI Matching (MiniLM)',
    description: 'Use local AI to track sentence coverage. Disabling turns this into a basic editor.',
    type: 'boolean',
    default: true,
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
    searchTerms: ['ai', 'minilm', 'matching', 'basic', 'editor']
  },
  {
    id: 'enableIntellisense',
    category: 'AI & Matching',
    title: 'Ghost Intellisense',
    description: 'Show inline fuzzy word suggestions based on AI ghost text.',
    type: 'boolean',
    default: true,
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    searchTerms: ['autocomplete', 'intellisense', 'typing', 'suggestion', 'ghost']
  },
  {
    id: 'ghostSelectionMode',
    category: 'Ghost Text',
    title: 'Selection Mode',
    description: 'How ghost text matches your writing',
    type: 'select',
    options: [
      { value: 'sentence', label: 'Sentence Match' },
      { value: 'exact', label: 'Exact Match' }
    ],
    default: 'sentence',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`,
    searchTerms: ['ghost', 'selection', 'mode', 'sentence', 'exact']
  },
  {
    id: 'ghostSplitOrientation',
    category: 'Ghost Text',
    title: 'Layout Orientation',
    description: 'Split view arrangement between writing and ghost text',
    type: 'select',
    options: [
      { value: 'horizontal', label: 'Horizontal (Stacked)' },
      { value: 'vertical', label: 'Vertical (Side-by-side)' }
    ],
    default: 'horizontal',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="12" x2="21" y2="12"></line></svg>`,
    searchTerms: ['layout', 'split', 'horizontal', 'vertical', 'orientation']
  },
  {
    id: 'ghostBehavior',
    category: 'Ghost Text',
    title: 'After Covering',
    description: 'What happens to ghost text when you type it',
    type: 'select',
    options: [
      { value: 'hide', label: 'Hide' },
      { value: 'strike', label: 'Strike-through' },
      { value: 'none', label: 'Stay Visible' }
    ],
    default: 'hide',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    searchTerms: ['behavior', 'hide', 'strike', 'visible', 'cover']
  },
  {
    id: 'ghostRemovedVisibility',
    category: 'Ghost Text',
    title: 'Removed Visibility',
    description: 'How to show removed ghost sentences',
    type: 'select',
    options: [
      { value: 'show', label: 'Show with Strike-through' },
      { value: 'hide', label: 'Hide Completely' }
    ],
    default: 'show',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    searchTerms: ['removed', 'visibility', 'hide', 'strike', 'delete']
  }
]
