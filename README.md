# strapi-plugin-ai-sdk-public-chat

Anonymous-facing chat for Strapi, split out of [`strapi-plugin-ai-sdk`](https://github.com/PaulBratslavsky/strapi-plugin-ai-sdk) so that untrusted traffic can never reach tools you didn't explicitly hand it.

Requires `strapi-plugin-ai-sdk@^2.0.0`, which supplies the model provider and the tool implementations.

## Why this is a separate plugin

Public chat used to be a second controller method inside ai-sdk — `publicChat` alongside `chat`, on one controller, behind one plugin's permission set. Two problems followed from that:

**Ticking the wrong box crossed the boundary.** Granting the Public role `plugin::ai-sdk.controller.chat` gave anonymous visitors the *full* admin toolset, including `createContent`, `uploadMedia`, and `sendEmail`. The endpoint next to it was the safe one; nothing about the checkbox said which was which.

**The tool filter failed open.** `createPublicTools()` selected tools flagged `publicSafe: true`. That put the decision in the tool author's hands, and a tool shipped without the flag set correctly — or a new tool from a third-party plugin — could widen the anonymous surface without anyone editing config.

Splitting it fixes both structurally rather than by care:

- Its own routes under `/api/ai-sdk-public-chat/`, so there is no adjacent privileged method to mis-grant.
- Its own permission namespace, `plugin::ai-sdk-public-chat.controller.*`, unrelated to ai-sdk's.
- An explicit tool **allow-list that defaults to empty**. Nothing is exposed unless you name it, so adding tools elsewhere can't reach this surface.

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
      allowedTools: ['searchContent', 'findOneContent'],
      allowedContentTypes: ['api::article.article'],
    },
  },
});
```

Then grant the **Public** role (Settings → Users & Permissions → Roles → Public → Ai-sdk-public-chat):

- `chat`
- `serveWidget`

Grant nothing from the **Ai-sdk** section. That plugin's endpoints are for trusted callers.

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `allowedTools` | `[]` | Tool names from ai-sdk's registry this chat may use. **Empty means no tools.** |
| `allowedContentTypes` | `[]` | Content type UIDs the content tools may query. Empty makes them useless rather than unrestricted. |
| `chatModel` | inherits ai-sdk | Model id. Set to use a cheaper model for public traffic. |
| `systemPrompt` | — | Extra instructions appended to the prompt. |
| `maxConversationMessages` | `10` | History kept per request. |
| `maxSteps` | `2` | Tool-call steps per response. |
| `maxOutputTokens` | inherits ai-sdk | Output cap. |
| `includePublicMemories` | `true` | Inject `plugin::ai-sdk.public-memory` documents into the prompt. |

Tool names are the registry names, so contributed plugin tools use their namespaced form:

```ts
allowedTools: [
  'searchContent',
  'ai_sdk_yt_transcripts__search_transcript',
]
```

A name that isn't registered logs a warning at request time and is skipped, rather than failing the request.

## Two gates, not one

`allowedTools` decides which tools exist. `allowedContentTypes` independently decides which content they may touch — so allowing `searchContent` does not expose every content type in the project. A call naming a disallowed type comes back as a structured error listing what *is* available, which the model can act on.

## Widget

The embeddable widget ships with this plugin and points at its own endpoint:

```html
<script src="https://your-strapi.example.com/api/ai-sdk-public-chat/widget.js"></script>
```

## Migrating from ai-sdk 1.x

`POST /api/ai-sdk/public-chat` and `/api/ai-sdk/widget.js` are **removed** in ai-sdk 2.0.0. There is no shim — a shim would preserve the shared-controller problem this split exists to remove.

1. Install this plugin.
2. Move `publicChat` config out of `plugin::ai-sdk` and into `plugin::ai-sdk-public-chat`. `allowedContentTypes` carries over as-is. `publicToolSources` has no equivalent: name the individual tools in `allowedTools` instead.
3. Revoke `publicChat` and `serveWidget` on the Public role under **Ai-sdk**; grant `chat` and `serveWidget` under **Ai-sdk-public-chat**.
4. Update embed URLs from `/api/ai-sdk/widget.js` to `/api/ai-sdk-public-chat/widget.js`.

Check step 3 carefully. If the Public role also holds `plugin::ai-sdk.controller.chat`, revoke it — that grant exposes the full admin toolset to anonymous visitors and is the specific failure this plugin was built to make impossible.

## License

MIT
