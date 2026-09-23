// Headless simulation test: all-bot battle royale must run to completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/GameRoom.js';
import { CHARACTERS, MAX_HP, WEAPONS } from '../server/constants.js';

test('every ninja starts with exactly 200 HP', () => {
  assert.equal(MAX_HP, 200);
  for (const c of Object.values(CHARACTERS)) assert.equal(c.hp, 200);
});

test('no guns: only kunai / shuriken / paper-bomb exist', () => {
  assert.deepEqual(Object.keys(WEAPONS).sort(), ['bomb', 'kunai', 'shuriken']);
});

test('all-bot match runs to completion with a winner', () => {
  const room = new GameRoom('TEST1', { mapId: 'konoha', mode: 'solo' });
  const chars = Object.keys(CHARACTERS);
  for (let i = 0; i < 8; i++) room.addPlayer(`bot-t${i}`, `Test${i}`, chars[i % chars.length], true);
  assert.equal(room.startCountdown(), true);
  let guard = 20 * 60 * 10; // 10 min of ticks max
  while (room.state !== 'ended' && guard-- > 0) room.update();
  assert.equal(room.state, 'ended', 'match should end');
  assert.ok(room.result.winner, 'there should be a winner');
  assert.equal(room.result.placements.length, 8);
  console.log('  winner:', room.result.winner.name, '| reason:', room.result.reason,
    '| kills:', room.result.placements.map((p) => `${p.name}:${p.kills}`).join(', '));
});

test('squad match completes', () => {
  const room = new GameRoom('TEST2', { mapId: 'training-grounds', mode: 'squad' });
  room.addPlayer('h1', 'Human', 'sakura', false);
  room.fillWithBots(6);
  assert.equal(room.startCountdown(), true);
  let guard = 20 * 60 * 10;
  while (room.state !== 'ended' && guard-- > 0) room.update();
  assert.equal(room.state, 'ended');
  console.log('  squad winner:', room.result.winner.name, '| reason:', room.result.reason);
});

test('sakura heals herself and nearby squadmates (deterministic)', () => {
  const room = new GameRoom('TEST2b', { mapId: 'konoha', mode: 'squad' });
  room.addPlayer('s1', 'Sakura', 'sakura', false);
  room.addPlayer('s2', 'AllyBot', 'naruto', true);
  room.addPlayer('s3', 'DummyFoe', 'lee', true); // keeps 2 teams alive so the match runs
  const sakura = room.players.get('s1');
  const ally = room.players.get('s2');
  const foe = room.players.get('s3');
  ally.team = sakura.team;
  if (foe.team === sakura.team) foe.team = sakura.team + 1;
  assert.equal(room.startCountdown(), true);
  for (let i = 0; i < 20 * 7; i++) room.update();
  assert.equal(room.state, 'playing');
  // freeze the bots: nobody moves or attacks, match stays live, zero damage
  ally.stunUntil = 1e9;
  foe.stunUntil = 1e9;
  // hurt both squadmates, stand them together, cast Medical Ninjutsu
  sakura.hp = 100; sakura.chakra = 100; sakura.stunUntil = 0; sakura.lock = null;
  ally.hp = 100;
  ally.x = sakura.x + 2; ally.z = sakura.z; ally.y = sakura.y;
  room.useSkill(sakura, 0, 0);
  assert.ok(sakura.healPool > 0, 'sakura should have a heal pool');
  for (let i = 0; i < 20 * 4; i++) room.update();
  assert.ok(sakura.hp > 150, `sakura healed to ${sakura.hp}`);
  assert.ok(ally.hp > 130, `squadmate healed to ${ally.hp}`);
});

test('skills resolve: rasengan / chidori / barrage / byakugan', () => {
  const room = new GameRoom('TEST3', { mapId: 'konoha', mode: 'solo' });
  room.addPlayer('a', 'A', 'naruto', true);
  room.addPlayer('b', 'B', 'sasuke', true);
  room.addPlayer('c', 'C', 'lee', true);
  room.addPlayer('d', 'D', 'hinata', true);
  room.startCountdown();
  for (let i = 0; i < 20 * 6; i++) room.update();
  const A = room.players.get('a'), B = room.players.get('b');
  const C = room.players.get('c'), D = room.players.get('d');
  // line them up: B in front of A
  B.x = A.x - Math.sin(A.yaw) * 3; B.z = A.z - Math.cos(A.yaw) * 3; B.y = A.y;
  const hpBefore = B.hp;
  room.useSkill(A, A.yaw, 0);
  assert.ok(B.hp < hpBefore, 'rasengan should damage enemies in front');
  room.useSkill(D, 0, 0);
  assert.ok(D.byakuganUntil > room.time, 'byakugan should buff');
  // chidori dash moves sasuke forward
  const bx0 = B.x, bz0 = B.z;
  B.chakra = 100;
  room.useSkill(B, B.yaw, 0);
  for (let i = 0; i < 12; i++) room.update();
  assert.ok(Math.hypot(B.x - bx0, B.z - bz0) > 3, 'chidori should dash');
  // barrage needs a target: put one next to lee
  C.chakra = 100;
  A.x = C.x + 2; A.z = C.z; A.y = C.y; A.hp = 200; A.alive = true;
  const aHp = A.hp;
  room.useSkill(C, 0, 0);
  for (let i = 0; i < 20 * 2; i++) room.update();
  assert.ok(A.hp < aHp, 'barrage should damage locked target');
});
