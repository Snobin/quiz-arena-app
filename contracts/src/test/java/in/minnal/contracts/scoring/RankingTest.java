package in.minnal.contracts.scoring;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.scoring.Ranking.Standing;
import java.util.List;
import org.junit.jupiter.api.Test;

class RankingTest {

    @Test
    void aClearWinPlacesByScore() {
        assertThat(Ranking.placements(List.of(new Standing(3140, 5), new Standing(2980, 6)))).containsExactly(1, 2);
        assertThat(Ranking.placements(List.of(new Standing(900, 1), new Standing(4000, 5)))).containsExactly(2, 1);
    }

    @Test
    void anEqualScoreIsBrokenByTheCorrectCount() {
        assertThat(Ranking.placements(List.of(new Standing(1500, 3), new Standing(1500, 2)))).containsExactly(1, 2);
        assertThat(Ranking.placements(List.of(new Standing(1500, 2), new Standing(1500, 3)))).containsExactly(2, 1);
    }

    @Test
    void aFullTieSharesThePlacementWithCompetitionRanking() {
        assertThat(Ranking.placements(List.of(new Standing(1500, 2), new Standing(1500, 2)))).containsExactly(1, 1);
        assertThat(Ranking.placements(List.of(new Standing(0, 0), new Standing(0, 0)))).containsExactly(1, 1);
        assertThat(Ranking.placements(List.of(
                new Standing(2000, 3), new Standing(2000, 3), new Standing(1200, 2), new Standing(1200, 2),
                new Standing(100, 1)))).containsExactly(1, 1, 3, 3, 5);
    }

    /** A forfeiter is ranked on the score she earned before she left; the ranking knows nothing of the forfeit. */
    @Test
    void aForfeiterIsRankedOnHerEarnedScore() {
        record Player(String name, int score, int correct, boolean forfeited) {
        }
        List<Player> players = List.of(
                new Player("left at Q3", 2400, 3, true),
                new Player("played on", 1800, 4, false));
        assertThat(Ranking.placements(players, Player::score, Player::correct)).containsExactly(1, 2);
        assertThat(Ranking.placements(players, Player::score, Player::correct, Player::forfeited, false))
                .containsExactly(1, 2);
    }

    @Test
    void aOneVsOneForfeiterWhoLedStillPlacesLast() {
        record Player(int score, int correct, boolean forfeited) {
        }
        List<Player> players = List.of(new Player(2400, 3, true), new Player(1800, 4, false));
        assertThat(Ranking.placements(players, Player::score, Player::correct, Player::forfeited, true))
                .containsExactly(2, 1);
    }

    @Test
    void aThreeWayTieForFirstSharesOneAndSkipsToFour() {
        assertThat(Ranking.placements(List.of(
                new Standing(2000, 3), new Standing(2000, 3), new Standing(2000, 3), new Standing(900, 1))))
                .containsExactly(1, 1, 1, 4);
    }

    @Test
    void aTieForThirdSharesThirdAndSkipsToFive() {
        assertThat(Ranking.placements(List.of(
                new Standing(4000, 5), new Standing(3000, 4), new Standing(2000, 3), new Standing(2000, 3),
                new Standing(100, 1)))).containsExactly(1, 2, 3, 3, 5);
    }

    @Test
    void aRoomForfeiterInATwentyThreePlayerFieldRanksOnHerEarnedScore() {
        record Player(int score, int correct, boolean forfeited) {
        }
        java.util.List<Player> players = new java.util.ArrayList<>();
        for (int i = 0; i < 22; i++) {
            players.add(new Player(4000 - i * 100, 5, false));
        }
        players.add(2, new Player(3850, 5, true)); // left, but earned more than everyone from the fourth place down
        List<Integer> placements = Ranking.placements(players, Player::score, Player::correct, Player::forfeited, false);
        assertThat(placements).hasSize(23);
        assertThat(placements.get(2)).isEqualTo(3);
        assertThat(placements.get(3)).isEqualTo(4);
        assertThat(placements.get(22)).isEqualTo(23);
    }

    @Test
    void anEmptyOrSingleListIsFine() {
        assertThat(Ranking.placements(List.of())).isEmpty();
        assertThat(Ranking.placements(List.of(new Standing(0, 0)))).containsExactly(1);
    }
}
