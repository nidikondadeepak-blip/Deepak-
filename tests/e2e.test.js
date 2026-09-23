// E2E: real socket.io clients vs real server — lobby, start, combat, snapshots.
// Run: E2E_URL=http://localhost:3000 node tests/e2e.test.js  (server must be up)
import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const URL = process.env.E2E_URL || 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// absolute hang guard: never let open sockets stall CI forever
setTimeout(() => { console.error('E2E TIMEOUT GUARD — forcing exit'); process.exit(1); }, 90000).unref();

function connectClient() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { reconnection: false });
    s.on('welcome', ({ id }) => resolve({ s, id }));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

test('two humans: create -> join -> start -> fight -> snapshots flow', async () => {
  const A = await connectClient();
  const B = await connectClient();
  try {
    let roomA = null, roomB = null, snapsA = 0, lastSnap = null;
    const errs = [];
    A.s.on('room', (r) => { roomA = r; });
    B.s.on('room', (r) => { roomB = r; });
    A.s.on('snapshot', (s) => { snapsA++; lastSnap = s; });
    A.s.on('errorMsg', (e) => errs.push(e));
    B.s.on('errorMsg', (e) => errs.push(e));

    A.s.emit('createRoom', { name: 'E2E-A', characterId: 'naruto', mapId: 'konoha', mode: 'solo' });
    await wait(300);
    assert.ok(roomA && roomA.code, 'host should get a room');
    assert.equal(roomA.players.length, 1);

    B.s.emit('joinRoom', { code: roomA.code, name: 'E2E-B', characterId: 'sasuke' });
    await wait(300);
    assert.equal(roomA.players.length, 2, 'both players in room');
    assert.equal(roomB.code, roomA.code);

    A.s.emit('startMatch');
    await wait(500);
    assert.ok(['countdown', 'playing'].includes(roomA.state), `match starting, got ${roomA.state}`);

    // wait out the 5s countdown, pushing inputs like a real client
    for (let i = 0; i < 20; i++) {
      A.s.emit('input', { mx: 0, mz: 1, yaw: 0.5, pitch: 0, sprint: true, jump: i === 6 });
      B.s.emit('input', { mx: 0.3, mz: 0.8, yaw: -1, pitch: 0.1, sprint: false, jump: false });
      await wait(300);
    }
    A.s.emit('fire', { yaw: 0.5, pitch: 0, weapon: 'kunai' });
    B.s.emit('fire', { yaw: -1, pitch: 0, weapon: 'shuriken' });
    A.s.emit('useSkill', { yaw: 0.5, pitch: 0 });
    await wait(1000);

    assert.ok(snapsA > 5, `client A received ${snapsA} snapshots`);
    assert.ok(lastSnap.players.length >= 2, 'snapshot has players');
    assert.ok(lastSnap.zone.r > 0, 'zone present');
    assert.deepEqual(errs, [], 'no server errors: ' + JSON.stringify(errs));
    console.log(`  snapshots: ${snapsA} | players: ${lastSnap.players.length} | zone r: ${lastSnap.zone.r}`);
  } finally {
    A.s.disconnect();
    B.s.disconnect();
  }
});

test('quickPlay auto-starts a bot match', async () => {
  const Q = await connectClient();
  try {
    let state = null, snaps = 0, withBots = 0;
    Q.s.on('room', (r) => { state = r.state; });
    Q.s.on('snapshot', (s) => { snaps++; withBots = s.players.length; });
    Q.s.emit('quickPlay', { name: 'Quick', characterId: 'lee', mapId: 'training-grounds', mode: 'solo' });
    await wait(7000); // 5s countdown + margin
    assert.ok(state === 'playing' || snaps > 0, `quickplay started (state=${state}, snaps=${snaps})`);
    assert.ok(snaps > 0, 'receiving snapshots');
    assert.ok(withBots >= 6, `bots filled the match (${withBots} combatants)`);
    console.log(`  quickplay: ${withBots} combatants, ${snaps} snapshots`);
  } finally {
    Q.s.disconnect();
  }
});
