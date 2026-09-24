import React from 'react'

export default function SakshiLoader({ message = 'Processing investigation query...' }) {
  return (
    <div
      role="status"
      aria-label="Sakshi is processing your request"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '22px 16px',
        margin: '10px 0',
        borderRadius: '10px',
        background: 'linear-gradient(160deg, #0b1220 0%, #0f1a2e 55%, #162033 100%)',
        border: '1px solid rgba(94, 120, 152, 0.25)',
        boxShadow: '0 12px 32px -6px rgba(13,27,46,0.30), 0 4px 12px -2px rgba(13,27,46,0.15)',
        color: '#eef4f9',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes sk-spin-cw {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes sk-spin-ccw {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes sk-pulse-glow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.05); }
        }
        .sk-orbit-outer {
          animation: sk-spin-cw 7s linear infinite;
        }
        .sk-orbit-inner {
          animation: sk-spin-ccw 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .sk-glow-backdrop {
          animation: sk-pulse-glow 2.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sk-orbit-outer, .sk-orbit-inner, .sk-glow-backdrop {
            animation: none !important;
          }
        }
      `}</style>

      {/* Ambient background glow */}
      <div
        className="sk-glow-backdrop"
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '130px',
          height: '130px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(26, 86, 219, 0.25) 0%, rgba(11, 18, 32, 0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Circular Animated Rings Container */}
      <div
        style={{
          position: 'relative',
          width: '92px',
          height: '92px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '10px',
        }}
      >
        {/* Outer dashed spinning ring */}
        <svg
          className="sk-orbit-outer"
          width="92"
          height="92"
          viewBox="0 0 92 92"
          fill="none"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0 }}
        >
          <circle
            cx="46"
            cy="46"
            r="40"
            stroke="rgba(138, 164, 190, 0.22)"
            strokeWidth="1.2"
            strokeDasharray="4 6"
          />
          <circle
            cx="46"
            cy="46"
            r="40"
            stroke="#1a56db"
            strokeWidth="2"
            strokeDasharray="18 64"
            strokeLinecap="round"
          />
        </svg>

        {/* Inner gradient active arc */}
        <svg
          className="sk-orbit-inner"
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          aria-hidden="true"
          style={{ position: 'absolute' }}
        >
          <circle
            cx="36"
            cy="36"
            r="32"
            stroke="rgba(61, 82, 112, 0.35)"
            strokeWidth="1.5"
          />
          <path
            d="M 36 4 A 32 32 0 0 1 68 36"
            stroke="#60a5fa"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Center SAKSHI Brand Badge */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(145deg, #0b1220 0%, #162033 100%)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          }}
        >
          <span
            style={{
              fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
              fontSize: '10.5px',
              fontWeight: 800,
              color: '#eef4f9',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            SAKSHI
          </span>
          <span
            style={{
              display: 'inline-block',
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              background: '#3b82f6',
              marginTop: '4px',
              boxShadow: '0 0 6px #3b82f6',
            }}
          />
        </div>
      </div>

      {/* Subtitle / Processing Message */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span
          style={{
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            fontSize: '9px',
            fontWeight: 700,
            color: '#8aa4be',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          AI INVESTIGATION COPILOT
        </span>
        <span
          style={{
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#c2d3e4',
            marginTop: '2px',
          }}
        >
          {message}
        </span>
      </div>
    </div>
  )
}
