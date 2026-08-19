# strapi-plugin-ai-sdk-public-chat

Anonymous-facing chat for Strapi, split out of [`strapi-plugin-ai-sdk`](https://github.com/PaulBratslavsky/strapi-plugin-ai-sdk) so that untrusted traffic can never reach tools you didn't explicitly hand it.

**Standalone.** It has no dependency on `strapi-plugin-ai-sdk` — its own provider, its own tools, its own guardrails. Install it alone or alongside ai-sdk; they share nothing but the Strapi instance.

## Why this is a separate plugin

Public chat used to be a second controller method inside ai-sdk — `publicChat` alongside `chat`, on one controller, behind one plugin's permission set. Two problems followed from that:

**Ticking the wrong box crossed the boundary.** Granting the Public role `plugin::ai-sdk.controller.chat` gave anonymous visitors the *full* admin toolset, including `createContent`, `uploadMedia`, and `sendEmail`. The endpoint next to it was the safe one; nothing about the checkbox said which was which.

**The tool filter failed open.** `createPublicTools()` selected tools flagged `publicSafe: true`. That put the decision in the tool author's hands, and a tool shipped without the flag set correctly — or a new tool from a third-party plugin — could widen the anonymous surface without anyone editing config. Filtering a growing set is the wrong direction; this plugin owns a fixed, read-only set instead.

Splitting it fixes both structurally rather than by care:

- Its own routes under `/api/ai-sdk-public-chat/`, so there is no adjacent privileged method to mis-grant.
- Its own permission namespace, `plugin::ai-sdk-public-chat.controller.*`, unrelated to ai-sdk's.
- Its **own read-only tools** — search, find-one, list-types. There is no create, update, upload, or send tool here to expose by mistake.
- No shared registry, so a tool added by any other plugin cannot appear on this surface.

## Install

```bash
npm install strapi-plugin-ai-sdk-public-chat
```

```ts
// config/plugins.ts
export default ({ env }) => ({
  'ai-sdk-public-chat': {
    enabled: true,
    config: {
      apiKey: env('ANTHROPIC_API_KEY'),
      chatModel: 'claude-haiku-4-5-20251001',
      allowedContentTypes: ['api::article.article'],
    },
  },
});
```

`allowedContentTypes` is empty by default, which leaves the tools able to
reach nothing. That is deliberate for a surface anyone on the internet can
call.

Then grant the **Public** role (Settings → Users & Permissions → Roles → Public → Ai-sdk-public-chat):

- `chat`
- `serveWidget`

Grant nothing from the **Ai-sdk** section. That plugin's endpoints are for trusted callers.

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `provider` | `anthropic` | `anthropic` or `openai-compatible` (Ollama, vLLM, LM Studio). |
| `apiKey` | — | Provider API key. Some local runtimes need none. |
| `baseURL` | — | Required for `openai-compatible`, e.g. `http://localhost:11434/v1`. |
| `allowedContentTypes` | `[]` | Content type UIDs the tools may query. **Empty means they can reach nothing.** |
| `chatModel` | `claude-haiku-4-5-20251001` | Model id. |
| `systemPrompt` | — | Extra instructions appended to the prompt. |
| `maxConversationMessages` | `10` | History kept per request. |
| `maxSteps` | `2` | Tool-call steps per response. |
| `maxOutputTokens` | — | Output cap. |
| `publicMemoryContentType` | — | Content type UID to inject as background knowledge. Point it at `plugin::ai-sdk.public-memory` to reuse ai-sdk's data. |
| `guardrails` | enabled | Prompt-injection screening. `maxInputLength` defaults to 10,000. |

## Two gates, not one

The tools are read-only by construction — that is the first gate, and it is
not configurable. `allowedContentTypes` is the second: it decides which
content those tools may touch. Empty means they can reach nothing.

A call naming a disallowed content type returns a structured error listing
what *is* available, so the model can correct itself rather than failing the
turn.

## Widget

The embeddable widget ships with this plugin and points at its own endpoint:

```html
<script src="https://your-strapi.example.com/api/ai-sdk-public-chat/widget.js"></script>
```

## Migrating from ai-sdk 1.x

`POST /api/ai-sdk/public-chat` and `/api/ai-sdk/widget.js` are **removed** in ai-sdk 2.0.0. There is no shim — a shim would preserve the shared-controller problem this split exists to remove.

1. Install this plugin.
2. Move `publicChat` config out of `plugin::ai-sdk` and into `plugin::ai-sdk-public-chat`. `allowedContentTypes` carries over as-is. `publicToolSources` has no equivalent — the tools here are fixed and read-only. Set `apiKey` and `chatModel`, since this plugin no longer inherits them.
3. Revoke `publicChat` and `serveWidget` on the Public role under **Ai-sdk**; grant `chat` and `serveWidget` under **Ai-sdk-public-chat**.
4. Update embed URLs from `/api/ai-sdk/widget.js` to `/api/ai-sdk-public-chat/widget.js`.

Check step 3 carefully. If the Public role also holds `plugin::ai-sdk.controller.chat`, revoke it — that grant exposes the full admin toolset to anonymous visitors and is the specific failure this plugin was built to make impossible.

## License

MIT
