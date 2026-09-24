/* Minimal markdown renderer for Copilot answers: **bold**, *italic*, and
   line structure. No HTML injection — everything renders as React text nodes.
   Deliberately tiny; not a general markdown engine. */

function renderInline(text, keyBase) {
  const nodes = []
  // split on **bold** first, then *italic* inside the remainder
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
  parts.forEach((part, i) => {
    if (!part) return
    const key = `${keyBase}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={key} className="font-bold">{part.slice(2, -2)}</strong>)
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(<em key={key}>{part.slice(1, -1)}</em>)
    } else {
      nodes.push(part)
    }
  })
  return nodes
}

export default function MarkdownLite({ text, className = '' }) {
  if (!text) return null
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {String(text).split('\n').map((line, i) => (
        <span key={i}>
          {i > 0 && '\n'}
          {renderInline(line, i)}
        </span>
      ))}
    </div>
  )
}
