interface IconTagProps {
  icon: string | null;
  label: string;
  tint?: string | null;
}

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
