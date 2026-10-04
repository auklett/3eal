import type { Card } from '../../types';
import CardComponent from '../cards/CardComponent';

interface RulesOverlayProps {
  onClose: () => void;
}

const examples: Array<{ title: string; cards: Card[] }> = [
  {
    title: 'Same color',
    cards: [
      { id: 'color-1', category: 'NORMAL', isRevealed: true, color: '008080', number: 2, shape: 'circle' },
      { id: 'color-2', category: 'NORMAL', isRevealed: true, color: '008080', number: 4, shape: 'square' },
      { id: 'color-3', category: 'NORMAL', isRevealed: true, color: '008080', number: 7, shape: 'hexagon' }
    ]
  },
  {
    title: 'Same number',
    cards: [
      { id: 'number-1', category: 'NORMAL', isRevealed: true, color: 'C0C0FF', number: 5, shape: 'circle' },
      { id: 'number-2', category: 'NORMAL', isRevealed: true, color: '008080', number: 5, shape: 'triangle' },
      { id: 'number-3', category: 'NORMAL', isRevealed: true, color: 'C06060', number: 5, shape: 'square' }
    ]
  },
  {
    title: 'Same shape',
    cards: [
      { id: 'shape-1', category: 'NORMAL', isRevealed: true, color: 'C0C0FF', number: 1, shape: 'pentagon' },
      { id: 'shape-2', category: 'NORMAL', isRevealed: true, color: '008080', number: 3, shape: 'pentagon' },
      { id: 'shape-3', category: 'NORMAL', isRevealed: true, color: 'C06060', number: 6, shape: 'pentagon' }
    ]
  },
  {
    title: 'Wild completes a set',
    cards: [
      { id: 'wild-number-1', category: 'NORMAL', isRevealed: true, color: 'C0C0FF', number: 4, shape: 'circle' },
      { id: 'wild-number-2', category: 'NORMAL', isRevealed: true, color: 'C06060', number: 4, shape: 'triangle' },
      { id: 'wild-number-3', category: 'WILD', isRevealed: true, color: '008080', title: 'TEAL' }
    ]
  }
];

const actionCards: Card[] = [
  { id: 'action-conceal', category: 'ACTION', isRevealed: false, title: 'CONCEAL', description: 'Hide your revealed card' },
  { id: 'action-steal', category: 'ACTION', isRevealed: false, title: 'STEAL', description: 'Take a card from an opponent' },
  { id: 'action-reveal', category: 'ACTION', isRevealed: false, title: 'REVEAL', description: 'Expose a concealed card' },
  { id: 'action-appeal', category: 'ACTION', isRevealed: false, title: 'APPEAL', description: 'Cancel an action' }
];

export default function RulesOverlay({ onClose }: RulesOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl shadow-black/60 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="rules-title" className="text-3xl font-bold text-white">Game Rules</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules"
            className="group flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 shadow-sm transition-all duration-200 hover:scale-105 hover:border-white hover:bg-white hover:text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90"><use href="#icon-close" /></svg>
          </button>
        </div>
        <div className="space-y-8 text-white">
          <section>
            <h3 className="mb-2 text-xl font-bold">Objective</h3>
            <p>Be the first to have 9 cards on your Table that can be partitioned into 3 valid sets.</p>
          </section>

          <section>
            <h3 className="mb-3 text-xl font-bold">Card types</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <article className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
                <h4 className="mb-3 font-semibold">Normal · 175 cards</h4>
                <div className="mb-3 flex justify-center">
                  <CardComponent card={{ id: 'normal-example', category: 'NORMAL', isRevealed: true, color: 'C0C0FF', number: 3, shape: 'triangle' }} />
                </div>
                <p className="text-sm text-white/75">A fixed color, number, and shape. Normal cards can be placed on your Table or shuffled back into the deck.</p>
              </article>
              <article className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
                <h4 className="mb-3 font-semibold">Wild · 3 TEAL cards</h4>
                <div className="mb-3 flex justify-center">
                  <CardComponent card={{ id: 'wild-example', category: 'WILD', isRevealed: true, color: '008080', title: 'TEAL' }} />
                </div>
                <p className="text-sm text-white/75">Always Teal for color sets; may match any number or shape when completing a set.</p>
              </article>
              <article className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
                <h4 className="mb-3 font-semibold">Action · 40 cards</h4>
                <div className="mb-3 flex justify-center">
                  <CardComponent card={actionCards[1]} />
                </div>
                <p className="text-sm text-white/75">Ten copies of each action. Play actions during your turn; unused Action cards stay in your Hand.</p>
              </article>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              {actionCards.map((card) => (
                <div key={card.id} className="text-center">
                  <CardComponent card={card} />
                  <p className="mt-2 max-w-24 text-xs text-white/70">{card.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-bold">Valid sets</h3>
            <p className="mb-4">Each set contains 3 Table cards. All cards must share the same color, number, or shape. Consecutive numbers do not count. TEAL may act as any number or shape.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {examples.map((example) => (
                <figure key={example.title} className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
                  <figcaption className="mb-3 text-center font-semibold">{example.title}</figcaption>
                  <div className="flex flex-wrap justify-center gap-2">
                    {example.cards.map((card) => <CardComponent key={card.id} card={card} />)}
                  </div>
                </figure>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-bold">Setup and turns</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>Each player starts with 3 revealed cards on their Table and an empty Hand. The eye icon at the top of a card means everyone can see it.</li>
              <li>At the start of your turn, draw 1 card into your Hand. Move Normal/TEAL cards onto open Table slots; at 9 cards, swap with a selected card.</li>
              <li>You may move Table cards to your Hand. At turn end, Normal/TEAL cards in your Hand are shuffled into the draw deck; Action cards remain in your Hand.</li>
              <li>There is no discard pile. Discarded cards are shuffled directly into the draw deck.</li>
              <li>If a STEAL leaves you with more than 9 Table cards, move the extras to your Hand before ending your turn. Reach 9 cards that form 3 valid sets to win.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xl font-bold">Actions and reconnecting</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>CONCEAL:</strong> hide one of your revealed Table cards. Any opponent may APPEAL.</li>
              <li><strong>STEAL:</strong> take a Normal or TEAL card from an opponent&apos;s Table. Revealed cards are selected directly; concealed cards are selected blindly. The target may APPEAL.</li>
              <li><strong>REVEAL:</strong> expose a concealed card on an opponent&apos;s Table, selected blindly. The target may APPEAL.</li>
              <li><strong>APPEAL:</strong> cancel CONCEAL, STEAL, or REVEAL during its 30-second interrupt window. Both action cards are shuffled into the deck.</li>
              <li>Players heartbeat every 15 seconds. An away active player's turn is skipped; three consecutive missed turns forfeit the seat. Rejoining by unique name requires host approval, and late joiners may spectate.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
