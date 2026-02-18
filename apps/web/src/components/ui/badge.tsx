import { cn } from '@/lib/utils';

export function Badge({ className, children }: { className?: string; children: string }) {
  return <span className={cn('rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700', className)}>{children}</span>;
}
