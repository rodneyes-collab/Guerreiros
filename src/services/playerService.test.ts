import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updatePlayerWithAudit } from './playerService';
import { doc, updateDoc } from '../../firebase';
import { Player, Gender } from '../../types';

vi.mock('../../firebase', () => ({
  db: {},
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('updatePlayerWithAudit', () => {
  const mockChangedBy = 'admin123';
  const mockTimestamp = 1620000000000;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
  });

  it('should not call updateDoc if updatedFields does not contain any changed values', async () => {
    const player: Player = {
      id: 'p1',
      name: 'Player One',
      gender: Gender.MALE,
      isOfficialSetter: false,
      matchesPlayed: 10,
      dailyMatches: 0,
      dailyWins: 0,
      dailyLosses: 0,
      dailyEloGain: 0,
      wins: 5,
      losses: 5,
      elo: 1500,
      impactLevel: 2,
      skills: { setting: 1, attacking: 2, defense: 2, serving: 2 },
      playedLastMatch: false,
      consecutivePlayed: 0,
      consecutiveBenched: 0,
      status: 'active',
      auditLog: []
    };

    const updatedFields: Partial<Player> = {
      name: 'Player One', // Same value
      elo: 1500,          // Same value
    };

    await updatePlayerWithAudit(player, updatedFields, mockChangedBy);

    expect(doc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('should generate correct audit log entry and call updateDoc if there are changed values', async () => {
    const player: Player = {
      id: 'p1',
      name: 'Player One',
      gender: Gender.MALE,
      isOfficialSetter: false,
      matchesPlayed: 10,
      dailyMatches: 0,
      dailyWins: 0,
      dailyLosses: 0,
      dailyEloGain: 0,
      wins: 5,
      losses: 5,
      elo: 1500,
      impactLevel: 2,
      skills: { setting: 1, attacking: 2, defense: 2, serving: 2 },
      playedLastMatch: false,
      consecutivePlayed: 0,
      consecutiveBenched: 0,
      status: 'active',
      auditLog: []
    };

    const updatedFields: Partial<Player> = {
      elo: 1600,
    };

    const mockDocRef = { id: 'p1_ref' };
    (doc as any).mockReturnValue(mockDocRef);

    await updatePlayerWithAudit(player, updatedFields, mockChangedBy);

    expect(doc).toHaveBeenCalledWith({}, 'players', 'p1');
    expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
      elo: 1600,
      auditLog: [
        {
          field: 'elo',
          oldValue: 1500,
          newValue: 1600,
          timestamp: mockTimestamp,
          changedBy: mockChangedBy
        }
      ]
    });
  });

  it('should correctly merge new audit logs with existing audit logs when multiple fields are updated', async () => {
    const existingAuditLog = [
      {
        field: 'status',
        oldValue: 'injured',
        newValue: 'active',
        timestamp: mockTimestamp - 100000,
        changedBy: 'admin000'
      }
    ];

    const player: Player = {
      id: 'p2',
      name: 'Player Two',
      gender: Gender.FEMALE,
      isOfficialSetter: true,
      matchesPlayed: 20,
      dailyMatches: 0,
      dailyWins: 0,
      dailyLosses: 0,
      dailyEloGain: 0,
      wins: 15,
      losses: 5,
      elo: 1800,
      impactLevel: 3,
      skills: { setting: 3, attacking: 2, defense: 3, serving: 2 },
      playedLastMatch: true,
      consecutivePlayed: 1,
      consecutiveBenched: 0,
      status: 'active',
      auditLog: existingAuditLog
    };

    const updatedFields: Partial<Player> = {
      elo: 1850,
      status: 'inactive'
    };

    const mockDocRef = { id: 'p2_ref' };
    (doc as any).mockReturnValue(mockDocRef);

    await updatePlayerWithAudit(player, updatedFields, mockChangedBy);

    expect(doc).toHaveBeenCalledWith({}, 'players', 'p2');
    expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
      elo: 1850,
      status: 'inactive',
      auditLog: [
        ...existingAuditLog,
        {
          field: 'elo',
          oldValue: 1800,
          newValue: 1850,
          timestamp: mockTimestamp,
          changedBy: mockChangedBy
        },
        {
          field: 'status',
          oldValue: 'active',
          newValue: 'inactive',
          timestamp: mockTimestamp,
          changedBy: mockChangedBy
        }
      ]
    });
  });
});
