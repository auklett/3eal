import { useRef } from 'react';
import Panel from '../ui/Panel';
import IconButton from '../ui/IconButton';
import { useDialog } from '../../hooks/useDialog';

interface RulesOverlayProps {
  onClose: () => void;
}

export default function RulesOverlay({ onClose }: RulesOverlayProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialog(dialogRef, onClose, true);
  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/85 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
    >
      <Panel ref={dialogRef} padding="roomy" className="mx-auto max-w-3xl bg-black/90 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="rules-title" className="text-2xl font-semibold text-white sm:text-3xl">Game Rules</h2>
          <IconButton label="Close rules" onClick={onClose}>
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </IconButton>
        </div>
        <div className="space-y-7 text-white/90">
          <section>
            <h3 className="mb-2 text-lg font-semibold text-white">Objective</h3>
            <p>Be the first player to build three valid sets of three cards (nine cards total) on your Table.</p>
          </section>
          <section>
            <h3 className="mb-2 text-lg font-semibold text-white">Cards and colors</h3>
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
            <h3 className="mb-2 text-lg font-semibold text-white">Zones and privacy</h3>
            <p>Your Table starts with three concealed Normal/TEAL cards. Your Hand is private and has no size limit. You see only your own hand count — never another player’s. A small eye badge marks the cards that are revealed to everyone. Players see their own concealed cards; spectators receive exactly the same public view as opponents.</p>
            <p className="mt-2">Stealing preserves whether a card is concealed or revealed. The thief sees the stolen card in their private view. Everyone sees all cards after the game ends. There is no chat.</p>
          </section>
          <section>
            <h3 className="mb-2 text-lg font-semibold text-white">Sets and turn flow</h3>
            <p>A set contains three cards that share a color, number, or shape. At the end of your turn, the game searches every way to partition your nine Table cards into three valid sets.</p>
            <ol className="mt-2 list-inside list-decimal space-y-2">
              <li>Draw one card into your Hand at turn start.</li>
              <li>During Main, move Normal/TEAL cards from Hand to an open Table slot; with nine Table cards, swap with a selected Table card.</li>
              <li>You may move Table cards to Hand, play actions, and end your turn. Unplayed APPEAL cards stay in Hand between turns; all other Hand and moved Table cards are shuffled straight back into the deck at end of turn.</li>
              <li>If a STEAL leaves more than nine cards on your Table, move extras to Hand before ending. A timed-out turn ends automatically.</li>
            </ol>
            <p className="mt-2">Turns default to 60 seconds. The host can set 15–180 seconds in the lobby. The turn timer pauses during an interrupt. The host can also pause and resume at any time during play, which freezes every timer until play resumes.</p>
          </section>
          <section>
            <h3 className="mb-2 text-lg font-semibold text-white">Actions and interrupts</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>CONCEAL:</strong> hide one of your revealed Table cards. Any opponent may APPEAL.</li>
              <li><strong>STEAL:</strong> take a Normal/TEAL card from an opponent’s Table; concealed cards are chosen blindly. Only the target may APPEAL.</li>
              <li><strong>REVEAL:</strong> reveal a concealed card on an opponent’s Table, chosen blindly. Only the target may APPEAL.</li>
              <li><strong>APPEAL:</strong> cancel CONCEAL, STEAL, or REVEAL; both action cards are shuffled straight into the deck. APPEAL cannot be appealed.</li>
            </ul>
            <p className="mt-2">An interrupt lasts at most 30 seconds and ends immediately on the first APPEAL, when all APPEAL holders pass, or when time expires. Players without APPEAL pass automatically. REVEAL with no concealed target card is rejected without consuming the action.</p>
          </section>
        </div>
      </Panel>
    </div>
  );
}
