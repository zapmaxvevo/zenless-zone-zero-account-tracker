import type { ButtonHTMLAttributes } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * El botón base de `zzz-ui`. Sus estilos son las clases `.zui-button*` de `styles/eridu.css`,
 * y este archivo es la única puerta hacia ellas: una pantalla pide `<Button>` o `<LinkButton>`,
 * nunca escribe la clase a mano.
 */

type Tone = 'default' | 'accent' | 'danger';
type Size = 'md' | 'sm';

function buttonClass(tone: Tone, size: Size, extra?: string): string {
  return [
    'zui-button',
    tone === 'default' ? undefined : `zui-button-${tone}`,
    size === 'sm' ? 'zui-button-sm' : undefined,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: Size;
}

export default function Button({
  tone = 'default',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClass(tone, size, className)} {...rest} />;
}

interface LinkButtonProps {
  to: string;
  tone?: Tone;
  size?: Size;
  className?: string;
  children: ReactNode;
}

/** El mismo botón, pero navegando: la acción de un `SectionHead`, el pie de un hero. */
export function LinkButton({
  to,
  tone = 'default',
  size = 'md',
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link className={buttonClass(tone, size, className)} to={to}>
      {children}
    </Link>
  );
}
