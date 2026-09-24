import { useEffect, useMemo } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatINR, formatNumber } from '../../utils/format'
import { ACTIVITY_HEAT_STOPS, cssGradient, heatColor } from '../../utils/heat'

const INDIA_CENTER = [22.5, 79.5]

/* MapContainer honors center/zoom only at mount; fits must be applied via
   useMap, and always with animate:false (animated fits never complete while
   the tab is hidden). Fits the selected district when there is one, else the
   selected state, else the national view. Bump `recenterKey` to re-apply the
   fit on demand (the pin button) after the user has panned away. */
function FitToSelection({ boundaries, stateId, districtId, recenterKey }) {
  const map = useMap()
  useEffect(() => {
    if (!boundaries?.features?.length) return
    let feats = null
    if (districtId) {
      feats = boundaries.features.filter(
        (f) => String(f.properties.district_id) === String(districtId)
      )
    }
    if (!feats?.length && stateId) {
      feats = boundaries.features.filter(
        (f) => String(f.properties.state_id) === String(stateId)
      )
    }
    if (!feats?.length) {
      map.setView(INDIA_CENTER, 5, { animate: false })
      return
    }
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds.pad(districtId ? 0.25 : 0.08), { animate: false })
  }, [map, boundaries, stateId, districtId, recenterKey])
  return null
}

export default function PublicActivityMap({
  districts, boundaries, stateId, selectedDistrictId, onDistrictClick, height = 460,
  recenterKey = 0,
}) {
  const byDistrict = useMemo(() => {
    const m = new Map()
    ;(districts ?? []).forEach((d) => m.set(d.district_id, d))
    return m
  }, [districts])

  /* Continuous heat shading normalized to the districts in view — a proper
     heatmap rather than quartile bins. */
  const range = useMemo(() => {
    const counts = (districts ?? []).map((d) => d.project_count).filter((v) => v != null)
    return counts.length ? [Math.min(...counts), Math.max(...counts)] : null
  }, [districts])

  const colorFor = (d) => {
    if (!d || !range) return '#e2e8f0'
    return heatColor(d.project_count, range[0], range[1], ACTIVITY_HEAT_STOPS, { sqrt: true })
  }

  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ height, width: '100%' }}
                  className="z-0 rounded-xl" scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | District boundaries: <a href="https://github.com/datameet/maps">DataMeet India community</a> (CC BY 4.0), Census 2011'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToSelection boundaries={boundaries} stateId={stateId}
                      districtId={selectedDistrictId} recenterKey={recenterKey} />

      {boundaries?.features?.length > 0 && (
        <GeoJSON
          key={`${stateId ?? 'all'}-${selectedDistrictId ?? 'none'}-${(districts ?? []).length}`}
          data={boundaries}
          style={(feature) => {
            const d = byDistrict.get(feature.properties.district_id)
            const selected = String(feature.properties.district_id) === String(selectedDistrictId)
            return {
              color: selected ? '#b45309' : '#475569',
              weight: selected ? 2.5 : 1,
              opacity: 0.8,
              fillColor: colorFor(d),
              fillOpacity: d ? 0.6 : 0.12,
            }
          }}
          onEachFeature={(feature, layer) => {
            const d = byDistrict.get(feature.properties.district_id)
            if (d) {
              layer.on('click', () => onDistrictClick?.(d))
              layer.bindTooltip(
                `<strong>${d.district}, ${d.state}</strong><br/>` +
                `Public works: ${formatNumber(d.project_count)}<br/>` +
                `Sanctioned: ${formatINR(d.sanctioned)}<br/>` +
                `Reported utilization: ${d.utilization_pct != null ? `${d.utilization_pct}%` : '—'}`,
                { sticky: true })
            } else {
              layer.bindTooltip(`${feature.properties.district}, ${feature.properties.state}`)
            }
          }}
        />
      )}
    </MapContainer>
  )
}

export function ActivityLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 font-sans">
      <span className="font-bold text-slate-800">Public works per district:</span>
      <span className="inline-flex items-center gap-2">
        <span>Fewest</span>
        <span
          className="h-2.5 w-28 rounded-full border border-slate-300/60"
          style={{ background: cssGradient(ACTIVITY_HEAT_STOPS) }}
          aria-hidden="true"
        />
        <span>Most</span>
      </span>
      <span className="text-slate-400">Continuous shading · click a district to inspect it</span>
    </div>
  )
}
