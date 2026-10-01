/**
 * Reproducible procedural RNG contract for mission generation.
 *
 * Seed hashing: FNV-1a 32-bit over JavaScript UTF-16 code units.
 * PRNG: Mulberry32 with uint32 state.
 * Algorithm identifier: fnv1a32-mulberry32-v1.
 *
 * Changing either the seed hashing or PRNG algorithm changes generated streams
 * for existing seeds and must therefore be treated as a compatibility decision.
 * This implementation is deterministic infrastructure, not cryptographic RNG.
 */

export const SEEDED_RNG_ALGORITHM = "fnv1a32-mulberry32-v1" as const;

export interface SeededRng {
  nextFloat(): number;

  nextInt(minInclusive: number, maxExclusive: number): number;

  pick<T>(items: readonly T[]): T;

  shuffle<T>(items: readonly T[]): T[];
}

const UINT32_RANGE = 0x1_0000_0000;
const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;
const MULBERRY32_INCREMENT = 0x6d2b79f5;

function fnv1a32(seed: string): number {
  let hash = FNV1A_OFFSET_BASIS;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, FNV1A_PRIME) >>> 0;
  }

  return hash >>> 0;
}

function assertNextIntBounds(
  minInclusive: number,
  maxExclusive: number,
): number {
  if (
    !Number.isSafeInteger(minInclusive) ||
    !Number.isSafeInteger(maxExclusive)
  ) {
    throw new RangeError("nextInt bounds must be finite safe integers.");
  }

  if (maxExclusive <= minInclusive) {
    throw new RangeError(
      "nextInt requires maxExclusive to be greater than minInclusive.",
    );
  }

  const span = maxExclusive - minInclusive;

  if (span > UINT32_RANGE) {
    throw new RangeError("nextInt range size must be at most 2^32.");
  }

  return span;
}

export function createSeededRng(seed: string): SeededRng {
  let state = fnv1a32(seed);

  function nextUint32(): number {
    state = (state + MULBERRY32_INCREMENT) >>> 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return (value ^ (value >>> 14)) >>> 0;
  }

  function nextFloat(): number {
    return nextUint32() / UINT32_RANGE;
  }

  function nextInt(minInclusive: number, maxExclusive: number): number {
    const span = assertNextIntBounds(minInclusive, maxExclusive);
    const acceptanceLimit = UINT32_RANGE - (UINT32_RANGE % span);

    let sample: number;
    do {
      sample = nextUint32();
    } while (sample >= acceptanceLimit);

    return minInclusive + (sample % span);
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("pick requires at least one item.");
    }

    return items[nextInt(0, items.length)]!;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = nextInt(0, index + 1);
      const current = shuffled[index]!;
      shuffled[index] = shuffled[swapIndex]!;
      shuffled[swapIndex] = current;
    }

    return shuffled;
  }

  return {
    nextFloat,
    nextInt,
    pick,
    shuffle,
  };
}
