interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img className="brand-icon" src="/icone_melo.png" alt="" aria-hidden="true" />
      <span className="brand-name">MeloStival</span>
    </div>
  );
}
