import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'

interface Props {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}

export default function CodeEditor({ value, onChange, placeholder }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (viewRef.current) return

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        onChange(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        python(),
        oneDark,
        updateListener,
        placeholder ? EditorView.contentAttributes.of({ 'data-placeholder': placeholder }) : [],
        EditorView.theme({
          '&': { height: '100%', fontSize: '12px', fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace" },
          '.cm-scroller': { overflow: 'auto' },
          '&.cm-focused': { outline: 'none' },
          '.cm-placeholder': { color: '#666', fontStyle: 'italic' },
        }),
      ],
    })

    viewRef.current = new EditorView({ state, parent: containerRef.current })

    return () => {
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div ref={containerRef} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', minHeight: 120 }} />
  )
}
