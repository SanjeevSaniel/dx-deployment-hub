# Install the Deployment Hub from this zip

You need Node 20 or newer, and a Pega Constellation DX components project (one that already has `@pega/custom-dx-components`).

1. Unzip this file and copy `sanjeevsaniel-dx-deployment-hub-0.1.1.tgz` into your project folder.
2. In the project folder, run:

   ```
   npm i -D ./sanjeevsaniel-dx-deployment-hub-0.1.1.tgz
   npx dx-hub init
   ```

3. Follow what `init` prints: it adds the hub to your Storybook config (three lines) and keeps your server details out of git.
4. Copy `hub.config.sample.json` to `hub.config.json` and fill in your own servers, rulesets and versions.
5. Start Storybook and open `/hub`, or run `npx dx-hub` for the hub on its own at http://localhost:3050/hub.

The hub listens on your computer only. It can publish to Pega with your saved sign-ins and has no login of its own, so do not open it to a network you do not trust.

To update, install the newer `.tgz` the same way. Your settings are kept in `.dx-hub/` in your project and are not touched.

Built by Sanjeev Kujur. MIT licensed. An independent tool, not affiliated with Pegasystems.
