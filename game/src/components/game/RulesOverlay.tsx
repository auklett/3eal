import { useRef, type ReactNode, type SVGProps } from 'react';
import Panel from '../ui/Panel';
import Chip from '../ui/Chip';
import Badge from '../ui/Badge';
import IconButton from '../ui/IconButton';
import CardComponent from '../cards/CardComponent';
import { CloseIcon } from '../icons/IconSprite';
import { useDialog } from '../../hooks/useDialog';
import {
  actionExamples,
  goalRows,
  revealedExample,
  setExamples,
  typeExamples,
  type SetExample
} from '../../logic/rulesExamples';

interface RulesOverlayProps {
  onClose: () => void;
}

/** A calm sentence-case heading; never all-caps. */
function Section({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <section className="motion-safe:animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="mb-3 text-sm font-semibold text-white/80">{title}</h3>
      {children}
    </section>
  );
}

/** The one-time pulse under a card that shares the set's trait. */
function TraitMark() {
  return (
    <span
      aria-hidden="true"
      className="mx-auto mt-1.5 block h-[3px] w-8 rounded-full bg-white/45 motion-safe:animate-trait-pulse"
    />
  );
}

function SetPanel({ example }: { example: SetExample }) {
  return (
    <Panel padding="compact" role="group" aria-label={example.ariaLabel} className="flex flex-col items-center gap-2">
      <div className="flex items-start justify-center gap-2">
        {example.cards.map((card) => (
          <div key={card.id} className="flex flex-col items-center">
            <CardComponent card={card} size="rules" showRevealBadge={false} />
            <TraitMark />
          </div>
        ))}
      </div>
      <Chip>{example.trait}</Chip>
    </Panel>
  );
}

function StepIcon({ name }: { name: 'draw' | 'play' | 'act' | 'end' }) {
  const common: SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };
  if (name === 'draw') {
    return <svg {...common}><path d="M12 3v10" /><path d="M7 9l5 5 5-5" /><path d="M5 20h14" /></svg>;
  }
  if (name === 'play') {
    return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 17h6M17 14v6" /></svg>;
  }
  if (name === 'act') {
    return <svg {...common}><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" /></svg>;
  }
  return <svg {...common}><path d="M5 12l4 4L19 6" /></svg>;
}

const TYPES = [
  { card: typeExamples[0], name: 'Normal', count: '175', caption: 'Five colors, numbers and shapes.' },
  { card: typeExamples[1], name: 'Teal Wild', count: '3', caption: 'Always Teal. Any number or shape.' },
  { card: typeExamples[2], name: 'Action', count: '40', caption: 'Play them during a turn.' }
];

const ACTIONS = [
  { card: actionExamples[0], caption: 'Hide one of your revealed cards.', badge: 'Anyone can APPEAL' },
  { card: actionExamples[1], caption: 'Take a card from an opponent.', badge: 'Target can APPEAL' },
  { card: actionExamples[2], caption: "Flip an opponent's hidden card.", badge: 'Target can APPEAL' },
  { card: actionExamples[3], caption: 'Cancel CONCEAL, STEAL or REVEAL.', badge: "Can't be appealed" }
];

const STEPS = [
  { name: 'draw' as const, label: 'Draw', caption: 'Draw 1 card' },
  { name: 'play' as const, label: 'Play', caption: 'Fill your Table' },
  { name: 'act' as const, label: 'Act', caption: 'Use Action cards' },
  { name: 'end' as const, label: 'End', caption: 'Pass the turn' }
];

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
          <IconButton
            label="Close rules"
            onClick={onClose}
            className="rounded-xl border-white/10 bg-transparent hover:bg-white/10"
          >
            <CloseIcon />
          </IconButton>
        </div>

        <div className="space-y-8">
          {/* 1. Goal */}
          <Section title="Goal" delay={0}>
            <div
              className="mx-auto flex w-fit flex-col gap-2"
              role="group"
              aria-label="A winning table: three rows, each a complete set of three cards"
            >
              {goalRows.map((row, rowIndex) => (
                <div key={`goal-row-${rowIndex}`} className="flex justify-center gap-2 rounded-xl border border-line p-2">
                  {row.map((card) => (
                    <CardComponent key={card.id} card={card} size="rules" showRevealBadge={false} />
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-sm text-white/70">Build 3 sets of 3 on your Table.</p>
          </Section>

          {/* 2. Valid sets */}
          <Section title="Valid sets" delay={40}>
            <div className="grid gap-3 sm:grid-cols-2">
              {setExamples.map((example) => <SetPanel key={example.id} example={example} />)}
            </div>
          </Section>

          {/* 3. Card types */}
          <Section title="Card types" delay={80}>
            <div className="grid grid-cols-3 gap-3">
              {TYPES.map(({ card, name, count, caption }) => (
                <div key={card.id} className="flex flex-col items-center gap-2 text-center">
                  <span className="text-xs font-semibold text-white/80">{name}</span>
                  <CardComponent card={card} size="rules" showRevealBadge={false} />
                  <Chip>{count}</Chip>
                  <p className="text-xs text-white/60">{caption}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. Action cards */}
          <Section title="Action cards" delay={120}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ACTIONS.map(({ card, caption, badge }) => (
                <div key={card.id} className="flex flex-col items-center gap-2 text-center">
                  <CardComponent card={card} size="rules" showRevealBadge={false} />
                  <p className="text-xs text-white/70">{caption}</p>
                  <Badge>{badge}</Badge>
                </div>
              ))}
            </div>
          </Section>

          {/* 5. Your turn */}
          <Section title="Your turn" delay={160}>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {STEPS.map((step, index) => (
                <div key={step.name} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1 rounded-[var(--radius-control)] border border-line px-3 py-2 text-white/80">
                    <StepIcon name={step.name} />
                    <span className="text-xs font-semibold">{step.label}</span>
                    <span className="text-[11px] text-white/55">{step.caption}</span>
                  </div>
                  {index < STEPS.length - 1 && <span aria-hidden="true" className="text-white/30">→</span>}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center">
              <Chip>60s per turn</Chip>
            </p>
          </Section>

          {/* 6. Hidden vs revealed */}
          <Section title="Hidden vs revealed" delay={200}>
            <div className="flex items-start justify-center gap-6">
              <CardComponent card={revealedExample} size="rules" />
              <CardComponent card={typeExamples[0]} size="rules" faceDown />
            </div>
            <p className="mt-3 text-center text-sm text-white/70">Eye = everyone can see it.</p>
          </Section>

          {/* 7. Quick facts */}
          <Section title="Quick facts" delay={240}>
            <div className="flex flex-wrap justify-center gap-2">
              <Chip>Appeal window 30s max</Chip>
              <Chip>Action cards stay in Hand until played</Chip>
              <Chip>Other Hand cards return to the deck</Chip>
              <Chip>Host can pause anytime</Chip>
            </div>
          </Section>
        </div>
      </Panel>
    </div>
  );
}
