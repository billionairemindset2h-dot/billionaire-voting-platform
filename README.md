# Billionaire Mindset Events

Static public site for event discovery, contestant registration, and voting. It is hosted from the repository root with GitHub Pages. Supabase provides the event data, authentication, storage, and payment Edge Functions; Paystack handles checkout; Resend sends paid registration notifications to the event team.

## Pages

- `index.html` — home page and existing event, vote, registration, and payment-return flow. Keep this path stable because payment returns are handled here.
- `about.html` — about the events and participation.
- `faq.html` — support information and contact email.
- `admin.html` — authenticated event administration.

## Installing on a phone

The public site is configured as an installable web app, with an **Install app** button on the home page. Android users can tap it to open their browser's install prompt. On iPhone, the button shows the steps: open the site in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App**, then tap **Add**. The installed app still needs an internet connection for live events, voting, registration, and payments. When offline, it shows a page explaining that connection is required.

## Deploying the site

The Pages source is the `main` branch, `/ (root)`. Commit and push site files to `main`; GitHub Pages publishes them from the repository root. The public URL before the custom-domain switch is `https://billionairemindset2h-dot.github.io/billionaire-voting-platform/`.

## Connecting `destinationsghana.com`

Connect the domain only after confirming the GitHub Pages build is healthy. In GitHub repository **Settings → Pages**, enter `destinationsghana.com` under **Custom domain** and enable **Enforce HTTPS** after DNS validation completes. GitHub will add/update the root `CNAME` file in this branch.

In Wix DNS, change only the website records:

- Remove the Wix apex `A` records and add GitHub Pages `A` records for host `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`.
- Change the `www` CNAME from `cdn3.wixdns.net` to `billionairemindset2h-dot.github.io`.
- Preserve mail and domain-verification records, especially all records under `notify.destinationsghana.com`, the Google verification TXT, and any SPF/DKIM records.

DNS changes may take time to propagate. Validate both the apex domain and `www` once GitHub Pages reports the custom domain as ready.

## Backend source status

`supabase/functions/initialize-registration-payment/index.ts` and `supabase/functions/verify-paystack-payment/index.ts` contain the reviewed sources for registration payment initialization and verification, including contestant photo storage and the Resend registration email. Three other deployed functions still have no source in this repository. Do not overwrite those functions until their deployed source has been retrieved and reviewed. Store all payment and email credentials in Supabase Edge Function Secrets; never put secret keys in browser code.

The `supabase/migrations/` directory is a local record of database changes associated with event visibility, contestant photo storage, and registration payment/email status. Confirm the live schema and policies in Supabase before applying migrations to another project.
