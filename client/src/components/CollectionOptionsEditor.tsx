import { useState } from "react";
import type { ProductPageItemOption } from "../api/productPages";
import {
  COLLECTION_ATTRIBUTE_TYPES,
  COLLECTION_OPTION_SUGGESTIONS,
  getCollectionAttributeType,
  isSafeCollectionOptionToken,
  type CollectionAttributeType,
} from "../utils/collectionOptionRules";

type Props = {
  options: ProductPageItemOption[];
  onChange: (options: ProductPageItemOption[]) => void;
  disabled?: boolean;
};

const ATTRIBUTE_LABELS: Record<CollectionAttributeType, string> = {
  Size: "Size",
  Color: "Color",
  Material: "Material",
  Style: "Style",
  Capacity: "Capacity",
  Custom: "Other attribute",
};

function CollectionOptionsEditor({ options, onChange, disabled = false }: Props) {
  const [customValueByIndex, setCustomValueByIndex] = useState<Record<number, string>>({});
  const [errorsByIndex, setErrorsByIndex] = useState<Record<number, string>>({});

  function updateOption(index: number, patch: Partial<ProductPageItemOption>) {
    onChange(options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option));
    setErrorsByIndex((current) => ({ ...current, [index]: "" }));
  }

  function changeAttribute(index: number, selectedType: CollectionAttributeType) {
    const nextName = selectedType === "Custom" ? "" : selectedType;
    const duplicate = nextName && options.some((option, optionIndex) => optionIndex !== index && option.name.trim().toLocaleLowerCase() === nextName.toLocaleLowerCase());
    if (duplicate) {
      setErrorsByIndex((current) => ({ ...current, [index]: "That attribute is already in use for this item." }));
      return;
    }
    updateOption(index, { name: nextName, values: [] });
    setCustomValueByIndex((current) => ({ ...current, [index]: "" }));
  }

  function togglePreset(index: number, value: string) {
    const current = options[index];
    if (!current) return;
    const exists = current.values.some((choice) => choice.toLocaleLowerCase() === value.toLocaleLowerCase());
    if (!exists && current.values.length >= 10) {
      setErrorsByIndex((errors) => ({ ...errors, [index]: "Choose no more than 10 values for an attribute." }));
      return;
    }
    const values = exists
      ? current.values.filter((choice) => choice.toLocaleLowerCase() !== value.toLocaleLowerCase())
      : [...current.values, value];
    updateOption(index, { values });
  }

  function addCustomValue(index: number) {
    const current = options[index];
    const value = (customValueByIndex[index] ?? "").trim();
    if (!current) return;
    if (!isSafeCollectionOptionToken(value)) {
      setErrorsByIndex((errors) => ({ ...errors, [index]: "Enter one value (letters, numbers, spaces and simple punctuation only). Add values one at a time." }));
      return;
    }
    if (current.values.some((choice) => choice.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setErrorsByIndex((errors) => ({ ...errors, [index]: "That value has already been added." }));
      return;
    }
    if (current.values.length >= 10) {
      setErrorsByIndex((errors) => ({ ...errors, [index]: "Choose no more than 10 values for an attribute." }));
      return;
    }
    updateOption(index, { values: [...current.values, value] });
    setCustomValueByIndex((values) => ({ ...values, [index]: "" }));
  }

  function addAttribute() {
    if (options.length >= 3) return;
    const used = new Set(options.map((option) => option.name.trim().toLocaleLowerCase()));
    const firstUnused = COLLECTION_ATTRIBUTE_TYPES.find((type) => type !== "Custom" && !used.has(type.toLocaleLowerCase()));
    onChange([...options, { name: firstUnused ?? "", values: [] }]);
  }

  function removeAttribute(index: number) {
    onChange(options.filter((_, optionIndex) => optionIndex !== index));
    setCustomValueByIndex((current) => {
      const next: Record<number, string> = {};
      Object.entries(current).forEach(([key, value]) => {
        const oldIndex = Number(key);
        if (oldIndex < index) next[oldIndex] = value;
        if (oldIndex > index) next[oldIndex - 1] = value;
      });
      return next;
    });
    setErrorsByIndex({});
  }

  return (
    <div className="collection-options-editor">
      <div className="collection-options-heading">
        <span className="field-label">Product options</span>
        <span className="field-hint">Optional · up to 3 attributes</span>
      </div>
      <p className="field-note">Choose standard options or define your own. Customers will select these before opening WhatsApp.</p>
      {options.length ? <div className="collection-option-list">
        {options.map((option, index) => {
          const attributeType = getCollectionAttributeType(option.name);
          const suggestions = attributeType === "Custom" ? [] : COLLECTION_OPTION_SUGGESTIONS[attributeType];
          const shownSuggestions = [...suggestions];
          option.values.forEach((value) => {
            if (!shownSuggestions.some((suggestion) => suggestion.toLocaleLowerCase() === value.toLocaleLowerCase())) shownSuggestions.push(value);
          });
          return (
            <section className="collection-option-row" key={`${index}-${attributeType}`}>
              <div className="collection-option-row-top">
                <label className="field collection-option-type-field">
                  <span className="field-label">Attribute {index + 1}</span>
                  <select value={attributeType} onChange={(event) => changeAttribute(index, event.target.value as CollectionAttributeType)} disabled={disabled}>
                    {COLLECTION_ATTRIBUTE_TYPES.map((type) => {
                      const alreadyUsed = type !== "Custom" && options.some((candidate, candidateIndex) => candidateIndex !== index && candidate.name.trim().toLocaleLowerCase() === type.toLocaleLowerCase());
                      return <option key={type} value={type} disabled={alreadyUsed}>{ATTRIBUTE_LABELS[type]}</option>;
                    })}
                  </select>
                </label>
                {attributeType === "Custom" ? <label className="field collection-option-custom-name">
                  <span className="field-label">Attribute name</span>
                  <input maxLength={40} value={option.name} onChange={(event) => updateOption(index, { name: event.target.value })} placeholder="e.g. Fit, Pattern, Finish" disabled={disabled} />
                </label> : null}
                <button className="collection-option-remove" type="button" onClick={() => removeAttribute(index)} disabled={disabled} aria-label={`Remove attribute ${index + 1}`}>Remove</button>
              </div>
              <div className="collection-option-values-head">
                <span className="field-label">Available values</span>
                <span className="field-hint">{option.values.length}/10 selected</span>
              </div>
              {shownSuggestions.length ? <div className="collection-option-chips">
                {shownSuggestions.map((value) => {
                  const selected = option.values.some((choice) => choice.toLocaleLowerCase() === value.toLocaleLowerCase());
                  return <button key={value} type="button" className={`collection-option-chip ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => togglePreset(index, value)} disabled={disabled || (!selected && option.values.length >= 10)}>{selected ? "✓ " : "+ "}{value}</button>;
                })}
              </div> : null}
              <div className="collection-option-add-value">
                <label className="field">
                  <span className="field-label">Add a custom value</span>
                  <input maxLength={40} value={customValueByIndex[index] ?? ""} onChange={(event) => setCustomValueByIndex((current) => ({ ...current, [index]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomValue(index); } }} placeholder={attributeType === "Custom" ? "e.g. Floral, Matte, 1.5L" : "Not listed? Add one value"} disabled={disabled || option.values.length >= 10} />
                </label>
                <button type="button" className="button button-secondary collection-option-add-value-button" onClick={() => addCustomValue(index)} disabled={disabled || option.values.length >= 10 || !(customValueByIndex[index] ?? "").trim()}>Add value</button>
              </div>
              {option.values.length ? <div className="collection-option-selected-values" aria-label="Selected option values">{option.values.map((value) => <span className="collection-option-selected-value" key={value}>{value}<button type="button" onClick={() => togglePreset(index, value)} disabled={disabled} aria-label={`Remove ${value}`}>×</button></span>)}</div> : <p className="field-note">Select at least one value to make this option available to customers.</p>}
              {errorsByIndex[index] ? <p className="collection-option-error" role="alert">{errorsByIndex[index]}</p> : null}
            </section>
          );
        })}
      </div> : <div className="collection-options-empty"><span aria-hidden="true">＋</span><div><strong>No product options yet</strong><p>Add size, colour, material, or another attribute if customers need to choose a variant.</p></div></div>}
      {options.length < 3 ? <button type="button" className="button button-secondary collection-option-add-attribute" onClick={addAttribute} disabled={disabled}>+ Add an attribute</button> : <p className="field-note">You’ve reached the 3-attribute limit for this item.</p>}
    </div>
  );
}

export default CollectionOptionsEditor;
