export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Light, to match the workspace. The previous dark panel inherited the light
  // theme's text tokens, which left the form labels near-invisible.
  const ink = '#253047'
  const blue = '#3461db'
  const copy = '#4f6685' // 5.1:1 on the tinted panel
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#e9f0fb', borderRight: '1px solid #dce6f6' }}
      >
        {/* Animated glow orbs */}
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />

        {/* Fine dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(52, 97, 219, 0.16) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Gradient fade at edges */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, #e9f0fb 85%)',
          }}
        />

        {/* Content */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: blue, boxShadow: '0 0 8px 2px rgba(52, 97, 219, 0.45)' }}
            />
            <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: blue, letterSpacing: '0.15em' }}>
              Signalgent
            </h1>
          </div>
          <p className="mt-2 text-xs" style={{ color: copy }}>Email &amp; Social</p>
        </div>

        <div className="relative space-y-6">
          <h2
            className="text-3xl font-bold leading-tight tracking-tight"
            style={{ color: ink }}
          >
            Your email and social,<br />
            <span style={{ color: blue }}>one workspace.</span>
          </h2>
          <p className="max-w-md text-sm leading-relaxed" style={{ color: copy }}>
            Read and reply from your inbox, plan posts and newsletters on one calendar,
            and keep every contact and campaign in the same place.
          </p>
          <div className="flex items-center gap-8 pt-4">
            {[
              { value: '1', label: 'Shared inbox' },
              { value: '5', label: 'Content channels' },
              { value: '1', label: 'Calendar' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="font-mono text-xl font-bold" style={{ color: blue }}>{stat.value}</div>
                <div className="text-xs" style={{ color: copy }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs" style={{ color: copy }}>
          Built for small businesses that run on conversations.
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 relative" style={{ background: '#f8fafd' }}>
        {/* Subtle top accent line */}
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52, 97, 219, 0.4), transparent)' }}
        />
        <div className="lg:hidden mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: blue }}>Signalgent</h1>
          <p className="text-sm" style={{ color: copy }}>Email &amp; Social</p>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
