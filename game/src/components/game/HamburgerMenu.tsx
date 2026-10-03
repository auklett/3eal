import { useState } from 'react';
import type { Player } from '../../types';
import { completeSetCount } from '../../logic/validation';
import RulesOverlay from './RulesOverlay';

interface HamburgerMenuProps {
  players: Array<Pick<Player, 'id' | 'name' | 'hand' | 'table' | 'isHost'> & { handCount?: number }>;
  selfId: string;
  roomCode: string;
  onLeaveGame: () => void;
  onKickPlayer: (playerId: string) => void;
  onClose?: () => void;
}

export default function HamburgerMenu({ players, selfId, roomCode, onLeaveGame, onKickPlayer, onClose }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);

  // The hamburger/X button is now context-aware:
  // - On a sub-page (Rules/Players) -> closes the overlay and returns to the game
  // - On the menu drawer -> closes everything
  // - Closed -> opens the menu drawer
  const handleToggle = () => {
    if (showRules || showPlayers) {
      handleCloseAll();
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
              <button
                onClick={onLeaveGame}
                style={{ ...menuButtonStyle, borderColor: '#FDA4AF', color: '#FDA4AF' }}
              >
                Leave Game
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

      {showRules && <RulesOverlay onClose={handleCloseAll} />}

      {/* Players Page */}
      {showPlayers && (
        <div
          onClick={handleCloseAll}
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
                  onClick={handleCloseAll}
                  aria-label="Close players"
                  style={{
                    color: '#FFFFFF',
                    border: '2px solid #FFFFFF',
                    borderRadius: '999px',
                    width: '44px',
                    height: '44px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    fontSize: '24px',
                  }}
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {players.map((player) => {
                  const tableCount = player.table.filter((c) => c !== null).length;
                  const handCount = player.handCount ?? player.hand.length;
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
                        <h3 className="text-2xl font-bold text-white">
                          {player.name}{player.isHost ? ' · Host' : ''}
                        </h3>
                        <span className="text-lg text-white">Table {tableCount} | Hand {handCount}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/70">
                        Completed sets: {completeSetCount(player.table)}/3
                      </p>
                      {players.some((member) => member.id === selfId && member.isHost) && player.id !== selfId && (
                        <button
                          type="button"
                          onClick={() => onKickPlayer(player.id)}
                          aria-label={`Remove ${player.name} from the game in room ${roomCode}`}
                          className="mt-3 min-h-11 rounded-lg border border-rose-300/70 px-3 text-sm text-rose-200 hover:bg-rose-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                        >
                          Remove from game
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-center mt-10">
                <button
                  onClick={handleCloseAll}
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
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}