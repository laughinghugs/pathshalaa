import { useEffect, useRef } from 'react'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'

// Shared by SolveView and CommandDrafts' mensuration steps — both render
// step text with inline math wrapped in single $...$ (see build_solve_prompt
// in backend/app/solving.py and the step templates in backend/app/
// mensuration.py). auto-render walks the rendered text and replaces each
// delimited span with KaTeX, leaving the surrounding prose untouched.
export default function MathText({ text }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    renderMathInElement(ref.current, {
      delimiters: [{ left: '$', right: '$', display: false }],
      throwOnError: false,
    })
  }, [text])
  return <span ref={ref}>{text}</span>
}
