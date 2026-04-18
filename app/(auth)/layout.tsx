export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#08080f' }}
      >
        {/* Animated glow orbs */}
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />

        {/* Fine dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, oklch(0.62 0.24 268 / 0.12) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Gradient fade at edges */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, #08080f 85%)',
          }}
        />

        {/* Content */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: '#8B7FF0', boxShadow: '0 0 8px 2px oklch(0.62 0.24 268 / 0.6)' }}
            />
            <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#8B7FF0', letterSpacing: '0.15em' }}>
              Signalgent
            </h1>
          </div>
          <p className="mt-2 text-xs" style={{ color: '#444' }}>Business OS</p>
        </div>

        <div className="relative space-y-6">
          <h2
            className="text-3xl font-bold leading-tight tracking-tight"
            style={{ color: '#e8e6ff' }}
          >
            Your business,<br />
            <span style={{ color: '#8B7FF0' }}>one command center.</span>
          </h2>
          <p className="max-w-md text-sm leading-relaxed" style={{ color: '#555' }}>
            See the health of your business at a glance. Marketing, communications,
            finance, commerce, and analytics — all synthesized into clear, actionable signals.
          </p>
          <div className="flex items-center gap-8 pt-4">
            {[
              { value: '5', label: 'Business modes' },
              { value: 'AI', label: 'Intelligence brief' },
              { value: '1', label: 'Unified inbox' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="font-mono text-xl font-bold" style={{ color: '#8B7FF0' }}>{stat.value}</div>
                <div className="text-xs" style={{ color: '#3a3a4a' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs" style={{ color: '#2a2a3a' }}>
          Trusted by small business owners everywhere.
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 relative" style={{ background: '#0a0a0f' }}>
        {/* Subtle top accent line */}
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, oklch(0.62 0.24 268 / 0.4), transparent)' }}
        />
        <div className="lg:hidden mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#8B7FF0' }}>Signalgent</h1>
          <p className="text-sm" style={{ color: '#444' }}>Business OS</p>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
