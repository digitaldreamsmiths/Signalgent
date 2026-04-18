import { cn } from '@/lib/utils'

type ActivityStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface ActivityItemProps {
  icon?: React.ReactNode
  title: string
  description?: string
  time: string
  status?: ActivityStatus
  className?: string
}

const dotColors: Record<ActivityStatus, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-muted-foreground/40',
}

export function ActivityItem({
  icon,
  title,
  description,
  time,
  status = 'neutral',
  className,
}: ActivityItemProps) {
  return (
    <div className={cn('flex gap-3 py-2', className)}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1">
        <span className={cn('h-2 w-2 rounded-full', dotColors[status])} />
        <span className="mt-1 h-full w-px bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span>
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}
