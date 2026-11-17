import type { CardPack } from "../domain/types";

export function PackSelector({
  packs,
  selectedIds,
  onChange,
}: {
  packs: CardPack[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="pack-selector">
      <div className="pack-selector-toolbar">
        <small>
          {packs.filter((pack) => selectedIds.includes(pack.id)).length}/
          {packs.length} enabled
        </small>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(packs.map((pack) => pack.id))}
        >
          Enable all
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange([])}
        >
          Disable all
        </button>
      </div>
      <div className="pack-selector-list">
        {packs.map((pack) => (
          <label className="pack-selector-row" key={pack.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(pack.id)}
              onChange={() =>
                onChange(
                  selectedIds.includes(pack.id)
                    ? selectedIds.filter((id) => id !== pack.id)
                    : [...selectedIds, pack.id],
                )
              }
            />
            <span>
              {pack.name}
              <small>
                {pack.blackCards.length} black · {pack.whiteCards.length} white
              </small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
