import type { StatusFlyStyle } from "../types/statusfly";

interface StyleSelectorProps {
  value: StatusFlyStyle;
  onChange: (style: StatusFlyStyle) => void;
}

const styles: Array<{
  id: StatusFlyStyle;
  name: string;
  description: string;
  accent: string;
}> = [
  {
    id: "clean",
    name: "Clean",
    description: "Editorial, airy and refined",
    accent: "soft coral",
  },
  {
    id: "bold",
    name: "Bold",
    description: "High contrast with confident type",
    accent: "signal red",
  },
  {
    id: "luxe",
    name: "Luxe",
    description: "Deep, warm and quietly premium",
    accent: "copper gold",
  },
  {
    id: "street",
    name: "Street",
    description: "Graphic, playful and energetic",
    accent: "mixed accents",
  },
];

function StyleSelector({
  value,
  onChange,
}: StyleSelectorProps) {
  return (
    <div className="style-grid">
      {styles.map((style) => {
        const active = value === style.id;

        return (
          <button
            key={style.id}
            type="button"
            aria-pressed={active}
            className={`style-option style-option-${style.id} ${
              active ? "active" : ""
            }`}
            onClick={() => onChange(style.id)}
          >
            <span className="style-mini-preview" aria-hidden="true">
              <span className="style-mini-orb" />
              <span className="style-mini-block" />
              <span className="style-mini-line" />
            </span>

            <span className="style-option-copy">
              <span className="style-option-name">{style.name}</span>
              <span className="style-option-description">
                {style.description}
              </span>
            </span>

            <span className="style-option-accent">{style.accent}</span>
          </button>
        );
      })}
    </div>
  );
}

export default StyleSelector;
