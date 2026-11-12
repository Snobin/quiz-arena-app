package in.minnal.core.identity.infrastructure;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses the RSA keys handed to core-service through the environment. Each value is the base64 of
 * a PEM file, so it fits on one {@code .env} line:
 * <ul>
 *   <li>signing key: a PKCS#8 {@code -----BEGIN PRIVATE KEY-----} PEM ({@code openssl genpkey});</li>
 *   <li>extra public key: an SPKI {@code -----BEGIN PUBLIC KEY-----} PEM ({@code openssl pkey -pubout}).</li>
 * </ul>
 * Error messages never include key material.
 */
final class PemKeys {

    static final int MIN_RSA_BITS = 2048;

    private static final Pattern PEM = Pattern.compile(
            "-----BEGIN ([A-Z ]+)-----(.*?)-----END \\1-----", Pattern.DOTALL);

    private PemKeys() {
    }

    record RsaKeyPair(RSAPublicKey publicKey, RSAPrivateCrtKey privateKey) {
    }

    /** A base64 PKCS#8 PEM RSA private key (≥ 2048 bits), with its public half derived from it. */
    static RsaKeyPair privateKey(String base64Pem, String what) {
        byte[] der = pemBody(base64Pem, "PRIVATE KEY", what);
        try {
            KeyFactory rsa = KeyFactory.getInstance("RSA");
            if (!(rsa.generatePrivate(new PKCS8EncodedKeySpec(der)) instanceof RSAPrivateCrtKey privateKey)) {
                throw new IllegalStateException(what + " is not an RSA private key with CRT parameters");
            }
            RSAPublicKey publicKey = (RSAPublicKey) rsa.generatePublic(
                    new RSAPublicKeySpec(privateKey.getModulus(), privateKey.getPublicExponent()));
            requireStrength(publicKey.getModulus(), what);
            return new RsaKeyPair(publicKey, privateKey);
        } catch (GeneralSecurityException | ClassCastException e) {
            throw new IllegalStateException(what + " is not a valid PKCS#8 RSA private key", e);
        }
    }

    /** A base64 SPKI PEM RSA public key (≥ 2048 bits). */
    static RSAPublicKey publicKey(String base64Pem, String what) {
        byte[] der = pemBody(base64Pem, "PUBLIC KEY", what);
        try {
            if (!(KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der)) instanceof RSAPublicKey key)) {
                throw new IllegalStateException(what + " is not an RSA public key");
            }
            requireStrength(key.getModulus(), what);
            return key;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(what + " is not a valid SPKI RSA public key", e);
        }
    }

    private static void requireStrength(BigInteger modulus, String what) {
        if (modulus.bitLength() < MIN_RSA_BITS) {
            throw new IllegalStateException(what + " is an RSA key of " + modulus.bitLength()
                    + " bits; at least " + MIN_RSA_BITS + " are required");
        }
    }

    private static byte[] pemBody(String base64Pem, String label, String what) {
        String pem;
        try {
            pem = new String(Base64.getMimeDecoder().decode(base64Pem.strip()), StandardCharsets.US_ASCII);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(what + " is not base64 (expected the base64 of a PEM file)", e);
        }
        Matcher matcher = PEM.matcher(pem);
        if (!matcher.find() || !label.equals(matcher.group(1))) {
            throw new IllegalStateException(what + " must be the base64 of a '-----BEGIN " + label + "-----' PEM");
        }
        try {
            return Base64.getMimeDecoder().decode(matcher.group(2).strip());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(what + " has a corrupt PEM body", e);
        }
    }
}
