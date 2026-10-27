import { createChallengeServices } from "../../app/services";
import { CHALLENGE_CATALOG } from "../../content/challenges/catalog";

/**
 * The one Challenge service set of the page. Created when the lazily loaded Challenge feature is first
 * imported (so the private solution and the IndexedDB code stay out of the initial bundle), and never
 * created twice. Like the Practice set it lives for the whole page; opening IndexedDB happens on first use.
 */
export const challengeServices = createChallengeServices({ catalog: CHALLENGE_CATALOG });
