import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Nativní rozbalovací seznam.
 *
 * Záměrně bez vlastní implementace: na tabletu v hale otevře systémový výběr,
 * který se ovládá v rukavicích líp než seznam vykreslený v prohlížeči.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-dotyk w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Select.displayName = 'Select'

export { Select }
