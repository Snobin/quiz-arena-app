package in.minnal.core.identity.infrastructure;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/** Test RSA keys in the environment format: base64 of a PEM file. */
public final class TestKeys {

    private TestKeys() {
    }

    public static KeyPair rsa(int bits) {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(bits);
            return generator.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** base64(PKCS#8 PEM), the MINNAL_JWT_SIGNING_KEY format. */
    public static String privatePemBase64(KeyPair pair) {
        return base64Pem("PRIVATE KEY", pair.getPrivate().getEncoded());
    }

    /** base64(SPKI PEM), the MINNAL_JWT_EXTRA_PUBLIC_KEYS value format. */
    public static String publicPemBase64(KeyPair pair) {
        return base64Pem("PUBLIC KEY", pair.getPublic().getEncoded());
    }

    public static String base64Pem(String label, byte[] der) {
        String pem = "-----BEGIN " + label + "-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(der)
                + "\n-----END " + label + "-----\n";
        return Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.US_ASCII));
    }
}
