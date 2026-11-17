import { useState } from "react";
import type { GameRuntime, Player } from "../domain/types";

export function ScoreHistoryChart({
  game,
  players,
}: {
  game: GameRuntime;
  players: Player[];
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const history = game.scoreHistory;
  const ids = [
    ...new Set(history.flatMap((point) => Object.keys(point.scores))),
  ];
  const names = Object.assign(
    {},
    ...history.map((point) => point.names),
    Object.fromEntries(players.map((p) => [p.id, p.name])),
  ) as Record<string, string>;
  const colors = ids.map(
    (_, index) => `hsl(${(index * 137.508 + 255) % 360} 65% 40%)`,
  );
  const visible = ids.filter((id) => !hidden.includes(id));
  const values = history.flatMap((point) =>
    visible.flatMap((id) =>
      point.scores[id] === undefined ? [] : [point.scores[id]],
    ),
  );
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil((max - min) / 5));
  const low = Math.floor(min / step) * step,
    high = Math.ceil(max / step) * step;
  const width = 800,
    height = 340,
    left = 70,
    right = 24,
    top = 40,
    bottom = 52;
  const lastTurn = Math.max(1, history.at(-1)?.turn ?? 1);
  const x = (turn: number) => left + (turn / lastTurn) * (width - left - right);
  const y = (score: number) =>
    height - bottom - ((score - low) / (high - low)) * (height - top - bottom);
  const ticks = Array.from(
    { length: Math.round((high - low) / step) + 1 },
    (_, i) => low + i * step,
  );
  const turnStep = Math.max(1, Math.ceil(lastTurn / 10));
  const turnTicks = [
    ...new Set([
      ...Array.from(
        { length: Math.floor(lastTurn / turnStep) + 1 },
        (_, i) => i * turnStep,
      ),
      lastTurn,
    ]),
  ];
  const boundaries = history.filter(
    (point, index) =>
      index > 0 && point.roundStartTurn !== history[index - 1].roundStartTurn,
  );
  return (
    <section className="score-history">
      <h2>Score history</h2>
      <p className="eyebrow">Cycle {game.cycleIndex + 1}</p>
      <p>
        Scores at the end of each hand, including reactions and score
        adjustments. Dashed lines mark new stages; C labels identify stage
        cycles.
      </p>
      <div className="score-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Player scores by turn, with dashed stage boundaries"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "#918a9d" : "#ded8e4"}
              />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {turnTicks.map((turn) => (
            <text
              key={turn}
              x={x(turn)}
              y={height - bottom + 22}
              textAnchor="middle"
            >
              {turn}
            </text>
          ))}
          {boundaries.map((point) => (
            <g key={point.turn}>
              <line
                x1={x(point.roundStartTurn - 0.5)}
                x2={x(point.roundStartTurn - 0.5)}
                y1={top}
                y2={height - bottom}
                stroke="#918a9d"
                strokeDasharray="5 5"
              />
              <text
                x={x(point.roundStartTurn - 0.5) + 4}
                y={top - 12}
                fontSize="11"
              >
                C{point.cycleIndex + 1} · S{point.roundIndex + 1}
              </text>
            </g>
          ))}
          <text
            x={18}
            y={height / 2}
            transform={`rotate(-90 18 ${height / 2})`}
            textAnchor="middle"
          >
            Points
          </text>
          <text x={width / 2} y={height - 6} textAnchor="middle">
            Turn number
          </text>
          {ids.map((id, index) => {
            if (hidden.includes(id)) return null;
            let connected = false;
            const path = history
              .map((point) => {
                if (point.scores[id] === undefined) {
                  connected = false;
                  return "";
                }
                const command = connected ? "L" : "M";
                connected = true;
                return `${command}${x(point.turn)},${y(point.scores[id])}`;
              })
              .join(" ");
            return (
              <g key={id}>
                <path
                  d={path}
                  fill="none"
                  stroke={colors[index]}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {history
                  .filter((point) => point.scores[id] !== undefined)
                  .map((point) => (
                    <circle
                      key={point.turn}
                      cx={x(point.turn)}
                      cy={y(point.scores[id])}
                      r={3.5}
                      fill={colors[index]}
                      stroke="white"
                      strokeWidth={1}
                    >
                      <title>
                        {names[id] ?? "Player"}: {point.scores[id]} points ·
                        Turn {point.turn}
                      </title>
                    </circle>
                  ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="score-chart-legend" aria-label="Players shown on graph">
        {ids.map((id, index) => (
          <button
            key={id}
            type="button"
            aria-pressed={!hidden.includes(id)}
            onClick={() =>
              setHidden((items) =>
                items.includes(id)
                  ? items.filter((item) => item !== id)
                  : [...items, id],
              )
            }
          >
            <i style={{ background: colors[index] }} aria-hidden="true" />
            {names[id] ?? "Player"}
          </button>
        ))}
      </div>
      <details className="score-chart-data">
        <summary>View score history as a table</summary>
        <div className="score-chart-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Turn</th>
                <th scope="col">Cycle</th>
                <th scope="col">Stage</th>
                {ids.map((id) => (
                  <th scope="col" key={id}>
                    {names[id] ?? "Player"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((point) => (
                <tr key={point.turn}>
                  <th scope="row">{point.turn}</th>
                  <td>{point.cycleIndex + 1}</td>
                  <td>{point.roundIndex + 1}</td>
                  {ids.map((id) => (
                    <td key={id}>{point.scores[id] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
