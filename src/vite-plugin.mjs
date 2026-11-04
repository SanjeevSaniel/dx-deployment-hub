// The Deployment Hub inside Storybook's dev server: the same page, assets and API as server.mjs, added as middleware.
import { PAGE_PATHS, handleDxApiRequest, serveHubAsset, serveHubPage } from './api/index.mjs';

export function dxDeploymentVitePlugin() {
  return {
    name: 'dx-deployment-vite-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';

        if (PAGE_PATHS.includes(url)) return serveHubPage(res);
        if (req.method === 'GET' && serveHubAsset(url, res)) return;

        // The API: /api/dx/* or /api/*
        if (url.startsWith('/api/') && (await handleDxApiRequest(req, res))) return;

        next();
      });
    }
  };
}

/** The name to import: dxHub(). dxDeploymentVitePlugin is the same function under its earlier name. */
export const dxHub = dxDeploymentVitePlugin;
