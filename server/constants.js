// ============================================================================
// SHINOBI ARENA — shared game constants & tuning (server authoritative)
// The client fetches this via GET /api/config so there is exactly one source
// of truth for HP, damage, cooldowns, characters and weapons.
// ============================================================================

export const TICK_RATE = 20;                 // server simulation ticks per second
export const TICK_DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 12;               // max combatants per room
export const QUICKPLAY_SIZE = 8;             // quick-play fills to this many with bots
export const MAX_HP = 200;                   // STRICT: every ninja starts with 200 HP
export const MAX_CHAKRA = 100;
export const CHAKRA_REGEN = 14;              // per second (while not sprinting)
export const SPRINT_DRAIN = 9;               // chakra per second while sprinting
export const SPRINT_MULT = 1.42;
export const GRAVITY = 24;
export const JUMP_VEL = 9.2;
export const MAX_JUMPS = 2;                  // ground jump + one mid-air (chakra) jump
export const EYE_HEIGHT = 1.55;
export const PLAYER_RADIUS = 0.55;
export const PLAYER_HEIGHT = 1.75;
export const MATCH_TIME = 8 * 60;            // 8 minute matches, then sudden ranking
export const COUNTDOWN_TIME = 5;             // lobby -> match countdown (seconds)
export const REGEN_DELAY = 6;                // seconds after damage before regen starts
export const REGEN_RATE = 4;                 // HP per second out of combat
export const RAMEN_HEAL = 60;
export const RAMEN_RESPAWN = 30;             // seconds

// Zone ("Akatsuki barrier") phases: { wait, shrink, radiusFactor, dps }
export const ZONE_PHASES = [
  { wait: 30, shrink: 25, factor: 0.62, dps: 4 },
  { wait: 22, shrink: 20, factor: 0.55, dps: 7 },
  { wait: 18, shrink: 16, factor: 0.50, dps: 12 },
  { wait: 15, shrink: 14, factor: 0.45, dps: 18 },
  { wait: 12, shrink: 12, factor: 0.30, dps: 25 },
];

// ---------------------------------------------------------------------------
// WEAPONS — strictly ninja weapons. No guns. Ever.
// kind: 'kunai' | 'shuriken' | 'bomb'
// ---------------------------------------------------------------------------
export const WEAPONS = {
  kunai: {
    id: 'kunai',
    name: 'Kunai',
    icon: 'kunai',
    desc: 'Balanced throwing knife. Fast, accurate, reliable.',
    damage: 14,
    speed: 46,
    cooldown: 0.34,
    life: 1.5,
    gravity: 0,
    count: 1,
    spread: 0,
    chakraCost: 0,
  },
  shuriken: {
    id: 'shuriken',
    name: 'Shadow Shuriken',
    icon: 'shuriken',
    desc: 'Hurls 3 spinning shuriken in a fan. Shreds at close range.',
    damage: 7,          // per star
    speed: 54,
    cooldown: 0.62,
    life: 1.1,
    gravity: 0,
    count: 3,
    spread: 0.075,      // radians between stars
    chakraCost: 0,
  },
  bomb: {
    id: 'bomb',
    name: 'Paper-Bomb Kunai',
    icon: 'bomb',
    desc: 'Kunai wrapped in an explosive tag. Lobs in an arc, big AoE boom.',
    damage: 52,         // direct hit
    speed: 24,
    upVel: 7.5,
    cooldown: 4.0,
    life: 2.2,
    gravity: 20,
    count: 1,
    spread: 0,
    aoe: 5.5,           // explosion radius
    minSplash: 22,      // edge damage
    chakraCost: 8,
  },
};

export const WEAPON_ORDER = ['kunai', 'shuriken', 'bomb'];

// ---------------------------------------------------------------------------
// PLAYABLE NINJA — everyone has exactly 200 HP.
// ---------------------------------------------------------------------------
export const CHARACTERS = {
  naruto: {
    id: 'naruto',
    name: 'Naruto Uzumaki',
    title: 'The Number One Hyperactive Ninja',
    hp: 200,
    speed: 6.3,
    difficulty: 1,           // 1-3 bars shown in UI
    desc: 'Konoha\'s loudest hero. Huge Rasengan burst for anyone dumb enough to get close.',
    quote: 'Believe it!',
    colors: { skin: 0xffc894, hair: 0xffd23e, outfit: 0xff7a1a, pants: 0x2b3a67, accent: 0x1c5dff, headband: 0x3a4a6b },
    skill: {
      id: 'rasengan',
      name: 'Rasengan',
      desc: 'Devastating close-range spinning chakra sphere. 70 damage in front of you + massive knockback.',
      cooldown: 18, chakra: 40, damage: 70, range: 4.8, arc: 1.9, knockback: 13,
    },
  },
  sasuke: {
    id: 'sasuke',
    name: 'Sasuke Uchiha',
    title: 'The Last Uchiha',
    hp: 200,
    speed: 6.5,
    difficulty: 2,
    desc: 'Cold, fast avenger. Chidori closes any gap and fries whatever is on the other side.',
    quote: 'I\'m going to kill a certain somebody.',
    colors: { skin: 0xffc79a, hair: 0x1a2030, outfit: 0x2e4a7a, pants: 0x232838, accent: 0x7fd4ff, headband: 0x3a4a6b },
    skill: {
      id: 'chidori',
      name: 'Chidori',
      desc: 'Lightning dash 14m through enemies: 55 damage + 0.9s stun to everyone in your path.',
      cooldown: 16, chakra: 40, damage: 55, range: 14, width: 2.6, stun: 0.9,
    },
  },
  lee: {
    id: 'lee',
    name: 'Rock Lee',
    title: 'The Handsome Devil of the Leaf',
    hp: 200,
    speed: 6.9,
    difficulty: 2,
    desc: 'Taijutsu specialist. Fastest feet in the village and kicks that never stop.',
    quote: 'I will prove that hard work beats genius!',
    colors: { skin: 0xffbe8a, hair: 0x14161c, outfit: 0x2fae4f, pants: 0x2fae4f, accent: 0xff5a3c, headband: 0x3a4a6b },
    skill: {
      id: 'barrage',
      name: 'Taijutsu Barrage',
      desc: 'Lock onto a nearby enemy and unleash 5 flying kicks (12 dmg each) that pin them in place.',
      cooldown: 20, chakra: 45, damage: 12, hits: 5, range: 7.5, duration: 1.6,
    },
  },
  hinata: {
    id: 'hinata',
    name: 'Hinata Hyuga',
    title: 'Heiress of the Byakugan',
    hp: 200,
    speed: 6.0,
    difficulty: 3,
    desc: 'Gentle but deadly tactician. Nobody hides from the all-seeing white eyes.',
    quote: 'I will never take back my words... that is my nindo!',
    colors: { skin: 0xffe0c4, hair: 0x2b3a6e, outfit: 0xb9a7e6, pants: 0x3a3f5e, accent: 0xffffff, headband: 0x8a7fd4 },
    skill: {
      id: 'byakugan',
      name: 'Byakugan Vision',
      desc: 'Tactical eye power: detect & highlight enemies through walls for 8s. +15% move speed.',
      cooldown: 22, chakra: 30, duration: 8, speedBuff: 1.15,
    },
  },
  sakura: {
    id: 'sakura',
    name: 'Sakura Haruno',
    title: 'The Strongest Kunoichi',
    hp: 200,
    speed: 6.0,
    difficulty: 1,
    desc: 'Monster strength and medical ninjutsu. Keeps herself — and her squad — in the fight.',
    quote: 'I\'ve always considered myself a true ninja!',
    colors: { skin: 0xffd2b0, hair: 0xff7fa5, outfit: 0xd42a3c, pants: 0x2b2f3a, accent: 0xffd23e, headband: 0x3a4a6b },
    skill: {
      id: 'heal',
      name: 'Medical Ninjutsu',
      desc: 'Healing wave: restores 80 HP to herself and 60 HP to nearby teammates over 3s.',
      cooldown: 25, chakra: 50, selfHeal: 80, allyHeal: 60, radius: 14, duration: 3,
    },
  },
};

export const CHARACTER_ORDER = ['naruto', 'sasuke', 'lee', 'hinata', 'sakura'];

export const BOT_NAMES = [
  'Kakashi', 'Guy', 'Shikamaru', 'Choji', 'Ino', 'Tenten',
  'Neji', 'Gaara', 'Temari', 'Kankuro', 'Asuma', 'Kurenai',
];

export function getConfigPayload() {
  return {
    tickRate: TICK_RATE,
    maxPlayers: MAX_PLAYERS,
    maxHp: MAX_HP,
    maxChakra: MAX_CHAKRA,
    matchTime: MATCH_TIME,
    countdownTime: COUNTDOWN_TIME,
    weapons: WEAPONS,
    weaponOrder: WEAPON_ORDER,
    characters: CHARACTERS,
    characterOrder: CHARACTER_ORDER,
  };
}
