export const BRAND = {
  name: "The Engineers Club",
  // Legal entity named in contracts and emails. Override with COMPANY_LEGAL_NAME (server-side).
  legalName: (typeof process !== "undefined" && process.env.COMPANY_LEGAL_NAME) || "Harbor Security Ltd",
  // Companies House number (England and Wales). Override with COMPANY_NUMBER (server-side).
  companyNumber: (typeof process !== "undefined" && process.env.COMPANY_NUMBER) || "17242789",
  website: "https://theengineers.club",
  websiteLabel: "theengineers.club",
  productName: "Contract Dashboard",
  colors: {
    ink: "#141414",
    paper: "#faf9f7",
    bronze: "#9b7442",
    bronzeLight: "#c9a979",
    line: "#e7e2da",
    muted: "#6b665e",
  },
} as const;
