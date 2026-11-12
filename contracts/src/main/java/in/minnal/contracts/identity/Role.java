package in.minnal.contracts.identity;

/**
 * Roles carried in a Minnal access token's {@code roles} claim (AD-9). A guest token carries only
 * {@code GUEST}; registered tokens carry a subset of {@code USER} and {@code ADMIN} (Epic 2).
 */
public enum Role {
    GUEST,
    USER,
    ADMIN
}
