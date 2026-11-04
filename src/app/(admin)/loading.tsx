export default function AdminLoading() {
  return (
    <div aria-label="Loading page" className="grid animate-pulse gap-6" role="status">
      <span className="sr-only">Loading page…</span>
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-10 w-full rounded-md bg-muted" />
      <div className="h-72 w-full rounded-xl bg-muted" />
    </div>
  );
}
