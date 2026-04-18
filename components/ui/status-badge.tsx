import { cn } from '@/lib/utils'

type BadgeVariant = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral'

interface StatusBadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  neutral: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ variant = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        variantStyles[variant],
        className
      )}
    >
      <span
        className={cn('h-1 w-1 rounded-full', {
          'bg-emerald-500': variant === 'healthy',
          'bg-amber-500': variant === 'warning',
          'bg-red-500': variant === 'critical',
          'bg-blue-500': variant === 'info',
          'bg-muted-foreground': variant === 'neutral',
        })}
      />
      {children}
    </span>
  )
}
