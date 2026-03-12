# @qlik/embed chart explorer

This project is a Qlik embed comparison tool for validating and comparing UI behavior across embed types (`classic/app`, `analytics/sheet`, `classic/chart`, `analytics/chart`, plus field and selections components).

It uses OAuth M2M impersonation and a simple email-based demo login.

## Setup

1. Create a Qlik OAuth client:
   - Client type: `Web`
   - Scopes: `user_default`, `admin_classic`
   - Allowed origin: your app URL (for local use: `http://localhost:3000`)
   - Enable M2M and M2M user impersonation
   - Set consent method to `trusted`
2. Create `.env` from `template.env` and set:
   - `clientId`
   - `clientSecret`
   - `host` (for example: `https://tenant.us.qlikcloud.com`)
   - `appId`
   - `sessionSecret` (a long random string for Express sessions)

## Run

Use:

```bash
npm start
```

Open `http://localhost:3000`, sign in with an email, and use the side panel to select and configure embeds.

## Notes

- This is a demo utility, not a production-ready app.
- For production guidance on impersonation, see:
  - https://qlik.dev/authenticate/oauth/guiding-principles-oauth-impersonation/
