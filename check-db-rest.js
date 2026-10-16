async function run() {
  try {
    const url = "https://firestore.googleapis.com/v1/projects/volleyclub-manager/databases/(default)/documents/metadata/intentions";
    const resp = await fetch(url);
    const data = await resp.json();
    const fields = data.fields || {};
    const targetDate = fields.targetDate?.stringValue || '';
    
    if (targetDate) {
      const preConfUrl = `https://firestore.googleapis.com/v1/projects/volleyclub-manager/databases/(default)/documents/preConfirmations/${targetDate}/players`;
      const preConfResp = await fetch(preConfUrl);
      if (preConfResp.ok) {
        const preConfData = await preConfResp.json();
        const documents = preConfData.documents || [];
        console.log(`=== PLAYERS IN preConfirmations/${targetDate} ===`);
        documents.forEach((doc) => {
          const pathParts = doc.name.split('/');
          const pId = pathParts[pathParts.length - 1];
          const name = doc.fields?.name?.stringValue || 'Unknown';
          const status = doc.fields?.status?.stringValue || 'Unknown';
          const tsRaw = doc.fields?.timestamp?.integerValue || doc.fields?.timestamp?.doubleValue || '0';
          const tsNum = Number(tsRaw);
          const confirmTime = tsNum ? new Date(tsNum).toISOString() : 'Unknown';
          console.log(`* ${pId}: ${name} (status: ${status}, timestamp: ${confirmTime})`);
        });
      } else {
        console.log(`Could not read preConfirmations for ${targetDate}: HTTP ${preConfResp.status}`);
      }
    }
  } catch (error) {
    console.error("Error in check-db-rest:", error);
  }
}
run();
