# The Engineers Club — Contract Dashboard

A small, purpose-built contract tool for **The Engineers Club** (operated by Harbor Security Ltd). Sales staff fill in a customer's details, review the agreement generated from the approved master template, and send it for e-signature in one click. The dashboard then tracks each contract until it is signed.

**Sales workflow (three steps, under 60 seconds)**

1. **Enter details**: customer name, email and phone; duration (the end date is calculated for you); amount, currency and payment status.
2. **Review contract**: the agreement is shown with every filled-in value highlighted. A PDF preview is available.
3. **Send for signature**: one click. The customer gets a branded email with a secure link, reads the full agreement, gives consent and signs by drawing, typing or uploading a signature. Both sides receive the signed PDF, and the status changes to **Signed** once Dropbox Sign confirms completion.

---

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router), TypeScript, Tailwind CSS 4 |
| Database, staff auth, file storage | Supabase (Postgres with row-level security, Auth, private Storage bucket) |
| E-signatures | Dropbox Sign API v3 (embedded signing, verified webhooks) |
| Email | Resend |
| PDF generation | pdf-lib with embedded Liberation fonts (SIL OFL) |
| Hosting | Vercel (daily maintenance job via Vercel Cron) |

## Demo mode: try it in two minutes

With no environment variables set, the app runs in **demo mode**:

```bash
npm install
npm run build && npm start      # or: npm run dev
```

Open http://localhost:3000. The demo logins are printed in the server log and saved to `.data/DEMO_LOGIN.txt`. There is one administrator and one sales rep. You can also set `DEMO_ADMIN_PASSWORD` and `DEMO_SALES_PASSWORD` to choose them yourself.

Demo mode keeps its data in `.data/`, which is a local JSON file plus PDFs. It loads three example contracts (John Smith: signed, Sarah Ahmed: sent, Michael Jones: draft) and a **sample template that contains no legal terms**. Everything simulated is labelled clearly:

- A banner on every staff page.
- Emails are not sent. They are logged as "simulated, not sent" and their subjects start with `[DEMO]`.
- Signatures are captured by a built-in signature pad. The PDF is watermarked "DEMO — SIMULATED SIGNATURE", a record page says "not legally binding", and the contract carries a **Demo** badge.

To try the customer side, open a sent contract, click **Copy signing link** and open the link in a private window.

## Production setup

### 1. Supabase

1. Create a project at https://supabase.com. Choose an EU or UK region for UK GDPR.
2. In **SQL Editor**, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). It creates the tables, row-level security policies, the immutability triggers and a private `contracts` storage bucket.
3. In **Authentication → Providers → Email**, turn off **"Allow new users to sign up"**. Staff accounts are created only by administrators.
4. In **Project Settings → API**, copy the Project URL, the `anon` key and the `service_role` key into `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Create the first administrator:
   ```bash
   cp .env.example .env.local   # fill in the Supabase values
   npm run create-admin -- you@theengineers.club "Your Name"
   ```
   The script prints a temporary password. Sign in and change it on the **Account** page. You can add other staff from **Staff** in the dashboard.

### 2. Dropbox Sign

1. Create an account at https://sign.dropbox.com. API access requires an API plan; **test mode is free**.
2. Under **Settings → API**, copy your **API key** into `DROPBOX_SIGN_API_KEY`.
3. Create an **API app**:
   - **Domain**: your production domain, e.g. `contracts.theengineers.club`. Embedded signing only works on this domain. Test mode skips the check, so you can work locally.
   - **Event callback URL**: `https://<your-domain>/api/webhooks/dropbox-sign`.
   - Copy the **Client ID** into `DROPBOX_SIGN_CLIENT_ID`.
4. Keep `DROPBOX_SIGN_TEST_MODE=true` while you test. Test-mode documents are watermarked by Dropbox Sign and are **not legally binding**. Set it to `false` to go live.

### 3. Resend

1. Add and verify your sending domain at https://resend.com/domains (SPF/DKIM DNS records).
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` (for example `The Engineers Club <contracts@theengineers.club>`), `EMAIL_REPLY_TO`, and `BUSINESS_NOTIFICATION_EMAIL`. That last address receives a copy of every signed agreement.

### 4. Secrets

Generate three random values with `openssl rand -base64 48` and set `SESSION_SECRET`, `SIGNING_LINK_SECRET` and `CRON_SECRET`.

> Changing `SIGNING_LINK_SECRET` stops every signing link already sent from working. Use **Resend signing request** to issue new ones.

### 5. Deploy to Vercel

1. Push this repository to GitHub and import it at https://vercel.com/new. The framework is detected automatically.
2. Add every variable from `.env.example` under **Settings → Environment Variables**, and set `APP_URL` to your production URL.
3. Deploy. `vercel.json` schedules `/api/cron/maintenance` to run daily; Vercel sends `CRON_SECRET` automatically.
4. Add your custom domain. It must match the Dropbox Sign API app domain, and Vercel serves it over HTTPS.

Until every required integration is configured (and `DEMO_MODE` is not set), the dashboard shows **"Setup incomplete"** and refuses to send contracts. Nothing is ever simulated in production.

### 6. Upload the master contract template

Sign in as an administrator and open **Template**:

1. Upload the agreement as **Word (.docx)**, `.txt` or `.md`, or paste the text. The wording is imported as written; only the formatting is converted.
2. Replace the customer-specific parts with placeholders. Click a placeholder in the side panel to insert it at the cursor:

   `{{customer_name}}` `{{customer_email}}` `{{customer_phone}}` `{{membership_start_date}}` `{{membership_end_date}}` `{{membership_duration}}` `{{amount_paid}}` `{{currency}}` `{{payment_status}}` `{{outstanding_balance}}` `{{payment_schedule}}` `{{contract_reference}}` `{{contract_date}}` `{{company_name}}` `{{business_name}}` `{{community_url}}`

3. Check the result with **Preview with example data**, then click **Save new version**.

Every save creates a new, immutable version. A contract records the version it was generated from, so later template changes never affect contracts already sent or signed. Unknown placeholders are rejected, and the sample template cannot be used outside demo mode.

**Formatting:** `# Heading`, `## Sub-heading`, `**bold**`, `*italic*`, `- bullet`, `---` divider, and a blank line between paragraphs. A signature page (member name, email, signature and date fields, document reference and template version) is added automatically. It contains no contractual wording.

## How signing works

```
Sales rep ──"Generate & Send"──► PDF generated from template vN, SHA-256 recorded, stored privately
                                 Dropbox Sign embedded signature request created
                                 Branded email (Resend) with /sign/<token> link
Customer  ──opens link─────────► reads full agreement ─► ticks e-sign consent (timestamp, IP, UA logged)
          ──"Sign Contract"────► Dropbox Sign panel: draw / type / upload ─► signs
Dropbox Sign ──webhook─────────► event HMAC verified ─► request re-fetched from the API
                                 is_complete && signer signed ─► status = Signed
                                 final PDF + provider audit trail downloaded, hashed, stored
                                 confirmation email with PDF ─► customer and business
```

- A contract is **never** marked signed because of something the browser reports. The page only shows "finalising". Status changes only after the provider confirms completion through its API.
- Webhooks are authenticated with Dropbox Sign's `event_hash` (an HMAC keyed with your API key). Each event is bound to the stored request ID, and its state is re-fetched from the API rather than trusted from the payload. Processing is idempotent.
- If a webhook is missed, **Refresh status** on the contract page and the daily cron job both reconcile with Dropbox Sign.
- **Audit trail.** The signed PDF includes Dropbox Sign's audit certificate. The app also keeps an append-only audit log covering creation, the document hash, the template version, sends, views, consent (statement, time, IP, user agent), the provider's signer identity and timestamps, the hash of the signed PDF, downloads and staff actions.

## Security and privacy

- **Authentication.** Supabase Auth (server-side, HTTP-only cookies). Accounts must have an active staff profile, and deactivated staff are banned in Supabase Auth too. Login attempts are rate-limited, and there are no client-side password checks.
- **Roles.** Sales reps see and act only on their own contracts. Administrators see everything and manage templates, staff and the audit log. These checks run on the server in every page, API route and server action.
- **Row-level security.** Enabled on every table as defence in depth. With the public anon key, a sales rep can read only their own rows and nothing can be written. The service-role key is used only on the server.
- **Immutability.** Database triggers block any change to a signed contract except finalisation bookkeeping, stop a stored signed PDF from being replaced, and block edits to template versions and audit or email logs. Storage uploads never overwrite.
- **Documents.** Stored in a private Supabase bucket with no public URLs. Files are served only through authorised routes, and their SHA-256 is checked on download.
- **Signing links.** Each link is `contractId.HMAC(secret, contractId:nonce)`, so no secret is stored in the database. Links expire after 30 days by default, and resending rotates the nonce, which revokes old links. `Referrer-Policy: no-referrer` applies on signing pages.
- **API keys.** Server-only; nothing uses `NEXT_PUBLIC_`. HTTPS and HSTS are enforced.
- **UK GDPR.**
  - The daily job deletes unsent drafts after `DRAFT_RETENTION_DAYS` (90).
  - It erases personal data and PDFs from contracts after `RETENTION_YEARS` (7) past the membership end date. The audit skeleton is kept.
  - A privacy notice appears on the signing page.
  - Choose an EU/UK Supabase region, and record Supabase, Dropbox Sign, Resend and Vercel as processors in your privacy policy.

## Project layout

```
src/app/                  pages (login, dashboard, contracts, admin, account, /sign/[token]) and API routes
src/lib/services/         contract lifecycle, templates, audit, demo seed
src/lib/db/               Store interface: Supabase implementation and local demo implementation
src/lib/esign/            Dropbox Sign client (create, sign URL, files, webhook verification)
src/lib/email/            Resend sender and branded email templates
src/lib/pdf.ts            contract PDF generation and demo stamping
src/lib/template.ts       placeholder template engine (shared by preview and PDF)
supabase/migrations/      database schema, RLS, triggers, storage bucket
scripts/create-admin.mjs  bootstrap the first administrator
```

`npm run check` runs the type check and lint.
