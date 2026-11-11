/**
 * Shared contracts between Minnal services (AD-1, AD-2).
 *
 * <p>This is the only module services may share. It holds plain Java types only:
 * event records, {@code /internal} DTOs, the STOMP envelope and message types,
 * {@code Scoring} and {@code Ranking}. It must never contain Spring code, domain
 * entities or persistence code.
 */
package in.minnal.contracts;
