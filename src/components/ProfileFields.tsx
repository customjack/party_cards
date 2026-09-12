import {
  AVATARS,
  NAME_MAX_LENGTH,
  type Avatar as AvatarName,
} from "../domain/types";
import { Avatar } from "./Avatar";
export function ProfileFields({
  name,
  avatar,
  avatarColor,
  spectator,
  allowSpectator = true,
  onChange,
}: {
  name: string;
  avatar: AvatarName;
  avatarColor: string;
  spectator: boolean;
  allowSpectator?: boolean;
  onChange: (next: {
    name: string;
    avatar: AvatarName;
    avatarColor: string;
    spectator: boolean;
  }) => void;
}) {
  const update = (
    changes: Partial<{
      name: string;
      avatar: AvatarName;
      avatarColor: string;
      spectator: boolean;
    }>,
  ) => onChange({ name, avatar, avatarColor, spectator, ...changes });
  return (
    <div className="profile-fields">
      <label className="field">
        <span>Your display name</span>
        <input
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => update({ name: event.target.value })}
        />
        <small>
          {name.length}/{NAME_MAX_LENGTH}
        </small>
      </label>
      <div className="field">
        <span>Choose your icon</span>
        <div className="avatar-grid">
          {AVATARS.map((item) => (
            <button
              type="button"
              className={
                item === avatar ? "avatar-choice selected" : "avatar-choice"
              }
              onClick={() => update({ avatar: item })}
              key={item}
            >
              <Avatar name={item} color={avatarColor} />
              <span className="sr-only">{item}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="field color-field">
        <span>Icon color</span>
        <input
          type="color"
          value={avatarColor}
          onChange={(event) => update({ avatarColor: event.target.value })}
        />
      </label>
      {allowSpectator && (
        <label className="toggle-row">
          <span>
            <b>Join as spectator</b>
            <small>Watch without holding or judging cards.</small>
          </span>
          <input
            type="checkbox"
            checked={spectator}
            onChange={(event) => update({ spectator: event.target.checked })}
          />
        </label>
      )}
    </div>
  );
}
