import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/** Local relationship neighborhood for ONE project, rendered from the
 *  existing /relationships and /similar API data — no new detection, no
 *  physics engine, no external library. Static radial layout with zoom,
 *  pan, node selection, edge explanations, legend and edge-type filters.
 *
 *  Vocabulary: "relationship signal", "potential relationship pattern",
 *  "shared vendor" — never assertions of collusion. */

const W = 640
const H = 420
const CX = W / 2
const CY = H / 2

const NODE_STYLES = {
  project: { fill: '#312e81', r: 26, label: 'This project' },
  agency: { fill: '#0e7490', r: 20, label: 'Implementing agency' },
  vendor: { fill: '#7c3aed', r: 20, label: 'Vendor' },
  related: { fill: '#64748b', r: 12, label: 'Project sharing vendor' },
  similar: { fill: '#b45309', r: 12, label: 'Duplicate candidate / similar' },
}

const EDGE_TYPES = {
  admin: { label: 'Administrative (agency/vendor)', stroke: '#94a3b8', dash: '' },
  shared_vendor: { label: 'Shared vendor', stroke: '#7c3aed', dash: '4 3' },
  similarity: { label: 'Similarity (duplicate candidate)', stroke: '#b45309', dash: '2 3' },
}

function polar(cx, cy, radius, angle) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
}

export default function RelationshipGraph({ relationships, similar = [] }) {
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ admin: true, shared_vendor: true, similarity: true })
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const dragRef = useRef(null)

  const { nodes, edges } = useMemo(() => {
    const nodes = []
    const edges = []
    if (!relationships) return { nodes, edges }

    nodes.push({ id: 'project', type: 'project', x: CX, y: CY, name: 'This project',
                 detail: {} })

    const agencyEdge = relationships.edges.find((e) => e.entity_type === 'agency')
    const vendorEdge = relationships.edges.find((e) => e.entity_type === 'vendor')
    if (agencyEdge) {
      const [x, y] = polar(CX, CY, 120, Math.PI * 1.25)
      nodes.push({ id: 'agency', type: 'agency', x, y, name: agencyEdge.entity_name,
                   detail: agencyEdge.detail })
      edges.push({ from: 'project', to: 'agency', type: 'admin',
                   explanation: `Implemented by ${agencyEdge.entity_name} `
                     + `(${agencyEdge.detail.agency_total_projects} projects overall)` })
    }
    if (vendorEdge) {
      const [x, y] = polar(CX, CY, 120, Math.PI * -0.25)
      nodes.push({ id: 'vendor', type: 'vendor', x, y, name: vendorEdge.entity_name,
                   detail: vendorEdge.detail })
      edges.push({ from: 'project', to: 'vendor', type: 'admin',
                   explanation: `Contracted to ${vendorEdge.entity_name} `
                     + `(${vendorEdge.detail.vendor_total_projects} projects; `
                     + `${vendorEdge.detail.projects_with_same_agency} with the same agency)` })
    }

    const related = relationships.related_projects ?? []
    related.forEach((rp, i) => {
      const angle = -0.25 * Math.PI + ((i - (related.length - 1) / 2) * 0.32)
      const [x, y] = polar(CX, CY, 235, angle)
      const id = `rel-${rp.project_id}`
      nodes.push({ id, type: 'related', x, y, name: rp.code,
                   projectId: rp.project_id, detail: { title: rp.title, shared: rp.shared } })
      edges.push({ from: 'vendor', to: id, type: 'shared_vendor',
                   explanation: `${rp.code} shares the ${rp.shared === 'agency_vendor'
                     ? 'same agency-vendor pair' : 'same vendor'}` })
    })

    similar.slice(0, 6).forEach((s, i) => {
      const angle = 0.75 * Math.PI + ((i - 2.5) * 0.3)
      const [x, y] = polar(CX, CY, 210, angle)
      const id = `sim-${s.project_id}`
      nodes.push({ id, type: 'similar', x, y, name: s.code,
                   projectId: s.project_id,
                   detail: { title: s.title, composite_score: s.composite_score,
                             classification: s.classification } })
      edges.push({ from: 'project', to: id, type: 'similarity',
                   explanation: `${s.code}: ${s.classification.replace('_', ' ')} `
                     + `(composite ${s.composite_score}/100) — human verification required` })
    })

    return { nodes, edges }
  }, [relationships, similar])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const visibleEdges = edges.filter((e) => filters[e.type])
  const visibleNodeIds = new Set(['project',
    ...visibleEdges.flatMap((e) => [e.from, e.to])])

  const signals = relationships?.signals ?? []
  const signalNodes = new Set()
  signals.forEach((s) => {
    if (s.signal_type === 'vendor_concentration') signalNodes.add('vendor')
    if (s.signal_type === 'agency_vendor_repeat') { signalNodes.add('vendor'); signalNodes.add('agency') }
  })

  const zoom = (f) => setView((v) => ({ ...v, scale: Math.min(3, Math.max(0.5, v.scale * f)) }))
  const onPointerDown = (e) => { dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty } }
  const onPointerMove = (e) => {
    if (!dragRef.current) return
    setView((v) => ({ ...v, tx: dragRef.current.tx + (e.clientX - dragRef.current.x),
                      ty: dragRef.current.ty + (e.clientY - dragRef.current.y) }))
  }
  const onPointerUp = () => { dragRef.current = null }

  if (!nodes.length) return null

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-xs">
        {Object.entries(EDGE_TYPES).map(([key, t]) => (
          <label key={key} className="inline-flex items-center gap-1.5 font-medium text-text-secondary">
            <input type="checkbox" checked={filters[key]}
                   onChange={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
                   className="rounded border-border" />
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke={t.stroke} strokeWidth="2"
                    strokeDasharray={t.dash} />
            </svg>
            {t.label}
          </label>
        ))}
        <span className="ml-auto flex gap-1">
          <button onClick={() => zoom(1.25)} aria-label="Zoom in"
                  className="rounded border border-border px-2 py-0.5 font-semibold text-text-secondary">+</button>
          <button onClick={() => zoom(0.8)} aria-label="Zoom out"
                  className="rounded border border-border px-2 py-0.5 font-semibold text-text-secondary">−</button>
          <button onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
                  className="rounded border border-border px-2 py-0.5 text-text-secondary">Reset</button>
        </span>
      </div>

      <div className="grid lg:grid-cols-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="lg:col-span-2 w-full cursor-grab touch-none select-none"
             style={{ maxHeight: 440 }}
             role="img" aria-label="Relationship graph of this project's local neighborhood"
             onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 0.9)}
             onPointerDown={onPointerDown} onPointerMove={onPointerMove}
             onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}
             transformOrigin={`${CX} ${CY}`}>
            {visibleEdges.map((e, i) => {
              const a = byId.get(e.from); const b = byId.get(e.to)
              if (!a || !b) return null
              const t = EDGE_TYPES[e.type]
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={t.stroke} strokeWidth={selected?.edge === i ? 2.5 : 1.4}
                      strokeDasharray={t.dash} opacity="0.75" />
              )
            })}
            {nodes.filter((n) => visibleNodeIds.has(n.id)).map((n) => {
              const s = NODE_STYLES[n.type]
              const flagged = signalNodes.has(n.id)
              return (
                <g key={n.id} onClick={() => setSelected({ node: n })}
                   className="cursor-pointer" role="button" tabIndex={0}
                   aria-label={`${s.label}: ${n.name}`}
                   onKeyDown={(e) => e.key === 'Enter' && setSelected({ node: n })}>
                  {flagged && (
                    <circle cx={n.x} cy={n.y} r={s.r + 5} fill="none"
                            stroke="#ea580c" strokeWidth="2" strokeDasharray="3 2" />
                  )}
                  <circle cx={n.x} cy={n.y} r={s.r} fill={s.fill}
                          stroke={selected?.node?.id === n.id ? '#0f172a' : 'white'}
                          strokeWidth={selected?.node?.id === n.id ? 3 : 1.5} />
                  <text x={n.x} y={n.y + s.r + 11} textAnchor="middle"
                        fontSize="9" fill="#334155">
                    {n.name.length > 22 ? n.name.slice(0, 20) + '…' : n.name}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
          {selected?.node ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-text-primary">
                {NODE_STYLES[selected.node.type].label}
              </p>
              <p className="text-text-secondary">{selected.node.name}</p>
              {selected.node.detail?.title && (
                <p className="text-xs text-text-muted">{selected.node.detail.title}</p>
              )}
              <ul className="space-y-1 text-xs text-text-secondary">
                {edges.filter((e) => e.from === selected.node.id || e.to === selected.node.id)
                  .map((e, i) => <li key={i}>• {e.explanation}</li>)}
              </ul>
              {selected.node.projectId && (
                <Link to={`/projects/${selected.node.projectId}`}
                      className="inline-block text-xs font-medium text-accent hover:underline">
                  Open project →
                </Link>
              )}
              {signalNodes.has(selected.node.id) && (
                <p className="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
                  A relationship signal involves this entity — a potential
                  relationship pattern for review, not a finding.
                </p>
              )}
            </div>
          ) : (
            <div className="text-xs text-text-muted">
              <p className="font-medium text-text-secondary">Legend</p>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(NODE_STYLES).map(([k, s]) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.fill }}
                          aria-hidden="true" />
                    {s.label}
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-orange-600"
                        aria-hidden="true" />
                  Relationship signal present (review indicator)
                </li>
              </ul>
              <p className="mt-3">Click a node for details. Scroll to zoom, drag to pan.
                Signals are potential relationship patterns for review — never findings of collusion.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
