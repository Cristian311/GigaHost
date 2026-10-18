/**
 * Who is selling. Romanian e-commerce law (OUG 34/2014 and Law 365/2002)
 * requires a trader to identify itself on the site: legal name, registered
 * office, trade register number, VAT/registration code, and a way to be
 * reached. Consumers must also be pointed at ANPC and the EU ODR platform.
 *
 * Read from the environment rather than hard-coded, so the same build can be
 * run by a different entity, and so a missing value is visible instead of
 * silently wrong.
 */
export type CompanyDetails = {
  legalName: string;
  /** Cod Unic de Înregistrare. */
  cui: string;
  /** Registrul Comerțului, e.g. J40/1234/2026. */
  tradeRegister: string;
  address: string;
  email: string;
  phone: string | null;
  /** Set once the company is VAT-registered; changes how prices must be shown. */
  vatNumber: string | null;
};

function value(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

/**
 * Returns the configured details, or null when the company has not been
 * identified. Callers render nothing rather than placeholder text: an invented
 * registration number is worse than an absent one.
 */
export function getCompanyDetails(): CompanyDetails | null {
  const legalName = value("COMPANY_LEGAL_NAME");
  const cui = value("COMPANY_CUI");
  const tradeRegister = value("COMPANY_TRADE_REGISTER");
  const address = value("COMPANY_ADDRESS");
  const email = value("COMPANY_EMAIL");

  if (!legalName || !cui || !tradeRegister || !address || !email) return null;

  return {
    legalName,
    cui,
    tradeRegister,
    address,
    email,
    phone: value("COMPANY_PHONE"),
    vatNumber: value("COMPANY_VAT_NUMBER"),
  };
}

/** Consumer protection links that must be reachable from the site. */
export const CONSUMER_LINKS = {
  /** Autoritatea Națională pentru Protecția Consumatorilor. */
  anpc: "https://anpc.ro/",
  /** ANPC's alternative dispute resolution entry point. */
  anpcSal: "https://anpc.ro/ce-este-sal/",
  /** EU online dispute resolution platform. */
  odr: "https://ec.europa.eu/consumers/odr",
} as const;
