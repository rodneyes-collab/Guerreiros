import { performance } from 'perf_hooks';

// Setup mock for firestore
const mockDocs = [];
for (let i = 0; i < 50; i++) {
  mockDocs.push({ id: `date-${i}`, ref: `ref-${i}` });
}

const mockGetDocs = async (collectionName) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (collectionName.includes('/players')) {
        resolve({
          forEach: (cb) => {
            for (let i = 0; i < 20; i++) {
              cb({ id: `player-${i}`, ref: `pref-${i}` });
            }
          }
        });
      } else {
        resolve({
          docs: mockDocs,
          forEach: (cb) => mockDocs.forEach(cb)
        });
      }
    }, 10);
  });
};

async function testSequential() {
  const start = performance.now();
  const snapshot = await mockGetDocs('attendance');

  for (const dateDoc of snapshot.docs) {
    const playersSnapshot = await mockGetDocs(`attendance/${dateDoc.id}/players`);
    // mock subBatch delete
    playersSnapshot.forEach(p => {});
  }

  return performance.now() - start;
}

async function testConcurrent() {
  const start = performance.now();
  const snapshot = await mockGetDocs('attendance');

  await Promise.all(snapshot.docs.map(async (dateDoc) => {
    const playersSnapshot = await mockGetDocs(`attendance/${dateDoc.id}/players`);
    // mock subBatch delete
    playersSnapshot.forEach(p => {});
  }));

  return performance.now() - start;
}

async function run() {
  console.log('Running benchmark...');
  let seqTotal = 0;
  let conTotal = 0;

  // Warmup
  await testSequential();
  await testConcurrent();

  for (let i = 0; i < 5; i++) {
    seqTotal += await testSequential();
    conTotal += await testConcurrent();
  }

  console.log(`Sequential: ${seqTotal/5}ms`);
  console.log(`Concurrent: ${conTotal/5}ms`);
}

run();
