import ReactMarkdown from "react-markdown";

export default function LoreText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={["lore-markdown", className].filter(Boolean).join(" ")}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
