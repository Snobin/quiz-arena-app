package in.minnal.core.profile.domain;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Kerala's 14 districts plus "Outside Kerala", as stable lowercase codes. */
public final class District {

    public static final Set<String> CODES = Arrays.stream(new String[] {
            "thiruvananthapuram", "kollam", "pathanamthitta", "alappuzha", "kottayam", "idukki", "ernakulam",
            "thrissur", "palakkad", "malappuram", "kozhikode", "wayanad", "kannur", "kasaragod", "outside-kerala"
    }).collect(Collectors.toUnmodifiableSet());

    private District() {
    }
}
