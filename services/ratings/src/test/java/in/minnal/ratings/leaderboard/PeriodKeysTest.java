package in.minnal.ratings.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PeriodKeysTest {

    /** 2026-11-19 23:59:59 IST is 18:29:59 UTC. */
    static final Instant LAST_SECOND_OF_19TH_IST = Instant.parse("2026-11-19T18:29:59Z");
    static final Instant FIRST_SECOND_OF_20TH_IST = Instant.parse("2026-11-19T18:30:00Z");

    @Test
    void aDailyKeyIsTheIstDateAndTheDayChangesAtMidnightIst() {
        assertThat(PeriodKeys.key(Period.DAILY, LAST_SECOND_OF_19TH_IST)).isEqualTo("2026-11-19");
        assertThat(PeriodKeys.key(Period.DAILY, FIRST_SECOND_OF_20TH_IST)).isEqualTo("2026-11-20");
        // 00:30 IST on the 20th is still the 19th in UTC: the IST date is what counts.
        assertThat(PeriodKeys.key(Period.DAILY, Instant.parse("2026-11-19T19:00:00Z"))).isEqualTo("2026-11-20");
    }

    @Test
    void aWeeklyKeyIsTheIsoWeekStartingOnMondayInIst() {
        // 2026-11-22 is a Sunday, 2026-11-23 a Monday (week 48 starts on Monday the 23rd).
        assertThat(PeriodKeys.key(Period.WEEKLY, Instant.parse("2026-11-22T18:29:59Z"))).isEqualTo("2026-W47"); // Sunday 23:59:59 IST
        assertThat(PeriodKeys.key(Period.WEEKLY, Instant.parse("2026-11-22T18:30:00Z"))).isEqualTo("2026-W48"); // Monday 00:00:00 IST
        assertThat(PeriodKeys.key(Period.WEEKLY, Instant.parse("2026-11-11T05:00:00Z"))).isEqualTo("2026-W46");
    }

    @Test
    void theIsoWeekYearIsUsedAroundNewYear() {
        // 2026-12-31 (Thursday) is in 2026-W53; 2027-01-01 (Friday) is still 2026-W53; 2027-01-04 starts 2027-W01.
        assertThat(PeriodKeys.key(Period.WEEKLY, Instant.parse("2026-12-31T06:00:00Z"))).isEqualTo("2026-W53");
        assertThat(PeriodKeys.key(Period.WEEKLY, Instant.parse("2027-01-01T06:00:00Z"))).isEqualTo("2026-W53");
        assertThat(PeriodKeys.key(Period.WEEKLY, Instant.parse("2027-01-03T18:30:00Z"))).isEqualTo("2027-W01");
    }

    @Test
    void theAllTimeKeyIsAll() {
        assertThat(PeriodKeys.key(Period.ALLTIME, Instant.now())).isEqualTo("all");
        assertThat(PeriodKeys.window(Period.ALLTIME, Instant.now())).isNull();
    }

    @Test
    void windowsAreHalfOpenIstDaysAndMondayStartWeeks() {
        PeriodKeys.Window day = PeriodKeys.window(Period.DAILY, LAST_SECOND_OF_19TH_IST);
        assertThat(day.from()).isEqualTo(Instant.parse("2026-11-18T18:30:00Z"));
        assertThat(day.to()).isEqualTo(FIRST_SECOND_OF_20TH_IST); // excluded: it belongs to the next day
        PeriodKeys.Window week = PeriodKeys.window(Period.WEEKLY, Instant.parse("2026-11-19T10:00:00Z")); // a Thursday
        assertThat(week.from()).isEqualTo(Instant.parse("2026-11-15T18:30:00Z")); // Monday 16 Nov 00:00 IST
        assertThat(Duration.between(week.from(), week.to())).isEqualTo(Duration.ofDays(7));
    }

    @Test
    void retentionIs8DaysFor5WeeksAndNeverForAllTime() {
        assertThat(Period.DAILY.retention()).isEqualTo(Duration.ofDays(8));
        assertThat(Period.WEEKLY.retention()).isEqualTo(Duration.ofDays(35));
        assertThat(Period.ALLTIME.retention()).isNull();
    }

    @Test
    void parseAcceptsTheThreePeriodsOnly() {
        assertThat(Period.parse("daily")).contains(Period.DAILY);
        assertThat(Period.parse("weekly")).contains(Period.WEEKLY);
        assertThat(Period.parse("alltime")).contains(Period.ALLTIME);
        assertThat(Period.parse("monthly")).isEmpty();
        assertThat(Period.parse(null)).isEmpty();
    }
}
