import type { StatusFlyStyle } from "../types/statusfly";

interface StyleSelectorProps {
  value: StatusFlyStyle;
  onChange: (style: StatusFlyStyle) => void;
}

const styles: Array<{
  id: StatusFlyStyle;
  name: string;
  description: string;
}> = [
  {
    id: "luxe",
    name: "Luxe",
    description: "Premium, editorial and elegant",
  },
  {
    id: "bold",
    name: "Modern",
    description: "Sharp, clean and professional",
  },
  {
    id: "street",
    name: "Vibrant",
    description: "Energetic, bold and eye-catching",
  },
  {
    id: "clean",
    name: "Clean",
    description: "Minimal, calm and versatile",
  },
];

function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div className="style-grid">
      {styles.map((style) => {
        const active = value === style.id;

        return (
          <button
            key={style.id}
            type="button"
            className={`style-option style-choice-${style.id} ${active ? "active" : ""}`}
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

            <span className="style-option-accent">StatusFly · 01—05</span>
          </button>
        );
      })}
    </div>
  );
}

export default StyleSelector;
