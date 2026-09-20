// Offline demo test: LocalNet drives the real GameRoom in-process,
// emitting the same room/snapshot/matchEnd events the server would.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalNet } from '../client/js/localnet.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('OFFLINE TIMEOUT GUARD'); process.exit(1); }, 60000).unref();

test('offline quickPlay: lobby -> countdown -> snapshots -> combat', async () => {
  const net = new LocalNet();
  const rooms = [];
  let snaps = 0;
  let first = null;
  let last = null;
  net.on('room', (r) => rooms.push(r.state));
  net.on('snapshot', (s) => { snaps++; if (!first) first = s; last = s; });
  net.on('errorMsg', (e) => { throw new Error('unexpected: ' + e.msg); });

  net.emit('quickPlay', { name: 'OfflineNinja', characterId: 'hinata', mapId: 'konoha', mode: 'solo' });
  await wait(6500); // 5s countdown + margin
  assert.ok(snaps > 10, `flowing snapshots (${snaps})`);
  assert.equal(last.players.length, 8, 'you + 7 bots');
  const me0 = first.players.find((p) => p.id === 'you');
  assert.ok(me0, 'human present as "you"');
  assert.equal(me0.ch, 'hinata');
  assert.equal(me0.hp, 200, 'spawn with full HP');
  const me = last.players.find((p) => p.id === 'you');
  assert.ok(me.hp <= 200, 'HP tracked live');

  // drive input + fire + skill like the Game class would
  for (let i = 0; i < 6; i++) {
    net.emit('input', { mx: 0, mz: 1, yaw: 1, pitch: 0, sprint: true, jump: i === 1 });
    await wait(100);
  }
  net.emit('fire', { yaw: 1, pitch: 0, weapon: 'shuriken' });
  net.emit('useSkill', { yaw: 1, pitch: 0 });
  await wait(800);
  assert.ok(last.players.find((p) => p.id === 'you').bya === true, 'byakugan activated offline');

  // online-only actions explain themselves
  let err = null;
  net.off('errorMsg', () => {});
  net.on('errorMsg', (e) => { err = e.msg; });
  net.emit('createRoom', {});
  await wait(100);
  assert.ok(err && err.includes('Offline demo'), 'createRoom explains offline mode');

  net.emit('leaveRoom');
  const snapsAtLeave = snaps;
  await wait(300);
  assert.equal(snaps, snapsAtLeave, 'loop stops after leaveRoom');
  console.log(`  offline: ${snaps} snapshots, 8 combatants, byakugan OK`);
});
