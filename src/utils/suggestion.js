export function extractVocabulary(text) {
  if (!text) return [];
  const words = text.split(/[^a-zA-Z0-9'-]+/);
  const vocab = new Map();
  for (const w of words) {
    if (w.length > 3) {
      vocab.set(w.toLowerCase(), w); // store original casing
    }
  }
  return vocab; // Map of lowercase -> original
}

export function getWordSuggestion(typedText, ghostText) {
  if (!typedText || !ghostText) return '';
  
  // Find the word the user is currently typing
  const match = typedText.match(/([a-zA-Z0-9'-]+)$/);
  if (!match) return ''; 
  
  const currentWord = match[1];
  if (currentWord.length < 2) return ''; 
  
  const currentWordLower = currentWord.toLowerCase();
  const vocabMap = extractVocabulary(ghostText);
  
  let bestWord = null;
  let bestScore = -1;
  let consumedChars = 0;

  for (const [lower, original] of vocabMap.entries()) {
    // 1. Exact prefix match (Highest priority)
    if (lower.startsWith(currentWordLower)) {
      return original.slice(currentWord.length);
    }
    
    // 2. Fuzzy subsequence match
    if (isSubsequence(currentWordLower, lower)) {
       // calculate score based on length difference
       const score = currentWordLower.length / lower.length;
       if (score > bestScore) {
         bestScore = score;
         bestWord = original;
         // Find how much of the original word to suggest.
         // We suggest everything after the last matched character.
         consumedChars = getLastMatchIndex(currentWordLower, lower) + 1;
       }
    }
  }
  
  if (bestWord) {
    return bestWord.slice(consumedChars);
  }
  
  return '';
}

function isSubsequence(s, t) {
  let i = 0, j = 0;
  while (i < s.length && j < t.length) {
    if (s[i] === t[j]) i++;
    j++;
  }
  return i === s.length;
}

function getLastMatchIndex(s, t) {
  let i = 0, j = 0;
  let lastJ = 0;
  while (i < s.length && j < t.length) {
    if (s[i] === t[j]) {
      i++;
      lastJ = j;
    }
    j++;
  }
  return lastJ;
}
