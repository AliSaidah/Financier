import { useState } from "react";
import { BankId } from "../types/finance";

const BANK_META: Record<BankId, { abbr: string; bg: string; fg: string; domain: string }> = {
  bb:             { abbr: "BB",  bg: "#F8C005", fg: "#003882", domain: "bb.com.br" },
  itau:           { abbr: "Itaú", bg: "#EC7000", fg: "#ffffff", domain: "itau.com.br" },
  sicredi:        { abbr: "Sci", bg: "#019F3C", fg: "#ffffff", domain: "sicredi.com.br" },
  inter:          { abbr: "Int", bg: "#FF6B00", fg: "#ffffff", domain: "inter.co" },
  nubank:         { abbr: "Nu",  bg: "#820AD1", fg: "#ffffff", domain: "nubank.com.br" },
};

function logoUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

interface Props {
  bankId: BankId;
  size?: number;
  radius?: number;
}

export function BankLogo({ bankId, size = 36, radius = 10 }: Props) {
  const meta = BANK_META[bankId];
  const [failed, setFailed] = useState(false);
  const fontSize = size * 0.33;

  const badge = (
    <div
      style={{
        width: size, height: size, borderRadius: radius,
        background: meta.bg, color: meta.fg, fontSize,
        fontWeight: 700, fontFamily: "Calibri, Arial, sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, letterSpacing: "-0.02em", userSelect: "none",
      }}
    >
      {meta.abbr}
    </div>
  );

  if (failed) return badge;

  return (
    <div
      style={{
        width: size, height: size, borderRadius: radius,
        overflow: "hidden", flexShrink: 0,
        background: meta.bg,
      }}
    >
      <img
        src={logoUrl(meta.domain)}
        alt={bankId}
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}

export { BANK_META };
