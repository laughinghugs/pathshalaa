import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// The generic draft/confirm layer for ALL AI output (item 2 of the
// recognition refactor): every command coming back from /api/recognize
// starts as an "unconfirmed draft" (dashed border) until the teacher hits
// Accept or Discard. Only `latex` has a fully built renderer today — the
// other AICommand types (see backend/app/commands.py) get a minimal
// fallback display so the pattern already works end-to-end for whatever a
// future subject-agent plugin adds, without new feature UI being built here.

let idCounter = 0
function nextId() {
  idCounter += 1
  return idCounter
}

const TYPE_LABELS = {
  latex: 'Recognized equation',
  graph: 'Graph',
  shape3d: '3D shape',
  solution_steps: 'Solution steps',
  translation: 'Translation',
}

function LatexDraftCard({ command, accepted, onAccept }) {
  const previewRef = useRef(null)
  const [editedContent, setEditedContent] = useState(command.content)

  useEffect(() => {
    if (!previewRef.current) return
    try {
      katex.render(editedContent || '', previewRef.current, {
        throwOnError: false,
        displayMode: true,
      })
    } catch {
      previewRef.current.textContent = editedContent
    }
  }, [editedContent])

  return (
    <>
      <h3>{TYPE_LABELS.latex}</h3>
      <div ref={previewRef} className="latex-rendered" />
      <label className="latex-edit-label" htmlFor={`latex-edit-${command._id}`}>
        Not quite right? Edit the LaTeX below, then confirm.
      </label>
      <textarea
        id={`latex-edit-${command._id}`}
        className="latex-edit"
        rows={2}
        value={editedContent}
        disabled={accepted}
        onChange={(e) => setEditedContent(e.target.value)}
      />
      {!accepted && (
        <button
          className="latex-confirm"
          onClick={() => onAccept(editedContent, editedContent !== command.content)}
        >
          Confirm
        </button>
      )}
    </>
  )
}

function FallbackDraftCard({ command }) {
  const { type: _type, _id, _accepted, ...fields } = command
  return (
    <>
      <h3>{TYPE_LABELS[command.type] ?? command.type}</h3>
      <pre className="command-draft-raw">{JSON.stringify(fields, null, 2)}</pre>
    </>
  )
}

export default function CommandDrafts({ commands, onLatexAccept }) {
  const [drafts, setDrafts] = useState([])

  // A fresh batch of recognized commands replaces whatever was drafted
  // before — matches the previous single-shot LatexDisplay behavior.
  useEffect(() => {
    setDrafts((commands || []).map((cmd) => ({ ...cmd, _id: nextId(), _accepted: false })))
  }, [commands])

  function handleDiscard(id) {
    setDrafts((prev) => prev.filter((d) => d._id !== id))
  }

  function handleAcceptGeneric(id) {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, _accepted: true } : d)))
  }

  function handleLatexAccept(id, finalContent, wasEdited) {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, _accepted: true } : d)))
    onLatexAccept?.(finalContent, wasEdited)
  }

  if (drafts.length === 0) return null

  return (
    <div className="command-drafts">
      {drafts.map((draft) => (
        <div
          key={draft._id}
          className={draft._accepted ? 'command-draft accepted' : 'command-draft'}
        >
          {draft.type === 'latex' ? (
            <LatexDraftCard
              command={draft}
              accepted={draft._accepted}
              onAccept={(content, wasEdited) => handleLatexAccept(draft._id, content, wasEdited)}
            />
          ) : (
            <FallbackDraftCard command={draft} />
          )}
          <div className="command-draft-actions">
            {draft._accepted ? (
              <span className="command-draft-status">Confirmed ✓</span>
            ) : (
              <>
                {draft.type !== 'latex' && (
                  <button onClick={() => handleAcceptGeneric(draft._id)}>Accept</button>
                )}
                <button className="command-draft-discard" onClick={() => handleDiscard(draft._id)}>
                  Discard
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
