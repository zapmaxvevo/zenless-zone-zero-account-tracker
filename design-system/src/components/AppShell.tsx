import type { ReactNode } from "react";

export interface AppShellProps {
  children?: ReactNode;
  className?: string;
  /** Ancho máximo de la columna de contenido. Por defecto `1080px`, el de la app. */
  maxWidth?: number | string;
}

/**
 * Raíz de toda pantalla del sistema: pinta el fondo New Eridu, fija el color de
 * texto y la tipografía, y centra el contenido en una columna de 1080px.
 *
 * Envolvé siempre la pantalla en esto. Los demás componentes asumen texto claro
 * sobre fondo oscuro, así que fuera del shell se ven ilegibles.
 */
export function AppShell({ children, className, maxWidth }: AppShellProps) {
  const classes = ["app-shell", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div
        className="app-shell-content"
        style={maxWidth ? { maxWidth } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
