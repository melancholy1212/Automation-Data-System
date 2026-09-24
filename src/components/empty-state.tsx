export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-border py-8 text-center">
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {action}
    </div>
  );
}
