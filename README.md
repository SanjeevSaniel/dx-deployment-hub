# Deployment Hub for Pega Constellation DX

Build and publish Pega Constellation custom DX components from one page, without typing CLI commands. It runs inside your Storybook (at `/hub`) or on its own.

## Install

```
npm i -D @sanjeevsaniel/dx-deployment-hub
npx dx-hub init
```

`init` does three things, and is safe to run again:

1. copies `hub.config.sample.json` into your project folder,
2. adds `.dx-hub/` and `hub.config.json` to `.gitignore` (your servers and sign-in secrets stay on your machine),
3. prints the lines to add to `.storybook/main.ts`.

## Use it in Storybook

```ts
// .storybook/main.ts
import { dxHub } from '@sanjeevsaniel/dx-deployment-hub';

const config = {
  // ...
  async viteFinal(config) {
    config.plugins = [...(config.plugins || []), dxHub()];
    return config;
  }
};
export default config;
```

Start Storybook as usual and open `/hub` on its address.

## Use it on its own

```
npx dx-hub
```

Opens on http://localhost:3050/hub (`--port 3060` or `PORT` to change it; a busy port moves to the next one).

It listens on this computer only and answers only to `localhost`, because it can publish to Pega with your saved sign-ins and has no login of its own. `npx dx-hub --host` opens it to your network; do that only on a network you trust.

## Copy the source into your project

Prefer to own the code and change it? Copy the hub's files into your project:

```
npx @sanjeevsaniel/dx-deployment-hub eject
```

That puts the hub's source in `tools/dx-hub/` (give another folder after `eject` to change that, `--force` to overwrite). It also does what `init` does, and prints the one line to add to `.storybook/main.ts` and a `"hub"` script for `package.json`. From then on the files are yours: edit them, commit them, and you do not need this package any more (`npm rm` it if you installed it). Run your copy with `node tools/dx-hub/server.mjs`, or through Storybook.

The hub's two fonts are optional (`npm i -D @fontsource-variable/inter @fontsource-variable/jetbrains-mono`). Without them it uses system fonts.

### Other ways to get the files

- **Download:** every release on the [Releases page](https://github.com/SanjeevSaniel/dx-deployment-hub/releases) has the npm tarball, an install zip, and GitHub's "Source code (zip)".
- **Without installing anything:** `npx degit SanjeevSaniel/dx-deployment-hub/src tools/dx-hub` fetches just the hub's source into `tools/dx-hub/`. (Then copy `hub.config.sample.json` yourself and add `.dx-hub/` and `hub.config.json` to `.gitignore`.)

## Set your servers

Copy `hub.config.sample.json` to `hub.config.json` and list your servers, rulesets and versions. Save it and the page updates by itself. A client secret can be written as `env:NAME` to read it from an environment variable.

## What it needs

- Node 20 or newer.
- A project that already has `@pega/custom-dx-components` installed, with components under `src/components` and a `tasks.config.json`. The hub drives that CLI.
- Storybook with Vite (`@storybook/react-vite`) for the `/hub` page inside Storybook. Not needed for `npx dx-hub`.

## Where things are kept

Everything the hub saves is in `.dx-hub/` in your project (environments, connections with their secrets, sign-in state, publish history). It is never written into `node_modules`, so reinstalling or upgrading the package keeps it. Never commit that folder.

Set `DX_HUB_ROOT` to run the hub against a project folder other than the current one.

Built by Sanjeev Kujur. An independent tool, not affiliated with or endorsed by Pegasystems; Pega and Constellation are their trademarks, used here only to say what it works with.

## Develop the package

```
npm test
npm pack
```

## Shorter component names

Component folders often share a team prefix (`Acme_Team_ServerPaginatedTable`). The page drops it for display and spaces the words (`Server Paginated Table`). It uses `"namePrefix"` from `hub.config.json` if you set one, otherwise the prefix all your components share. The real folder name is always what is built and sent.

## Status

Early release (0.x). The install, the setup and copy commands, the standalone page and the page inside Storybook 10 have been run for real. A real publish to a Pega server has not been checked yet, so try it on a development server first. Issues and feedback are welcome.
