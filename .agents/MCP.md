# MCP servers

`.agents/mcp.json` holds the shared JSON configuration. Claude Code reads it through the root `.mcp.json` symlink. `.agents/mcp.json` is a repository convention, not an MCP discovery standard.

Antigravity uses `.agents/mcp_config.json`, Codex uses `.codex/config.toml`, Gemini CLI uses `.gemini/settings.json`, and Cursor uses `.cursor/mcp.json`. When a server changes, update every file that lists it. PostHog is pinned to project 707944. Cloudflare, Neon, and Expo (`https://mcp.expo.dev/mcp`) use the account each user authorizes through OAuth. Each user must authenticate with their own account. LeanSpec is local: each client starts it with `pnpm exec leanspec-mcp` from the repo root, and it needs no account.

Claude Code may ask you to approve the project server before signing in. Codex loads project configuration in trusted projects. Gemini CLI discovers OAuth when it connects; use `/mcp auth posthog` if sign-in is needed. Antigravity offers authentication under Settings > Customizations. Restart the client after changing configuration.

Other clients may use different configuration paths and authentication. Add their supported configuration when needed; do not put credentials in this repository.
