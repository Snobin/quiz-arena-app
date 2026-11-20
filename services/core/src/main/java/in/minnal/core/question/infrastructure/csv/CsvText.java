package in.minnal.core.question.infrastructure.csv;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Decoding rules shared by the seed loader and the admin CSV upload: strict UTF-8, leading BOM stripped. */
public final class CsvText {

    private CsvText() {
    }

    /** Strict UTF-8: any malformed or unmappable byte sequence throws. */
    public static String decodeUtf8(byte[] bytes) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
    }

    public static String stripBom(String content) {
        return !content.isEmpty() && content.charAt(0) == '\uFEFF' ? content.substring(1) : content;
    }
}
