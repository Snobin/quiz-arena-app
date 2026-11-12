/**
 * DTOs of the {@code /internal/**} service-to-service endpoints (AD-12).
 *
 * <p>{@code POST /internal/question-sets}: game-service sends a {@link QuestionSetRequest} with the
 * {@code X-Internal-Token} header; core-service answers with a {@link QuestionSetResponse} holding
 * exactly {@code count} questions, or a {@code 4xx} RFC 9457 Problem Details body.
 */
package in.minnal.contracts.internal;
