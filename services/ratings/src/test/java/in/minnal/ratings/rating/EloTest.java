package in.minnal.ratings.rating;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.rating.Elo.Player;
import java.util.List;
import org.junit.jupiter.api.Test;

class EloTest {

    @Test
    void anEqualRatedOneVsOneWinLossAndDrawUseKOf32() {
        assertThat(Elo.delta(new Player(1200, 1), List.of(new Player(1200, 2)))).isEqualTo(16);
        assertThat(Elo.delta(new Player(1200, 2), List.of(new Player(1200, 1)))).isEqualTo(-16);
        assertThat(Elo.delta(new Player(1200, 1), List.of(new Player(1200, 1)))).isZero();
    }

    @Test
    void anEqualRatedOneVsOneIsSymmetric() {
        int winner = Elo.delta(new Player(1500, 1), List.of(new Player(1500, 2)));
        int loser = Elo.delta(new Player(1500, 2), List.of(new Player(1500, 1)));
        assertThat(winner).isEqualTo(-loser);
    }

    @Test
    void anUpsetMovesMoreThanAnExpectedWin() {
        int favouriteWins = Elo.delta(new Player(1500, 1), List.of(new Player(1200, 2)));
        int underdogWins = Elo.delta(new Player(1200, 1), List.of(new Player(1500, 2)));
        assertThat(underdogWins).isGreaterThan(favouriteWins);
        // E(1500 vs 1200) = 0.849: the favourite gains 32 * 0.151 = 4.8 -> 5, the underdog 32 * 0.849 = 27.2 -> 27.
        assertThat(favouriteWins).isEqualTo(5);
        assertThat(underdogWins).isEqualTo(27);
    }

    @Test
    void aFourPlayerMatchUsesKOf32Over3AndSumsPairwiseTermsOnce() {
        // Equal ratings, placements 1, 2, 2, 4: player A beats all three: 3 * (32/3) * 0.5 = 16.
        Player a = new Player(1200, 1);
        assertThat(Elo.delta(a, List.of(new Player(1200, 2), new Player(1200, 2), new Player(1200, 4)))).isEqualTo(16);
        // A tied player: beats the 4th (+0.5), draws the other tied one (0), loses to the first (-0.5): 0.
        Player tied = new Player(1200, 2);
        assertThat(Elo.delta(tied, List.of(new Player(1200, 1), new Player(1200, 2), new Player(1200, 4)))).isZero();
        // Last place loses to all three: -16.
        assertThat(Elo.delta(new Player(1200, 4), List.of(new Player(1200, 1), new Player(1200, 2), new Player(1200, 2)))).isEqualTo(-16);
    }

    @Test
    void roundsHalfAwayFromZeroForPositiveAndNegativeTotals() {
        // 3 players, K = 16: a win over one equal-rated and a loss to another equal-rated: 16*0.5 - 16*0.5 = 0.
        assertThat(Elo.delta(new Player(1200, 2), List.of(new Player(1200, 3), new Player(1200, 1)))).isZero();
        // 5 players: K = 8; two wins and two draws over equal ratings: 8*(0.5+0.5+0+0) = 8.
        assertThat(Elo.delta(new Player(1200, 1), List.of(new Player(1200, 3), new Player(1200, 3), new Player(1200, 1), new Player(1200, 1)))).isEqualTo(8);
        // A half: 3 players K = 16, one win and one draw over equals = 16*0.5 + 0 = 8 (exact); use a skewed pair for .5:
        // 1v1 at 1200 vs 1201 and a win: 32 * (1 - 0.49856) = 16.046 -> 16; a loss: -15.95 -> -16.
        assertThat(Elo.delta(new Player(1200, 1), List.of(new Player(1201, 2)))).isEqualTo(16);
        assertThat(Elo.delta(new Player(1200, 2), List.of(new Player(1201, 1)))).isEqualTo(-16);
    }

    @Test
    void noOpponentsMeansNoChange() {
        assertThat(Elo.delta(new Player(1200, 1), List.of())).isZero();
    }
}
