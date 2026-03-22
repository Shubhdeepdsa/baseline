import { useState, useEffect, useRef } from 'react'

let extractorInstance = null
let loadingPromise = null

export function useEmbeddings() {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (extractorInstance) {
      setStatus('ready')
      return
    }
    if (loadingPromise) {
      loadingPromise.then(() => setStatus('ready')).catch(() => setStatus('error'))
      return
    }

    setStatus('loading')

    // Dynamic import to avoid issues with Electron's context
    loadingPromise = import('@xenova/transformers/dist/transformers.min.js').then(async ({ pipeline, env }) => {
      env.allowLocalModels = false
      env.useBrowserCache = false

      extractorInstance = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { progress_callback: (p) => {
          // You can log progress here if needed
          console.log('Model loading:', p.status, p.progress)
        }}
      )
      setStatus('ready')
      return extractorInstance
    }).catch(err => {
      console.error('Failed to load embedding model:', err)
      const errStr = typeof err === 'object' ? (err.stack || err.message || JSON.stringify(Object.getOwnPropertyNames(err).reduce((a,b)=>{a[b]=err[b];return a},{}))) : String(err)
      if (window.electron && window.electron.consoleError) {
        window.electron.consoleError(errStr)
      }
      setStatus(`error: ${errStr.slice(0, 80)}...`)
      throw err
    })
  }, [])

  async function embed(text) {
    if (!extractorInstance) {
      if (loadingPromise) await loadingPromise
      else throw new Error('Embedding model not initialized')
    }
    const output = await extractorInstance(text, { pooling: 'mean', normalize: true })
    return output.data
  }

  return { embed, status }
}
