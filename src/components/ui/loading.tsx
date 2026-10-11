import { cn } from "@/lib/utils";

export function LoadingState({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-center justify-center gap-3 py-16 text-sm text-slate-500", className)}
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-rose-500" />
      {label}…
    </div>
  );
}
