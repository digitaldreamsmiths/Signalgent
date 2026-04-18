import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Trend = 'up' | 'down' | 'flat'
type Status = 'healthy' | 'warning' | 'critical' | 'neutral'

interface KpiCardProps {
  label: string
  value: string
  trend?: Trend
  trendValue?: string
  status?: Status
  icon?: React.ReactNode
  accentHex?: string
  className?: string
}

const statusColors: Record<Status, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  neutral: 'bg-muted-foreground/40',
}

const trendColors: Record<Trend, string> = {
  up: 'text-emerald-500',
  down: 'text-red-500',
  flat: 'text-muted-foreground',
}

const TrendIcon = ({ trend }: { trend: Trend }) => {
  if (trend === 'up') return <TrendingUp className="h-3 w-3" />
  if (trend === 'down') return <TrendingDown className="h-3 w-3" />
  return <Minus className="h-3 w-3" />
}

export function KpiCard({
  label,
  value,
  trend = 'flat',
  trendValue,
  status = 'neutral',
  icon,
  accentHex,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-card p-3 transition-colors',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', statusColors[status])} />
          {icon && (
            <span
              className="text-muted-foreground"
              style={accentHex ? { color: accentHex } : undefined}
            >
              {icon}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {trendValue && (
          <span className={cn('flex items-center gap-0.5 text-xs font-medium', trendColors[trend])}>
            <TrendIcon trend={trend} />
            {trendValue}
          </span>
        )}
      </div>
    </div>
  )
}
