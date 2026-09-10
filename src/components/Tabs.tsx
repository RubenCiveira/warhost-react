/** Pestanas de una vista. El estado lo lleva quien la usa. */
export default function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (siguiente: T) => void;
  items: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={value === item.id ? "tab activa" : "tab"}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined ? <span className="tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
