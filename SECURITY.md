# Security

The Deployment Hub can publish to a Pega server with the sign-ins you save in it. Treat it like any tool that holds credentials.

## What it does to protect you

- It listens on `127.0.0.1` only and answers only to `localhost`. `--host` opens it to your network on purpose, and it prints a warning when you do.
- A client secret is written to `.dx-hub/` in your project and is never sent back to the page. A secret can also be read from an environment variable (`env:NAME`).
- It has no login of its own. Anyone who can reach it can publish. Do not expose it to a network you do not trust.

## Keep your own files out of Git

Run `npx dx-hub init`. It adds `.dx-hub/` and `hub.config.json` to your `.gitignore`.

## Reporting a problem

Please report a vulnerability privately, using GitHub's "Report a vulnerability" on the Security tab of this repository, and not in a public issue. Include what you did, what happened and which version you used.

This is a small personal project, so replies are best effort.
