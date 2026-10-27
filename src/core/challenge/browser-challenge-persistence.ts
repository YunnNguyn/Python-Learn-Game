import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../persistence/persistence-scope";
import {
  ChallengeStorageUnavailableError,
  type ChallengePersistence,
  type ChallengePersistenceCloseState,
  type SubmissionRecord,
} from "./challenge-persistence";
import { IndexedDbChallengePersistence } from "./indexeddb-challenge-persistence";

/**
 * The Challenge database for `scope`, DURABLE ONLY: never wrapped in a memory
 * failover. Without IndexedDB every operation rejects with
 * ChallengeStorageUnavailableError, so a submission can never look saved while
 * living only in RAM. An invalid scope throws first, even where IndexedDB is missing.
 */
export function createBrowserChallengePersistence(scope: PersistenceScope = GUEST_SCOPE): ChallengePersistence {
  resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.challenge, scope);

  if (typeof indexedDB === "undefined") {
    return new UnavailableChallengePersistence();
  }
  return new IndexedDbChallengePersistence(indexedDB, scope);
}

/** Stands in for the durable store when the browser has no IndexedDB API. Holds no state. */
export class UnavailableChallengePersistence implements ChallengePersistence {
  readonly kind = "indexeddb" as const;
  private closed = false;

  addSubmission(_record: SubmissionRecord): Promise<void> {
    return Promise.reject(new ChallengeStorageUnavailableError());
  }

  listSubmissions(_challengeId: string, _challengeVersion: string): Promise<SubmissionRecord[]> {
    return Promise.reject(new ChallengeStorageUnavailableError());
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  getCloseState(): ChallengePersistenceCloseState {
    return this.closed ? "closed" : "open";
  }
}
