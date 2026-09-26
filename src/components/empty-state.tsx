import { IconArchive } from "@/components/icons";

export function EmptyState({
  message,
  action,
  icon,
}: {
  message: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 py-10 text-center">
      <span className="text-muted-foreground">{icon ?? <IconArchive className="h-5 w-5" />}</span>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {action}
    </div>
  );
}
