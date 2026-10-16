const fs = require('fs');
let app = fs.readFileSync('App.tsx', 'utf8');

// 1. Add setDoc to firebase import
app = app.replace(
  "import { getBrazilDay, getFirestoreDateKey, db, doc, updateDoc, clearIndexedDbPersistence } from './firebase';",
  "import { getBrazilDay, getFirestoreDateKey, db, doc, updateDoc, setDoc, clearIndexedDbPersistence } from './firebase';"
);

// 2. Add cleanObject to utils/helpers import
app = app.replace(
  "import { calculateEffectiveElo } from './utils/teamLogic';",
  "import { calculateEffectiveElo } from './utils/teamLogic';\nimport { cleanObject } from './utils/helpers';"
);

// 3. Update performSwap and promoteToSetter to persist to Firestore
const oldPerformSwap = `  const performSwap = (id1: string, id2: string) => {
    if (!generationResult) return;
    const allPlayers = [
      generationResult.teamA.setter,
      ...generationResult.teamA.players,
      generationResult.teamB.setter,
      ...generationResult.teamB.players,
      ...generationResult.remainingPlayers
    ].filter(Boolean) as any[];

    const p1 = allPlayers.find(p => p.id === id1);
    const p2 = allPlayers.find(p => p.id === id2);

    if (!p1 || !p2) return;

    const swapInTeam = (team: any) => {
      let newSetter = team.setter;
      if (team.setter?.id === id1) newSetter = p2;
      else if (team.setter?.id === id2) newSetter = p1;

      const newPlayers = team.players.map((p: any) => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });

      return { ...team, setter: newSetter, players: newPlayers };
    };

    const swapInList = (list: any[]) => {
      return list.map(p => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });
    };

    const newTeamA = swapInTeam(generationResult.teamA);
    const newTeamB = swapInTeam(generationResult.teamB);
    const newRemaining = swapInList(generationResult.remainingPlayers);
    
    // Recalcula métricas em tempo real para feedback imediato no Drag and Drop
    const calcElo = (t: any) => (t.players.reduce((s: number, p: any) => s + (p.elo || 1200), 0) + (t.setter?.elo || 0));
    
    // Recalcula eficiência baseada na lógica centralizada do teamLogic
    const calcEff = (t: any) => {
      const allP = t.setter ? [t.setter, ...t.players] : t.players;
      return Math.round(allP.reduce((s: number, p: any) => s + calculateEffectiveElo(p), 0));
    };

    setGenerationResult({
      teamA: { ...newTeamA, totalElo: calcElo(newTeamA), totalEfficiency: calcEff(newTeamA) },
      teamB: { ...newTeamB, totalElo: calcElo(newTeamB), totalEfficiency: calcEff(newTeamB) },
      remainingPlayers: newRemaining
    });
  };`;

const newPerformSwap = `  const performSwap = async (id1: string, id2: string) => {
    if (!generationResult) return;
    const allPlayers = [
      generationResult.teamA.setter,
      ...generationResult.teamA.players,
      generationResult.teamB.setter,
      ...generationResult.teamB.players,
      ...generationResult.remainingPlayers
    ].filter(Boolean) as any[];

    const p1 = allPlayers.find(p => p.id === id1);
    const p2 = allPlayers.find(p => p.id === id2);

    if (!p1 || !p2) return;

    const swapInTeam = (team: any) => {
      let newSetter = team.setter;
      if (team.setter?.id === id1) newSetter = p2;
      else if (team.setter?.id === id2) newSetter = p1;

      const newPlayers = team.players.map((p: any) => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });

      return { ...team, setter: newSetter, players: newPlayers };
    };

    const swapInList = (list: any[]) => {
      return list.map(p => {
        if (p.id === id1) return p2;
        if (p.id === id2) return p1;
        return p;
      });
    };

    const newTeamA = swapInTeam(generationResult.teamA);
    const newTeamB = swapInTeam(generationResult.teamB);
    const newRemaining = swapInList(generationResult.remainingPlayers);
    
    // Recalcula métricas em tempo real para feedback imediato no Drag and Drop
    const calcElo = (t: any) => (t.players.reduce((s: number, p: any) => s + (p.elo || 1200), 0) + (t.setter?.elo || 0));
    
    // Recalcula eficiência baseada na lógica centralizada do teamLogic
    const calcEff = (t: any) => {
      const allP = t.setter ? [t.setter, ...t.players] : t.players;
      return Math.round(allP.reduce((s: number, p: any) => s + calculateEffectiveElo(p), 0));
    };

    const updatedResult = {
      ...generationResult,
      teamA: { ...newTeamA, totalElo: calcElo(newTeamA), totalEfficiency: calcEff(newTeamA) },
      teamB: { ...newTeamB, totalElo: calcElo(newTeamB), totalEfficiency: calcEff(newTeamB) },
      remainingPlayers: newRemaining
    };

    setGenerationResult(updatedResult);
    showNotification(\`Substituição realizada: \${p1.name} ⇄ \${p2.name}\`, 'success');

    try {
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(updatedResult));
    } catch (err) {
      console.error('Erro ao sincronizar substituição no Firestore:', err);
    }
  };`;

if (!app.includes(oldPerformSwap)) {
  console.error('Could not match oldPerformSwap in App.tsx');
  process.exit(1);
}

app = app.replace(oldPerformSwap, newPerformSwap);

const oldPromote = `    setGenerationResult({
      ...generationResult,
      [teamKey]: {
        ...teamData,
        setter: player,
        players: newPlayers
      }
    });
    showNotification(\`\${player.name} designado como levantador da equipe.\`, 'success');
  };`;

const newPromote = `    const updatedResult = {
      ...generationResult,
      [teamKey]: {
        ...teamData,
        setter: player,
        players: newPlayers
      }
    };
    setGenerationResult(updatedResult);
    showNotification(\`\${player.name} designado como levantador da equipe.\`, 'success');

    try {
      await setDoc(doc(db, 'metadata', 'currentMatch'), cleanObject(updatedResult));
    } catch (err) {
      console.error('Erro ao sincronizar novo levantador no Firestore:', err);
    }
  };`;

if (!app.includes(oldPromote)) {
  console.error('Could not match oldPromote in App.tsx');
  process.exit(1);
}

app = app.replace(oldPromote, newPromote);

fs.writeFileSync('App.tsx', app, 'utf8');
console.log('App.tsx updated successfully');
