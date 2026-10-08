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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 transition hover:border-white hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="space-y-7 text-white">
          <section>
            <h3 className="mb-2 text-xl font-bold">Objective</h3>
            <p>Be the first player to build three valid sets of three cards (nine cards total) on your Table.</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Cards and colors</h3>
            <p>The 218-card deck has 175 Normal cards, 3 TEAL wild cards, and 40 Action cards (10 each of CONCEAL, STEAL, REVEAL, and APPEAL).</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              <li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#C0C0FF]" />Periwinkle · C0C0FF</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#008080]" />Teal · 008080</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#C06060]" />Rose · C06060</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#884488]" />Grape Soda · 884488</li>
              <li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#404088]" />French Blue · 404088</li>
            </ul>
            <p className="mt-2">Normal cards use numbers 1–7 and five shapes. TEAL is a distinct wild card: it is always Teal for color sets, but may adopt any number or shape.</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Zones and privacy</h3>
            <p>Your Table starts with three concealed Normal/TEAL cards. Your Hand is private and has no size limit. Public views show everyone’s hand size, never its contents. Players see their own concealed cards; spectators receive exactly the same public view as opponents.</p>
            <p className="mt-2">Stealing preserves whether a card is concealed or revealed. The thief sees the stolen card in their private view. Everyone sees all cards after the game ends. There is no chat.</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Sets and turn flow</h3>
            <p>A set contains three cards that share a color, number, or shape. At the end of your turn, the game searches every way to partition your nine Table cards into three valid sets.</p>
            <ol className="mt-2 list-inside list-decimal space-y-2">
              <li>Draw one card into your Hand at turn start.</li>
              <li>During Main, move Normal/TEAL cards from Hand to an open Table slot; with nine Table cards, swap with a selected Table card.</li>
              <li>You may move Table cards to Hand for discard, play actions, and end your turn. Unplayed APPEAL cards stay in Hand between turns; other cards are discarded.</li>
              <li>If a STEAL leaves more than nine cards on your Table, move extras to Hand before ending. A timed-out turn ends automatically.</li>
            </ol>
            <p className="mt-2">Turns default to 60 seconds. The host can set 15–180 seconds in the lobby. The turn timer pauses during an interrupt.</p>
          </section>
          <section>
            <h3 className="mb-2 text-xl font-bold">Actions and interrupts</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>CONCEAL:</strong> hide one of your revealed Table cards. Any opponent may APPEAL.</li>
              <li><strong>STEAL:</strong> take a Normal/TEAL card from an opponent’s Table; concealed cards are chosen blindly. Only the target may APPEAL.</li>
              <li><strong>REVEAL:</strong> reveal a concealed card on an opponent’s Table, chosen blindly. Only the target may APPEAL.</li>
              <li><strong>APPEAL:</strong> cancel CONCEAL, STEAL, or REVEAL and discard both action cards. APPEAL cannot be appealed.</li>
            </ul>
            <p className="mt-2">An interrupt lasts at most 30 seconds and ends immediately on the first APPEAL, when all APPEAL holders pass, or when time expires. Players without APPEAL pass automatically. REVEAL with no concealed target card is rejected without consuming the action.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
