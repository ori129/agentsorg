import { ReactNode } from "react";

interface CardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function Card({ title, description, children }: CardProps) {
  return (
    <div className="rounded-lg p-6" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
      <h2 className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>{title}</h2>
      {description && (
        <p className="mt-1 text-sm" style={{ color: "var(--c-text-3)" }}>{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}
