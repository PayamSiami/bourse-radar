export default function StockSkeleton() {
  return (
    <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-5 flex flex-col gap-4">
      <div className="flex justify-between">
        <div className="space-y-2">
          <div className="h-5 w-20 rounded skeleton" />
          <div className="h-3 w-32 rounded skeleton" />
        </div>
        <div className="h-5 w-20 rounded-full skeleton" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded skeleton" />
        <div className="h-1.5 w-full rounded-full skeleton" />
      </div>
      <div className="flex justify-between items-end">
        <div className="h-8 w-24 rounded skeleton" />
        <div className="h-6 w-16 rounded skeleton" />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800/80">
        {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded skeleton" />)}
      </div>
    </div>
  );
}