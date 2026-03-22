// Cosine similarity between two Float32Array embedding vectors
export function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Classify similarity into a highlight state
// Returns: 'dim' | 'yellow' | 'orange' | 'green'
export function similarityToState(sim) {
  if (sim >= 0.70) return 'green'
  if (sim >= 0.50) return 'orange'
  if (sim >= 0.30) return 'yellow'
  return 'dim'
}

// Threshold above which a completed sentence is considered to "cover" a ghost
export const COVER_THRESHOLD = 0.42
