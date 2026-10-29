import { Player, Match, Gender } from '../../types';

// Web Worker for heavy Firestore snapshot data parsing, deduplication, sorting and processing

self.onmessage = (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    if (type === 'PARSE_PLAYERS') {
      const { docs } = payload;
      const list: Player[] = [];
      const seenEmails = new Set<string>();
      const seenUids = new Set<string>();
      const idToCanonical = {} as Record<string, string>;
      const emailToCanonicalId = {} as Record<string, string>;
      const uidToCanonicalId = {} as Record<string, string>;

      for (const item of docs) {
        try {
          const { id: docId, data } = item;
          const player: Player = {
            id: docId,
            name: (data.name || 'Jogador Sem Nome').trim(),
            isAdmin: data.isAdmin || false,
            elo: typeof data.elo === 'number' ? data.elo : 1200,
            email: data.email?.trim().toLowerCase() || undefined,
            uid: data.uid || undefined,
            gender: data.gender || Gender.MALE,
            isOfficialSetter: data.isOfficialSetter || false,
            matchesPlayed: data.matchesPlayed || 0,
            dailyMatches: data.dailyMatches || 0,
            dailyWins: data.dailyWins || 0,
            dailyLosses: data.dailyLosses || 0,
            dailyEloGain: data.dailyEloGain || 0,
            wins: data.wins || 0,
            losses: data.losses || 0,
            pointsFor: data.pointsFor || 0,
            pointsAgainst: data.pointsAgainst || 0,
            pointsBalance: data.pointsBalance || 0,
            arrivalOrder: data.arrivalOrder || 999,
            ...data
          };

          const email = player.email;
          const uid = player.uid;

          if (email && seenEmails.has(email)) {
            idToCanonical[docId] = emailToCanonicalId[email];
            continue;
          }
          if (uid && seenUids.has(uid)) {
            idToCanonical[docId] = uidToCanonicalId[uid];
            continue;
          }

          if (email) {
            seenEmails.add(email);
            emailToCanonicalId[email] = docId;
            idToCanonical[email] = docId;
            idToCanonical[email.toLowerCase()] = docId;
          }
          if (uid) {
            seenUids.add(uid);
            uidToCanonicalId[uid] = docId;
            idToCanonical[uid] = docId;
            idToCanonical[uid.toLowerCase()] = docId;
          }

          idToCanonical[docId] = docId;
          list.push(player);
        } catch (itemErr) {
          console.error('Worker: Error parsing player item:', itemErr);
        }
      }

      const sortedList = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      self.postMessage({ id, type: 'PARSE_PLAYERS_SUCCESS', result: { sortedList, idToCanonical } });

    } else if (type === 'PARSE_ATTENDANCE') {
      const { docs } = payload;
      const list: Player[] = [];
      const seenIds = new Set<string>();
      let isInconsistent = false;

      for (const item of docs) {
        const { id: docId, data } = item;
        const dataId = (data.id || '').trim();
        const id = dataId || (docId || '').trim();

        if (!id) {
          isInconsistent = true;
          continue;
        }

        const lowerId = id.toLowerCase();
        if (seenIds.has(lowerId)) {
          isInconsistent = true;
          continue;
        }

        seenIds.add(lowerId);

        const player: Player = {
          id,
          name: (data.name || 'Jogador Sem Nome').trim(),
          isAdmin: data.isAdmin || false,
          elo: typeof data.elo === 'number' ? data.elo : 1200,
          gender: data.gender || Gender.MALE,
          isOfficialSetter: data.isOfficialSetter || false,
          status: data.status || 'active',
          timestamp: data.timestamp || Date.now(),
          arrivalOrder: data.arrivalOrder || 999,
          ...data
        };

        list.push(player);
      }

      const sorted = list.sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return (a.arrivalOrder ?? 999) - (b.arrivalOrder ?? 999);
      });

      self.postMessage({ id, type: 'PARSE_ATTENDANCE_SUCCESS', result: { sorted, isInconsistent } });

    } else if (type === 'PARSE_MATCHES') {
      const { docs } = payload;
      const list: Match[] = [];
      for (const item of docs) {
        list.push({ ...item.data, id: item.id } as Match);
      }
      const sorted = list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      self.postMessage({ id, type: 'PARSE_MATCHES_SUCCESS', result: { sorted } });
    }
  } catch (err: any) {
    self.postMessage({ id, type: 'ERROR', error: err?.message || 'Unknown worker error' });
  }
};
