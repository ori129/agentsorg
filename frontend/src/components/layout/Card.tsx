import { ReactNode } from "react";

interface CardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function Card({ title, description, children }: CardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}
