import {
  Sparkle,
  Star,
  Circle,
  Diamond,
  Square,
  Triangle,
  Heart,
  Sun,
  Moon,
  Cloud,
  Music,
  Spade,
  Club,
  Flower,
  Umbrella,
  Snowflake,
  CircleDot,
  Hexagon,
  Plane,
  Infinity,
  Pi,
  CircleHelp,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
const icons: Record<string, LucideIcon> = {
  "✦": Sparkle,
  "★": Star,
  "●": Circle,
  "◆": Diamond,
  "■": Square,
  "▲": Triangle,
  "♥": Heart,
  "☀": Sun,
  "☾": Moon,
  "☁": Cloud,
  "♬": Music,
  "♠": Spade,
  "♣": Club,
  "♦": Diamond,
  "✿": Flower,
  "☂": Umbrella,
  "☃": Snowflake,
  "◎": Circle,
  "◉": CircleDot,
  "⬢": Hexagon,
  "✈": Plane,
  "∞": Infinity,
  π: Pi,
  "?": CircleHelp,
  "!": CircleAlert,
};
const filled = new Set(["★", "●", "◆", "■", "▲", "♥", "♠", "♣", "♦", "⬢"]);
export function AvatarGlyph({ name }: { name: string }) {
  if (name === "λ")
    return (
      <svg className="avatar-glyph-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 3h3l9 18h3M12 9 5 21"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (name === "☯")
    return (
      <svg className="avatar-glyph-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 2a10 10 0 0 0 0 20 5 5 0 0 1 0-10 5 5 0 0 0 0-10"
          fill="currentColor"
        />
        <circle cx="12" cy="7" r="1.5" fill="var(--paper)" />
        <circle cx="12" cy="17" r="1.5" fill="currentColor" />
      </svg>
    );
  const Icon = icons[name] ?? Sparkle;
  return (
    <Icon
      className="avatar-glyph-icon"
      aria-hidden="true"
      strokeWidth={2.2}
      fill={filled.has(name) ? "currentColor" : "none"}
    />
  );
}
