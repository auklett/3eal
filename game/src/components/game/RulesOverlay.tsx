interface RulesOverlayProps {
  onClose: () => void;
}

export default function RulesOverlay({ onClose }: RulesOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl shadow-black/60 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="rules-title" className="text-3xl font-bold text-white">Game Rules</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules"
            className="group flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 shadow-sm transition-all duration-200 hover:scale-105 hover:border-white hover:bg-white hover:text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90"
            >
              <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="space-y-7 text-white">
          <section>
            <h3 className="mb-2 text-xl font-bold">Objective</h3>
            <p>Be the first to have 9 cards on your Table that can be partitioned into 3 valid sets.</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Zones and cards</h3>
            <p>The Table holds up to 9 Normal and TEAL cards. Your Hand holds Action cards and has no size limit. Table cards start Concealed; only you can see their faces until Revealed.</p>
            <p className="mt-2">The 120-card deck has 105 Normal cards, 3 TEAL wild cards, and 12 Action cards (3 each of CONCEAL, STEAL, REVEAL, and APPEAL).</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Valid sets</h3>
            <p>Each set contains 3 Table cards. All cards must share the same color, number, or shape. TEAL is always Teal; it can adopt any number or shape to complete a matching set. Consecutive numbers are not a valid pattern.</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Turn flow</h3>
            <ol className="list-inside list-decimal space-y-2">
              <li>Draw one card: Normal/TEAL goes to your Table; Action goes to your Hand.</li>
              <li>During Main, discard Table cards or play CONCEAL, STEAL, or REVEAL actions in any order.</li>
              <li>Eligible players may APPEAL during the 30-second interrupt window. An APPEAL cancels the action and discards both cards.</li>
              <li>Discard down to 9 Table cards, then check for a win.</li>
            </ol>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Actions</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>CONCEAL:</strong> hide one of your Revealed Table cards. Any opponent may APPEAL.</li>
              <li><strong>STEAL:</strong> take any Normal or TEAL card from an opponent’s Table. Revealed cards are selected directly; Concealed cards are selected blindly. The target may APPEAL.</li>
              <li><strong>REVEAL:</strong> reveal a Concealed card on an opponent’s Table, selected blindly. The target may APPEAL.</li>
              <li><strong>APPEAL:</strong> play during an interrupt to cancel CONCEAL, STEAL, or REVEAL. A CONCEAL may be appealed by any opponent; other actions only by their target.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
