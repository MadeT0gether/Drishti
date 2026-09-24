import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { citizenReportsApi, geotagApi, dashboardApi } from '../../services/api'

// Custom Map Marker Icon for Leaflet
const customPin = L.divIcon({
  className: 'custom-map-pin',
  html: `<div style="background-color: #1a56db; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.35);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function LocationPickerMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng])
    },
  })

  return position ? (
    <Marker
      position={position}
      icon={customPin}
      draggable={true}
      eventHandlers={{
        dragend(e) {
          const marker = e.target
          const { lat, lng } = marker.getLatLng()
          setPosition([lat, lng])
        },
      }}
    />
  ) : null
}

const ISSUE_TYPES = [
  { value: 'incorrect_info', label: 'Incorrect project information' },
  { value: 'project_missing', label: 'Project missing' },
  { value: 'work_not_happening', label: 'Work not happening as reported' },
  { value: 'work_incomplete', label: 'Work appears incomplete' },
  { value: 'incorrect_location', label: 'Incorrect project location' },
  { value: 'funding_concern', label: 'Funding/expenditure concern' },
  { value: 'other', label: 'Other' },
]

const RELATIONSHIPS = [
  { value: 'resident', label: 'Resident' },
  { value: 'beneficiary', label: 'Beneficiary' },
  { value: 'community_member', label: 'Community member' },
  { value: 'worker', label: 'Worker' },
  { value: 'other', label: 'Other' },
]

export default function CitizenReportModal({ isOpen, onClose, initialProjectId = null, onOpenTracker }) {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState(null)
  const [copySuccess, setCopySuccess] = useState(false)

  // Form State
  const [issueType, setIssueType] = useState('work_not_happening')
  const [projectSearch, setProjectSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [customProjectName, setCustomProjectName] = useState('')
  const [stateId, setStateId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [villageLocality, setVillageLocality] = useState('')
  const [description, setDescription] = useState('')

  // Evidence State
  const [photos, setPhotos] = useState([])
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [coords, setCoords] = useState([22.5, 79.5]) // Default center India
  const [hasCapturedLocation, setHasCapturedLocation] = useState(false)
  const [locationSource, setLocationSource] = useState('') // 'gps' | 'exif' | 'manual'
  const [obsDateTime, setObsDateTime] = useState(() => new Date().toISOString().slice(0, 16))

  // Reporter Details State
  const [reporterName, setReporterName] = useState('')
  const [reporterMobile, setReporterMobile] = useState('')
  const [reporterEmail, setReporterEmail] = useState('')
  const [relationship, setRelationship] = useState('resident')

  // Reference data
  const [statesList, setStatesList] = useState([])
  const [districtsList, setDistrictsList] = useState([])

  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  // Load States
  useEffect(() => {
    dashboardApi.states().then(setStatesList).catch(() => {})
  }, [])

  // Load Districts when state changes
  useEffect(() => {
    if (stateId) {
      dashboardApi.districts({ state_id: stateId }).then(setDistrictsList).catch(() => {})
    } else {
      setDistrictsList([])
    }
  }, [stateId])

  // Project search autocomplete
  useEffect(() => {
    if (projectSearch.length >= 2 && !selectedProject) {
      geotagApi.searchProjects(projectSearch).then(setSearchResults).catch(() => {})
    } else {
      setSearchResults([])
    }
  }, [projectSearch, selectedProject])

  // Pre-fill initial project if provided
  useEffect(() => {
    if (initialProjectId) {
      geotagApi.searchProjects(String(initialProjectId)).then((res) => {
        if (res && res.length > 0) {
          setSelectedProject(res[0])
          setProjectSearch(res[0].title)
        }
      }).catch(() => {})
    }
  }, [initialProjectId])

  const handleDeviceGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.latitude, pos.coords.longitude])
        setHasCapturedLocation(true)
        setLocationSource('gps')
      },
      (err) => {
        alert('Could not retrieve GPS location. Please allow location permissions or adjust pin on map.')
      },
      { enableHighAccuracy: true }
    )
  }

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setIsUploadingPhoto(true)
    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const data = await citizenReportsApi.uploadPhoto(formData)
        setPhotos((prev) => [...prev, data])

        // If photo contains EXIF GPS coordinates and user hasn't captured GPS yet
        if (data.has_gps && data.latitude && data.longitude && !hasCapturedLocation) {
          setCoords([data.latitude, data.longitude])
          setHasCapturedLocation(true)
          setLocationSource('exif')
        }
      } catch (err) {
        console.error('Failed to upload evidence photo', err)
      }
    }
    setIsUploadingPhoto(false)
  }

  const handleSubmit = async () => {
    if (!description.trim()) {
      alert('Please describe what you observed.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        issue_type: issueType,
        project_id: selectedProject?.id || null,
        custom_project_name: selectedProject ? null : (customProjectName || projectSearch || null),
        state_id: stateId ? Number(stateId) : null,
        district_id: districtId ? Number(districtId) : null,
        village_locality: villageLocality || null,
        description: description.trim(),
        photos: photos,
        latitude: hasCapturedLocation ? coords[0] : null,
        longitude: hasCapturedLocation ? coords[1] : null,
        location_confirmed: hasCapturedLocation,
        observation_datetime: obsDateTime ? new Date(obsDateTime).toISOString() : new Date().toISOString(),
        reporter_name: reporterName || null,
        reporter_mobile: reporterMobile || null,
        reporter_email: reporterEmail || null,
        reporter_relationship: relationship,
      }

      const res = await citizenReportsApi.submit(payload)
      setSubmissionResult(res)
      setStep(4) // Move to confirmation step
    } catch (err) {
      console.error('Failed to submit report', err)
      alert(err.response?.data?.detail || 'Failed to submit report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyReference = () => {
    if (submissionResult?.reference_id) {
      navigator.clipboard.writeText(submissionResult.reference_id)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2500)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <span className="text-[10px] font-bold font-mono tracking-widest text-blue-700 uppercase">
                CITIZEN PARTICIPATION &amp; OVERSIGHT
              </span>
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Report a Project Issue</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Multi-step Stepper Indicator */}
        {step < 4 && (
          <div className="grid grid-cols-3 border-b border-slate-100 bg-white text-xs font-mono">
            <div className={`py-2.5 px-4 text-center border-b-2 font-bold ${step === 1 ? 'border-blue-700 text-blue-700 bg-blue-50/40' : step > 1 ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400'}`}>
              1. Issue Details
            </div>
            <div className={`py-2.5 px-4 text-center border-b-2 font-bold ${step === 2 ? 'border-blue-700 text-blue-700 bg-blue-50/40' : step > 2 ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400'}`}>
              2. Photo &amp; Location
            </div>
            <div className={`py-2.5 px-4 text-center border-b-2 font-bold ${step === 3 ? 'border-blue-700 text-blue-700 bg-blue-50/40' : 'border-transparent text-slate-400'}`}>
              3. Reporter Details
            </div>
          </div>
        )}

        {/* Modal Body Content */}
        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* ── STEP 1: ISSUE DETAILS ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Issue Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Searchable Project Selector */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Select Project (Search by name or code)
                </label>
                {selectedProject ? (
                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-blue-800">
                        <span>{selectedProject.code}</span>
                        <span>·</span>
                        <span>{selectedProject.district_name}, {selectedProject.state_name}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-900">{selectedProject.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedProject(null); setProjectSearch('') }}
                      className="text-xs font-mono text-red-600 hover:underline px-2"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Type project name or ID (e.g. Community Hall, Road, Solar)..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedProject(p)
                              setProjectSearch(p.title)
                              setSearchResults([])
                            }}
                            className="p-2.5 hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <div className="text-[10px] font-mono text-slate-400 font-bold">{p.code} · {p.district_name}, {p.state_name}</div>
                            <div className="text-xs font-bold text-slate-800">{p.title}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* If project not found in search */}
              {!selectedProject && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Or specify Project Name / Unlisted Project
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Village Panchayat Hall construction near Primary School"
                    value={customProjectName}
                    onChange={(e) => setCustomProjectName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              )}

              {/* State & District Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">State</label>
                  <select
                    value={stateId}
                    onChange={(e) => setStateId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">Select State</option>
                    {statesList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">District</label>
                  <select
                    value={districtId}
                    onChange={(e) => setDistrictId(e.target.value)}
                    disabled={!stateId}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">Select District</option>
                    {districtsList.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Village / Locality */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Village / Locality / Landmark</label>
                <input
                  type="text"
                  placeholder="e.g. Gram Panchayat Rampur, Near Old Bus Stand"
                  value={villageLocality}
                  onChange={(e) => setVillageLocality(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Describe the Issue / Observation <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Please describe what you observed on the ground (e.g., physical work not started, materials dumped, sign board missing, work halted, quality discrepancies)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-[10.5px] text-slate-400">
                  Provide factual, specific observations to facilitate verification against project records.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 2: PHOTO & LOCATION EVIDENCE ────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Photo Upload & Direct Camera Capture */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Add Photo Evidence</label>
                    <span className="text-[10.5px] text-slate-500">Upload site photographs or capture directly with your camera.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={cameraInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
                    >
                      <svg className="h-3.5 w-3.5 text-blue-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                    >
                      Upload Photos
                    </button>
                  </div>
                </div>

                {isUploadingPhoto && (
                  <div className="p-3 rounded-lg bg-blue-50 text-blue-700 font-mono text-xs flex items-center gap-2">
                    <span className="animate-spin">⏳</span> Processing image and extracting EXIF GPS metadata...
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {photos.map((p, idx) => (
                      <div key={idx} className="relative rounded-lg border border-slate-200 overflow-hidden group bg-slate-50 p-1.5 space-y-1">
                        <div className="h-24 w-full bg-slate-200 rounded flex items-center justify-center overflow-hidden">
                          <img
                            src={(import.meta.env.VITE_API_URL || 'http://localhost:8000') + p.url}
                            alt="Uploaded evidence"
                            className="h-full w-full object-cover"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        </div>
                        <div className="text-[10px] font-mono text-slate-600 truncate">{p.original_filename}</div>
                        {p.has_gps ? (
                          <div className="text-[9.5px] font-mono text-emerald-700 font-bold flex items-center gap-1">
                            <span>✓ GPS Detected</span>
                          </div>
                        ) : (
                          <div className="text-[9.5px] font-mono text-slate-400">No EXIF GPS</div>
                        )}
                        <button
                          type="button"
                          onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                          className="text-[10px] font-bold text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Location Capture & Map Confirmation */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Location Coordinates</label>
                    <span className="text-[10.5px] text-slate-500">Capture device GPS or click/drag marker on the map.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeviceGPS}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 shadow-2xs"
                  >
                    <svg className="h-3.5 w-3.5 text-blue-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><polygon points="12 2 15 8 12 6 9 8 12 2" />
                    </svg>
                    Use Device GPS
                  </button>
                </div>

                {hasCapturedLocation && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-live" />
                      <span className="font-bold">Location Captured: {coords[0].toFixed(5)}° N, {coords[1].toFixed(5)}° E</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-emerald-700">({locationSource})</span>
                  </div>
                )}

                {/* Leaflet Map for Pin Adjustment */}
                <div className="h-52 w-full rounded-xl border border-slate-200 overflow-hidden relative">
                  <MapContainer
                    center={coords}
                    zoom={hasCapturedLocation ? 13 : 5}
                    scrollWheelZoom={false}
                    className="h-full w-full"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPickerMarker
                      position={coords}
                      setPosition={(pos) => {
                        setCoords(pos)
                        setHasCapturedLocation(true)
                        setLocationSource('manual')
                      }}
                    />
                  </MapContainer>
                </div>
              </div>

              {/* Observation Date & Time */}
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-1">Observation Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={obsDateTime}
                  onChange={(e) => setObsDateTime(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-800"
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: REPORTER DETAILS & PRIVACY ────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                  <svg className="h-4 w-4 text-blue-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Privacy &amp; Data Protection Assurance
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  “Your contact details are used only to review this report and contact you about it. They will not be displayed publicly.”
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Your Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Mobile Number (Optional)</label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 9876543210"
                      value={reporterMobile}
                      onChange={(e) => setReporterMobile(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Email Address (Optional)</label>
                    <input
                      type="email"
                      placeholder="e.g. citizen@example.com"
                      value={reporterEmail}
                      onChange={(e) => setReporterEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Relationship to Location</label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: SUBMISSION CONFIRMATION ──────────────────────── */}
          {step === 4 && submissionResult && (
            <div className="text-center py-6 space-y-6">
              <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold shadow-sm">
                ✓
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Report Submitted Successfully</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  “Your report has been received and will be reviewed against the relevant project records.”
                </p>
              </div>

              {/* Reference ID card */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 max-w-sm mx-auto space-y-2">
                <div className="text-[10px] font-bold font-mono text-blue-700 uppercase tracking-wider">
                  OFFICIAL REFERENCE ID
                </div>
                <div className="text-2xl font-black font-mono text-slate-900 tracking-wider">
                  {submissionResult.reference_id}
                </div>
                <button
                  onClick={handleCopyReference}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all font-mono"
                >
                  {copySuccess ? '✓ Copied to Clipboard!' : 'Copy Reference ID'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <button
                  onClick={() => {
                    onClose()
                    onOpenTracker?.(submissionResult.reference_id)
                  }}
                  className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-sm"
                >
                  Track Report →
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-5 py-2.5 text-xs font-bold transition-all"
                >
                  Close Window
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Nav Buttons */}
        {step < 4 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                ← Back
              </button>
            ) : <div />}

            <div className="flex items-center gap-3">
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && !description.trim()) {
                      alert('Please provide a description of the observed issue.')
                      return
                    }
                    setStep((s) => s + 1)
                  }}
                  className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 text-xs font-bold transition-all shadow-sm"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-6 py-2.5 text-xs font-bold transition-all shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting Report...' : 'Submit Report →'}
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
