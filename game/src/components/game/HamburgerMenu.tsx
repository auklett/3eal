import { useState } from 'react';

interface HamburgerMenuProps {
  players: Array<{ id: string; name: string; hand: any[] }>;
  onClose?: () => void;
}

export default function HamburgerMenu({ players, onClose }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);

  // The hamburger/X button is now context-aware:
  // - On a sub-page (Rules/Players) -> goes back to the menu drawer
  // - On the menu drawer -> closes everything
  // - Closed -> opens the menu drawer
  const handleToggle = () => {
    if (showRules || showPlayers) {
      setShowRules(false);
      setShowPlayers(false);
      setIsOpen(true);
      return;
    }
    setIsOpen((s) => {
      const newState = !s;
      if (!newState) {
        onClose?.();
      }
      return newState;
    });
  };

  const handleCloseAll = () => {
    setIsOpen(false);
    setShowRules(false);
    setShowPlayers(false);
    onClose?.();
  };

  // From a sub-page, go back to the menu drawer (not a full close).
  const handleBackToMenu = () => {
    setShowRules(false);
    setShowPlayers(false);
    setIsOpen(true);
  };

  const handleShowRules = () => {
    setShowRules(true);
    setShowPlayers(false);
    setIsOpen(true);
  };

  const handleShowPlayers = () => {
    setShowPlayers(true);
    setShowRules(false);
    setIsOpen(true);
  };

  const barStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    transition: 'transform 220ms ease, opacity 150ms ease, top 220ms ease',
  };

  const menuButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 0',
    borderRadius: '16px',
    fontWeight: 600,
    fontSize: '16px',
    color: '#FFFFFF',
    backgroundColor: '#000000',
    border: '2px solid #FFFFFF',
    transition: 'background-color 150ms ease, color 150ms ease',
    cursor: 'pointer',
  };

  return (
    <>
      {/* Hamburger Icon - Top Right - toggles open/close and morphs into a well-defined X */}
      <button
        onClick={handleToggle}
        aria-label="Menu"
        style={{
          position: 'fixed',
          top: '16px',
          right: '12px',
          zIndex: 300,
          backgroundColor: 'transparent',
          border: 'none',
          padding: 8,
          minWidth: '52px',
          minHeight: '52px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        {isOpen && (
          <span
            style={{
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '16px',
              letterSpacing: '0.02em',
              textAlign: 'left',
            }}
          >
            Menu
          </span>
        )}
        <div style={{ position: 'relative', width: 32, height: 28 }}>
          <span
            style={{
              ...barStyle,
              top: isOpen ? 12 : 0,
              transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
          />
          <span
            style={{
              ...barStyle,
              top: 12,
              opacity: isOpen ? 0 : 1,
            }}
          />
          <span
            style={{
              ...barStyle,
              top: isOpen ? 12 : 24,
              transform: isOpen ? 'rotate(-45deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {/* Right-side Drawer Menu with backdrop, seamlessly attached to the hamburger icon */}
      {isOpen && !showRules && !showPlayers && (
        <>
          <div
            onClick={handleCloseAll}
            aria-hidden
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 90,
              backgroundColor: 'rgba(0,0,0,0.7)',
            }}
          />

          <div
            style={{
              position: 'fixed',
              top: 0,
              bottom: 0,
              right: 0,
              zIndex: 95,
              width: '288px',
              maxWidth: '85vw',
              backgroundColor: '#000000',
              borderLeft: '2px solid #FFFFFF',
              boxShadow: '-8px 0 30px rgba(0,0,0,0.6)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              animation: 'hm-slide-in 220ms ease-out',
            }}
          >
            <div style={{ marginTop: 52 }} />

            <div className="space-y-4 mt-2">
              <button
                onClick={handleShowRules}
                style={menuButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#000000';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
              >
                Rules
              </button>
              <button
                onClick={handleShowPlayers}
                style={menuButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#000000';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
              >
                Players
              </button>
            </div>
          </div>

          <style>{`
            @keyframes hm-slide-in {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}

      {/* Rules Page - fully opaque, scrollable, connects back to the menu */}
      {showRules && (
        <div
          onClick={handleBackToMenu}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            backgroundColor: '#000000',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '768px',
              margin: '0 auto',
              padding: '80px 24px 64px',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid #FFFFFF',
                borderRadius: '24px',
                padding: '32px',
              }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-4xl font-bold text-white">Game Rules</h2>
                <button
                  onClick={handleBackToMenu}
                  style={{
                    color: '#FFFFFF',
                    border: '2px solid #FFFFFF',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ← Back to Menu
                </button>
              </div>

              <div className="space-y-8 text-white">
                <section>
                  <h3 className="text-2xl font-bold text-white mb-4 border-b border-white/40 pb-2">Objective</h3>
                  <p className="text-lg leading-relaxed text-white">Be the first player to form 3 complete sets of 3 cards (9 cards total) to win.</p>
                </section>

                <section>
                  <h3 className="text-2xl font-bold text-white mb-4 border-b border-white/40 pb-2">Valid Set Patterns</h3>
                  <p className="mb-4 text-lg text-white">A set of 3 cards is valid if it meets any one of these criteria:</p>
                  <ul className="list-disc list-inside space-y-3 ml-4 text-lg text-white">
                    <li><strong className="text-white">Same Color:</strong> All 3 cards share the same color (Silver, Teal, or Rose)</li>
                    <li><strong className="text-white">Same Number:</strong> All 3 cards share the same number (1–7)</li>
                    <li><strong className="text-white">Same Shape:</strong> All 3 cards share the same shape (Circle, Triangle, Square, Pentagon, Hexagon)</li>
                    <li><strong className="text-white">Consecutive Numbers:</strong> Cards form a sequence (e.g., 2–3–4, 5–6–7)</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-2xl font-bold text-white mb-4 border-b border-white/40 pb-2">Turn Flow</h3>
                  <ol className="list-decimal list-inside space-y-4 ml-4 text-lg text-white">
                    <li><strong className="text-white">Draw Phase:</strong> Draw 1 card from the deck. If empty, discard pile is reshuffled.</li>
                    <li><strong className="text-white">Main Phase:</strong> Play any number of action cards (CONCEAL, STEAL, REVEAL, TEAL) or discard normal cards. Targeted actions trigger an interrupt window.</li>
                    <li><strong className="text-white">Interrupt Phase:</strong> When targeted, opponent has 10 seconds to play APPEAL to block the action.</li>
                    <li><strong className="text-white">End Phase:</strong> Discard down to 9 cards max. Check win condition (3 valid sets = victory).</li>
                  </ol>
                </section>

                <section>
                  <h3 className="text-2xl font-bold text-white mb-4 border-b border-white/40 pb-2">Action Cards</h3>
                  <ul className="space-y-3 text-lg text-white">
                    <li><strong className="text-white">CONCEAL:</strong> Hide one of your own revealed cards from opponents. Can be appealed.</li>
                    <li><strong className="text-white">STEAL:</strong> Take a normal card (including TEAL) from an opponent's hand. Cannot target action cards or completed sets. Can be appealed.</li>
                    <li><strong className="text-white">REVEAL:</strong> Force an opponent to reveal a card from their hand to all players. Can be appealed.</li>
                    <li><strong className="text-white">APPEAL:</strong> Play during an interrupt window to block an opponent's CONCEAL, STEAL, or REVEAL. Both cards are discarded.</li>
                    <li><strong className="text-white">TEAL:</strong> Wild card with fixed Teal color (#008080) but flexible shape and number. Counts as a normal card for targeting purposes.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-2xl font-bold text-white mb-4 border-b border-white/40 pb-2">Deck Composition</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-lg text-white">
                    <li><strong className="text-white">105 Normal Cards:</strong> 3 colors × 7 numbers × 5 shapes</li>
                    <li><strong className="text-white">15 Action Cards:</strong> 3 copies each of CONCEAL, STEAL, REVEAL, APPEAL, TEAL</li>
                    <li><strong className="text-white">Total:</strong> 120 cards</li>
                  </ul>
                </section>
              </div>

              <div className="flex justify-center mt-10">
                <button
                  onClick={handleBackToMenu}
                  style={{
                    color: '#000000',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '10px 24px',
                    fontWeight: 600,
                    border: '2px solid #FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  ← Back to Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Players Page - fully opaque, scrollable, connects back to the menu */}
      {showPlayers && (
        <div
          onClick={handleBackToMenu}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            backgroundColor: '#000000',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '640px',
              margin: '0 auto',
              padding: '80px 24px 64px',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid #FFFFFF',
                borderRadius: '24px',
                padding: '32px',
              }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-4xl font-bold text-white">Players</h2>
                <button
                  onClick={handleBackToMenu}
                  style={{
                    color: '#FFFFFF',
                    border: '2px solid #FFFFFF',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ← Back to Menu
                </button>
              </div>

              <div className="space-y-4">
                {players.map((player) => {
                  const normalCount = player.hand.filter((c) => c !== null && !c.isActionCard).length;
                  const actionCount = player.hand.filter((c) => c !== null && c.isActionCard).length;
                  const totalCount = normalCount + actionCount;
                  return (
                    <div
                      key={player.id}
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.4)',
                      }}
                      className="p-5 rounded-2xl"
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-bold text-white">{player.name}</h3>
                        <span className="text-lg text-white">{totalCount} cards</span>
                      </div>
                      <div className="flex gap-4 mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <span>Normal: {normalCount}</span>
                        &emsp;
                        <span>Action: {actionCount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-center mt-10">
                <button
                  onClick={handleBackToMenu}
                  style={{
                    color: '#000000',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '10px 24px',
                    fontWeight: 600,
                    border: '2px solid #FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  ← Back to Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}