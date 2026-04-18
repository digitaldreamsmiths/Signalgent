import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface DataTableSkeletonProps {
  columns?: number
  rows?: number
  className?: string
}

export function DataTableSkeleton({ columns = 5, rows = 5, className }: DataTableSkeletonProps) {
  const colWidths = ['w-[30%]', 'w-[20%]', 'w-[15%]', 'w-[15%]', 'w-[12%]', 'w-[10%]']

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border', className)}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border bg-muted/30 px-4 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3', colWidths[i % colWidths.length])}
          />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0"
        >
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton
              key={col}
              className={cn(
                'h-3',
                colWidths[col % colWidths.length],
                col === 0 && 'h-3.5'
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
