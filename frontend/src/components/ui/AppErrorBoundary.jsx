import { Component } from 'react'

/* Top-level error boundary: an uncaught render error must never leave the
   user staring at a blank white page. Shows a recovery screen instead. */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6 font-sans">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="text-3xl" aria-hidden="true">⚠️</div>
          <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            The page hit an unexpected error. Reloading usually fixes it — your
            work on the server is unaffected.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 text-sm font-bold transition-colors"
          >
            Reload page
          </button>
          <p className="text-[11px] text-slate-400 font-mono break-all">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
        </div>
      </div>
    )
  }
}
