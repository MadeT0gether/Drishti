import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip as LeafletTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { riskMeta } from '../../utils/risk'
import { healthMeta } from '../../utils/health'
import { formatINR, formatNumber } from '../../utils/format'
import {
  ACTIVITY_HEAT_STOPS,
  RISK_HEAT_STOPS,
  cssGradient,
  heatColor,
} from '../../utils/heat'

const INDIA_CENTER = [22.5, 79.5]

function investigationColor(count) {
  if (!count) return '#e2e8f0'
  if (count === 1) return '#d97706'
  if (count <= 3) return '#ea580c'
  return '#dc2626'
}

export const MAP_MODES = {
  risk: {
    label: 'Risk',
    legend: RISK_HEAT_STOPS.map((c, i) => [c, ['Lowest', 'Lower', 'Elevated', 'High', 'Highest'][i]]),
    gradient: RISK_HEAT_STOPS,
    gradientLabels: ['Lower avg risk', 'Higher avg risk'],
    note: 'Continuous heat shading of the average AI risk score per district, relative to the districts in view. Concentration indicates review priority, not wrongdoing.',
  },
  health: { label: 'Health', legend: [['#059669', '● Steady'], ['#d97706', '◆ Watch'], ['#dc2626', '▲ Needs attention'], ['#98a2b3', '○ Not scored']], note: 'District Health Score — implementation performance of the project portfolio.' },
  density: {
    label: 'Projects',
    legend: ACTIVITY_HEAT_STOPS.slice(0, 4).map((c, i) => [c, ['Fewest', 'Fewer', 'More', 'Most'][i]]),
    gradient: ACTIVITY_HEAT_STOPS,
    gradientLabels: ['Fewest projects', 'Most projects'],
    note: 'Continuous heat shading of project count per district.',
  },
  investigations: { label: 'Investigations', legend: [['#e2e8f0', 'None'], ['#d97706', '1 active'], ['#ea580c', '2–3 active'], ['#dc2626', '4+ active']], note: 'Active investigation cases per district.' },
}

/** Renders the district layer (choropleth polygons when boundary data is
 * available, centroid circles otherwise) or individual project points.
 * Existing circle/point behavior is preserved as the fallback. */
export default function RiskMap({ data, districts, boundaries, mode = 'risk', healthByDistrict,
                                  height = 420, zoom = 5, center = INDIA_CENTER, onDistrictClick, onSelectDistrict }) {
  const navigate = useNavigate()
  const handleDistrictClick = onDistrictClick || onSelectDistrict

  const mapDataObject = useMemo(() => {
    if (data) return data
    if (districts) return { mode: 'districts', districts, truncated: false }
    return { mode: 'districts', districts: [], truncated: false }
  }, [data, districts])

  const byDistrict = useMemo(() => {
    const m = new Map()
    mapDataObject?.districts?.forEach((d) => {
      if (d.district_id != null) {
        m.set(d.district_id, d)
        m.set(Number(d.district_id), d)
        m.set(String(d.district_id), d)
      }
    })
    return m
  }, [mapDataObject])

  /* Heat ranges are normalized to the districts currently in view so the
     gradient uses its full contrast (a proper heatmap, not fixed bins). */
  const ranges = useMemo(() => {
    const ds = mapDataObject?.districts ?? []
    const risks = ds.map((d) => d.avg_risk).filter((v) => v != null)
    const counts = ds.map((d) => d.project_count).filter((v) => v != null)
    return {
      risk: risks.length ? [Math.min(...risks), Math.max(...risks)] : null,
      count: counts.length ? [Math.min(...counts), Math.max(...counts)] : null,
    }
  }, [mapDataObject])

  const colorFor = (d) => {
    if (!d) return '#cbd5e1'
    if (mode === 'health') return healthMeta(healthByDistrict?.get(d.district_id)?.band).chart
    if (mode === 'density') {
      if (!ranges.count) return ACTIVITY_HEAT_STOPS[0]
      return heatColor(d.project_count, ranges.count[0], ranges.count[1],
                       ACTIVITY_HEAT_STOPS, { sqrt: true })
    }
    if (mode === 'investigations') return investigationColor(d.active_investigations)
    if (d.avg_risk == null || !ranges.risk) return '#cbd5e1'
    return heatColor(d.avg_risk, ranges.risk[0], ranges.risk[1], RISK_HEAT_STOPS)
  }

  const showChoropleth = mapDataObject?.mode === 'districts' && boundaries?.features?.length > 0

  const tooltipFor = (d) => {
    const h = healthByDistrict?.get(d.district_id)
    return (
      <div className="text-xs">
        <strong>{d.district}, {d.state}</strong><br />
        Projects: {formatNumber(d.project_count)}<br />
        Avg risk: {d.avg_risk ?? '—'} · High: {d.high_risk_count} · Critical: {d.critical_count}<br />
        {h?.health_score != null && <>Health: {h.health_score} ({healthMeta(h.band).label})<br /></>}
        Active investigations: {d.active_investigations}<br />
        Expenditure: {formatINR(d.expenditure)}
      </div>
    )
  }

  return (
    <MapContainer center={center} zoom={zoom} style={{ height, width: '100%' }}
                  className="z-0 rounded-md" scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | District boundaries: <a href="https://github.com/datameet/maps">DataMeet India community</a> (CC BY 4.0), Census 2011'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {showChoropleth && (
        <GeoJSON
          key={`${mode}-${mapDataObject.districts.length}-${healthByDistrict ? healthByDistrict.size : 0}-${ranges.risk ?? ''}-${ranges.count ?? ''}`}
          data={boundaries}
          style={(feature) => {
            const d = byDistrict.get(feature.properties.district_id) || byDistrict.get(Number(feature.properties.district_id))
            return {
              color: '#475569', weight: 1, opacity: 0.7,
              fillColor: colorFor(d), fillOpacity: d ? 0.65 : 0.15,
            }
          }}
          onEachFeature={(feature, layer) => {
            const d = byDistrict.get(feature.properties.district_id) || byDistrict.get(Number(feature.properties.district_id))
            if (d) {
              layer.on('click', () => handleDistrictClick?.(d))
              layer.bindTooltip(
                `<strong>${d.district}, ${d.state}</strong><br/>` +
                `Projects: ${d.project_count} · Avg risk: ${d.avg_risk ?? '—'}<br/>` +
                `Active investigations: ${d.active_investigations}`,
                { sticky: true })
            } else {
              layer.bindTooltip(`${feature.properties.district}, ${feature.properties.state}`)
            }
          }}
        />
      )}

      {/* centroid circles: fallback when no boundaries are available */}
      {mapDataObject?.mode === 'districts' && !showChoropleth && mapDataObject.districts.map((d) => (
        d.latitude != null && (
          <CircleMarker key={d.district_id} center={[d.latitude, d.longitude]}
            radius={Math.min(6 + Math.sqrt(d.project_count) / 1.5, 22)}
            pathOptions={{ color: colorFor(d), fillColor: colorFor(d),
                           fillOpacity: 0.65, weight: 1.5 }}
            eventHandlers={{ click: () => handleDistrictClick?.(d) }}>
            <LeafletTooltip>{tooltipFor(d)}</LeafletTooltip>
          </CircleMarker>
        )
      ))}

      {mapDataObject?.mode === 'projects' && mapDataObject.projects.map((p) => {
        const meta = riskMeta(p.risk_level)
        return (
          <CircleMarker key={p.project_id} center={[p.latitude, p.longitude]}
            radius={p.risk_level === 'critical' ? 8 : p.risk_level === 'high' ? 7 : 5}
            pathOptions={{ color: meta.chart, fillColor: meta.chart, fillOpacity: 0.7, weight: 1 }}
            eventHandlers={{ click: () => navigate(`/projects/${p.project_id}`) }}>
            <LeafletTooltip>
              <div className="text-xs">
                <strong>{p.code}</strong><br />
                Risk: {p.risk_score != null ? `${Math.round(p.risk_score)} (${meta.label})` : 'Not assessed'}
              </div>
            </LeafletTooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}

export function MapLegend({ mode = 'risk' }) {
  const m = MAP_MODES[mode] ?? MAP_MODES.risk
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
      <span className="font-medium text-text-primary">{m.label}:</span>
      {m.gradient ? (
        <span className="inline-flex items-center gap-2">
          <span>{m.gradientLabels[0]}</span>
          <span
            className="h-2.5 w-28 rounded-full border border-slate-300/50"
            style={{ background: cssGradient(m.gradient) }}
            aria-hidden="true"
          />
          <span>{m.gradientLabels[1]}</span>
        </span>
      ) : (
        m.legend.map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} aria-hidden="true" />
            {l}
          </span>
        ))
      )}
      <span className="text-text-muted">{m.note}</span>
    </div>
  )
}

