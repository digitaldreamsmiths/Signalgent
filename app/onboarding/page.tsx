'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'

const INDUSTRIES = [
  'Technology',
  'Retail',
  'Services',
  'Healthcare',
  'Food & Beverage',
  'Real Estate',
  'Finance',
  'Marketing Agency',
  'Consulting',
  'Other',
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function OnboardingPage() {
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState('')

  // Step 2
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value)
    setWorkspaceSlug(slugify(value))
  }

  function handleStep1Next(e: React.FormEvent) {
    e.preventDefault()
    setStep(2)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName,
          workspaceSlug,
          companyName,
          industry: industry || null,
          website: website || null,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const step = payload.step ? ` (step: ${payload.step})` : ''
        throw new Error((payload.error ?? `Onboarding failed (HTTP ${res.status})`) + step)
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Something went wrong'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Signalgent</h1>
        <p className="text-sm text-muted-foreground">Set up your command center</p>
      </div>

      {/* Progress bar */}
      <div className="mb-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-medium ${step >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
            Workspace
          </span>
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>
          <span className={`text-xs font-medium ${step >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
            Company
          </span>
        </div>
      </div>

      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleStep1Next} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Name your workspace
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This could be your company name, team name, or your own name.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                  placeholder="Acme Inc."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-slug">Slug</Label>
                <Input
                  id="workspace-slug"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value)}
                  placeholder="acme-inc"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Used in URLs. Must be unique.
                </p>
              </div>
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Add your first business
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can add more companies to your workspace later.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={industry} onValueChange={(v) => setIndustry(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website (optional)</Label>
                <Input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Setting up...' : 'Launch command center'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
