export default function EarningsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-white">Illustrative Payment Breakdown</h1>
        <p className="mt-1 text-xs text-slate-400">A single example to explain possible payment costs. This is not a live quote or tax calculation.</p>
      </header>
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="space-y-3 font-mono text-xs">
          <div className="flex justify-between text-slate-200"><span>Example client payment</span><strong>USD 1,000.00</strong></div>
          <div className="flex justify-between text-rose-300"><span>Illustrative processing fee</span><span>- USD 44.30</span></div>
          <div className="flex justify-between text-rose-300"><span>Illustrative FX impact</span><span>- USD 25.00</span></div>
          <div className="flex justify-between border-t border-slate-700 pt-3 text-white"><strong>Estimated before tax</strong><strong>USD 930.70</strong></div>
        </div>
        <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-5 text-slate-400">Example assumptions only. Actual PayPal fees, exchange rates, settlement amounts and tax obligations vary. No tax, GST or TDS determination is made here.</p>
      </section>
    </main>
  );
}
