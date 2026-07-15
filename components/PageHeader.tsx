export function PageHeader({
  eyebrow,
  title,
  caret = false,
  right,
}: {
  eyebrow?: string;
  title: string;
  caret?: boolean;
  right?: React.ReactNode;
}) {
  // No descriptions under titles — Alex built it, he knows what it does.
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="page-eyebrow mb-2 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">
            {eyebrow}
          </div>
        )}
        <h1 className={`text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]${caret ? ' caret-blink' : ''}`}>
          {title}
        </h1>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}
