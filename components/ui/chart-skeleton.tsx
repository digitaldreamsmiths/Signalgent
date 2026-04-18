import { cn } from '@/lib/utils'

interface ChartSkeletonProps {
  className?: string
  variant?: 'area' | 'bar' | 'line'
}

export function ChartSkeleton({ className, variant = 'area' }: ChartSkeletonProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-card p-4', className)}>
      {/* Y-axis labels */}
      <div className="absolute left-3 top-4 flex h-[calc(100%-3rem)] flex-col justify-between">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-2.5 w-6 animate-pulse rounded bg-muted" />
        ))}
      </div>

      {/* Chart area */}
      <div className="ml-10 flex h-full items-end gap-1">
        {variant === 'bar' ? (
          /* Bar chart skeleton */
          <div className="flex h-full w-full items-end gap-1.5 pb-6">
            {[65, 40, 80, 55, 70, 45, 90, 60, 75, 50, 85, 65].map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-t bg-muted"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        ) : (
          /* Area/line chart skeleton */
          <div className="relative h-full w-full pb-6">
            <svg
              viewBox="0 0 300 100"
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              <path
                d="M0,80 C30,70 60,30 90,40 C120,50 150,20 180,35 C210,50 240,15 270,25 L300,20 L300,100 L0,100 Z"
                className="animate-pulse fill-muted"
              />
              <path
                d="M0,80 C30,70 60,30 90,40 C120,50 150,20 180,35 C210,50 240,15 270,25 L300,20"
                className="fill-none stroke-muted-foreground/20"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="ml-10 mt-2 flex justify-between">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-2 w-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  )
}
