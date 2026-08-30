interface IconTagProps {
  /** El icono del juego; sin icono bajado el tag cae al nombre en texto. */
  icon: string | null;
  /** El nombre traducido: nunca se dibuja si hay icono, pero es el que se lee. */
  label: string;
  /** Color del dominio para el borde, cuando el dato lo tiene (regla 7). */
  tint?: string | null;
}

/**
 * Un tag de dominio —atributo, especialidad— dibujado con su icono del juego.
 *
 * El juego nombra estas categorías con un símbolo, no con una palabra, así que la app hace
 * lo mismo: el nombre viaja en `title` y en texto para lectores de pantalla, y solo se ve
 * cuando el icono todavía no está bajado.
 */
export default function IconTag({ icon, label, tint = null }: IconTagProps) {
  const className = tint ? 'tag ne-tag-tint' : 'tag';
  const style = tint ? { ['--tint' as string]: tint } : undefined;

  if (!icon) {
    return (
      <span className={className} style={style}>
        {label}
      </span>
    );
  }

  return (
    <span className={`${className} ne-tag-icon`} style={style} title={label}>
      <img src={icon} alt="" loading="lazy" />
      <span className="ne-sr-only">{label}</span>
    </span>
  );
}
