import type { LobbySnapshot } from "../domain/types";
import { gameProgress } from "../domain/scoreHistory";

export function ScoreProgress({ snapshot }: { snapshot: LobbySnapshot }) {
  const progress = gameProgress(snapshot);
  return (
    <div className="score-progress">
      <p>
        <strong>Win condition:</strong> {progress.winCondition}
      </p>
      <dl>
        <div>
          <dt>Stage</dt>
          <dd>
            {progress.round}/{progress.rounds}
            <small className="score-stage-name">Cycle {progress.cycle}</small>
            <small className="score-stage-name">
              {snapshot.settings.rounds[snapshot.game!.roundIndex].name}
            </small>
          </dd>
        </div>
        <div>
          <dt>Hands played this stage</dt>
          <dd>
            {progress.handsPlayed}/{progress.handsInRound}
          </dd>
        </div>
        <div>
          <dt>Total hands played</dt>
          <dd>{progress.totalHandsPlayed}</dd>
        </div>
      </dl>
    </div>
  );
}
