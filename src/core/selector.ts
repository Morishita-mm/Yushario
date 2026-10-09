import type { Candidate } from "./decider";

const SCORE_THRESHOLD = 0.05;

// rng supplies a value in [0, 1), allowing callers to use seeded randomness.
export function selectCandidate(candidates: readonly Candidate[], rng: () => number): Candidate {
  if (candidates.length === 0) throw new Error("Cannot select from an empty candidate list");
  const highestScore = candidates.reduce((best, candidate) => Math.max(best, candidate.score), -Infinity);
  const contenders = candidates.filter((candidate) => highestScore - candidate.score <= SCORE_THRESHOLD);
  if (contenders.length === 1) return contenders[0];
  return contenders[Math.floor(rng() * contenders.length)];
}
