# qlik-embed-auto-objects

This app connects to a single Qlik Sense app, and generates several embedded objects for each object in the app. This also demos OAuth Machine-to-Machine impersonation to support custom login providers and portals.

To login, enter any email address. A new user will be created in your tenant for that email address, if one doesn't already exist.

For each object in the specified Qlik Sense app, this app will generates:

- classic/app: the legacy whole-sheet embed, which provides good support for the native Qlik Sense experience
- analytics/sheet: the more modern, nebula sheet embed, which provides little of the native experience but is more performant and customizable than classic/app
- classic/chart: the legacy chart object embed, similar to classic/app
- analytics/chart: the more modern, nebula chart embed, similar to analytics/sheet

## Considerations for production usage

You should not use this example as-is. Before deploying:

- Ensure you understand all the considerations for using OAuth M2M impersonation at: https://qlik.dev/authenticate/oauth/guiding-principles-oauth-impersonation/
- You should secure the login page to handle auth via your auth provider. Do not leave this as an open access page.
- Don't load all objects dynamically from an app without paging. Your users will not enjoy it.

## Configuration

To configure this:

1. Create an OAuth client in your tenant with the following properties:
  - Client type: `Web`
  - Scopes: `user_default` and `admin_classic`
  - Allowed origins: path to your web app (by default localhost:3000)
  - Allow Machine-to-Machine (M2M): `checked`
  - Allow M2M user impersonation" `checked`
  - Once the client is created, change the consent method to `trusted`
2. Add the relevant secrets to a `.env` file in the root (there is a template you can copy in `template.env`):
  - `clientId`: the OAuth client ID for the client created in step 1
  - `clientSecret`: the OAuth client secret for the client created in step 1
  - `host`: the URL to the Qlik Cloud tenant hosting your app and OAuth client. In the format `https://tenant.us.qlikcloud.com`
  - `appId`: the ID of the source Qlik Sense app
3. Run with `npm run start`

Once you run the app, you will be prompted to enter an email address. Once submitted, the user will be returned (after being created if it doesn't yet exist), and you will be redirected to the home page. This page will display all of the objects in your app, multiple times per the object type definitions above.
