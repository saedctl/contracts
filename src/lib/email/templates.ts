import { BRAND } from "../brand";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Layout {
  preheader: string;
  paragraphs: string[]; // plain text, escaped here
  button?: { label: string; url: string };
  afterButton?: string[];
  demo: boolean;
}

function layout({ preheader, paragraphs, button, afterButton = [], demo }: Layout): string {
  const c = BRAND.colors;
  const p = (t: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${c.ink};">${esc(t)}</p>`;
  const demoBanner = demo
    ? `<tr><td style="padding:12px 24px;background:#fbeae6;color:#8a2a1a;font:600 12px/18px Arial,sans-serif;text-align:center;">DEMO MODE — this is a test message. Any signature is simulated and not legally binding.</td></tr>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(BRAND.name)}</title></head>
<body style="margin:0;padding:0;background:${c.paper};-webkit-font-smoothing:antialiased;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.paper};padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 24px;font:500 13px/1 Georgia,'Times New Roman',serif;letter-spacing:4px;color:${c.bronze};text-transform:uppercase;">${esc(BRAND.name)}</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${c.line};border-radius:16px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${demoBanner}
<tr><td style="padding:36px 36px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
${paragraphs.map(p).join("\n")}
${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${c.ink};border-radius:10px;"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 28px;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;">${esc(button.label)}</a></td></tr></table>` : ""}
${afterButton.map(p).join("\n")}
<p style="margin:24px 0 0;font-size:15px;line-height:24px;color:${c.ink};">Best regards,<br>${esc(BRAND.name)} Team</p>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:24px 8px 0;font:12px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${c.muted};">
${esc(BRAND.name)} is operated by ${esc(BRAND.legalName)} · <a href="${BRAND.website}" style="color:${c.muted};">${esc(BRAND.websiteLabel)}</a>
</td></tr></table></td></tr></table></body></html>`;
}

export function signatureRequestEmail(opts: { customerName: string; url: string; expiresOn: string; demo: boolean }) {
  const subject = "Your Engineers Club Membership Agreement";
  const paragraphs = [
    `Hi ${opts.customerName},`,
    "Welcome to The Engineers Club!",
    "Please review and sign your membership agreement using the secure link below.",
  ];
  const after = [
    "Once signed, you'll receive a copy of your completed agreement for your records.",
    `This link is personal to you and expires on ${opts.expiresOn}. If the button doesn't work, copy this address into your browser: ${opts.url}`,
  ];
  return {
    subject,
    html: layout({ preheader: "Please review and sign your membership agreement.", paragraphs, button: { label: "Review & sign agreement", url: opts.url }, afterButton: after, demo: opts.demo }),
    text: [...paragraphs, "", `Review and sign: ${opts.url}`, "", ...after, "", "Best regards,", "The Engineers Club Team"].join("\n"),
  };
}

export function signatureConfirmationEmail(opts: { customerName: string; demo: boolean }) {
  const subject = "Your Signed Membership Agreement";
  const paragraphs = [
    `Hi ${opts.customerName},`,
    "Thank you for signing your membership agreement.",
    "Attached is a copy of your completed contract for your records.",
    "We're looking forward to having you in The Engineers Club!",
  ];
  return {
    subject,
    html: layout({ preheader: "Your completed membership agreement is attached.", paragraphs, demo: opts.demo }),
    text: [...paragraphs, "", "Best regards,", "The Engineers Club Team"].join("\n"),
  };
}

export function businessCopyEmail(opts: { customerName: string; customerEmail: string; reference: string; dashboardUrl: string; demo: boolean }) {
  const subject = `Signed: ${opts.customerName} — ${opts.reference}`;
  const paragraphs = [
    `${opts.customerName} (${opts.customerEmail}) has signed membership agreement ${opts.reference}.`,
    "The completed agreement, including the e-signature provider's audit trail, is attached.",
  ];
  return {
    subject,
    html: layout({ preheader: subject, paragraphs, button: { label: "Open in dashboard", url: opts.dashboardUrl }, demo: opts.demo }),
    text: [...paragraphs, "", opts.dashboardUrl].join("\n"),
  };
}
