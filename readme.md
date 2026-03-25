# qlik-embed-auto-objects

**@qlik/embed chart explorer** — a small demo for loading a Qlik Cloud app, listing sheets and objects, and rendering the same assets side by side across multiple [@qlik/embed](https://www.npmjs.com/package/@qlik/embed) UI types so you can compare behavior and options.

## What it does

- **Auto-provisioned users**: Each browser session gets a synthetic Qlik Cloud user (OAuth M2M impersonation). No manual sign-in; open the app and the server creates or reuses a tenant user for that session.
- **Embed comparison**: Renders the selected charts or sheets in parallel sections for:
  - `classic/app`
  - `analytics/sheet`
  - `classic/chart`
  - `analytics/chart`
  - `analytics/field`
  - `analytics/selections`
- **Per-object configuration**: Theme, language (where supported), identity bumps, preview and interaction flags for analytics embeds, iframe mode for classic chart — adjustable from the configuration panel.
- **Tenant themes**: Fetches available themes from the tenant (with built-in fallbacks) for the theme picker.
- **Shareable state**: Selections and settings can be reflected in the URL for quick reproduction.

## Stack

- Node.js (ES modules), Express, `express-session`, Helmet  
- [@qlik/api](https://www.npmjs.com/package/@qlik/api) for OAuth tokens, user provisioning, app session (sheets), and themes  

## Setup

1. Create a Qlik OAuth client:
   - Client type: `Web`
   - Scopes: `user_default`, `admin_classic`
   - Allowed origin: your app URL (for local use: `http://localhost:3000`)
   - Enable M2M and M2M user impersonation
   - Set consent method to `trusted`
2. Copy `template.env` to `.env` and set:
   - `clientId`
   - `clientSecret`
   - `host` (for example: `https://tenant.us.qlikcloud.com`)
   - `appId`
   - `sessionSecret` (a long random string for Express sessions)

Optional: set `PORT` if you do not want the default `3000`.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`. The first load provisions the synthetic user and embed configuration; use the side panels to filter assets, select objects, and tune embed settings.

## Notes

- This is a **demo utility**, not a production-ready app.
- For production guidance on impersonation, see [Guiding principles: OAuth impersonation](https://qlik.dev/authenticate/oauth/guiding-principles-oauth-impersonation/).
