// Content-API routes only. This plugin has no admin surface by design: the
// whole point is that its endpoints are reachable by anonymous visitors and
// carry a permission namespace of their own
// (plugin::ai-sdk-public-chat.controller.*), so granting it can never widen
// what an admin-facing route exposes.
export default {
  'content-api': {
    type: 'content-api',
    routes: [
      {
        method: 'POST',
        path: '/chat',
        handler: 'controller.chat',
        config: {
          policies: [],
          // Reuse ai-sdk's guardrail middleware rather than duplicating the
          // pattern set. This route is the lowest-trust surface in the whole
          // system — anonymous, unauthenticated input reaching a model with
          // tools — so it is exactly where prompt-injection screening matters
          // most. Moving public chat into its own plugin must not move it out
          // from under those checks.
          middlewares: ['plugin::ai-sdk.guardrail'],
        },
      },
      {
        method: 'POST',
        path: '/ask',
        handler: 'controller.ask',
        config: { policies: [], middlewares: ['plugin::ai-sdk.guardrail'] },
      },
      {
        method: 'POST',
        path: '/ask-stream',
        handler: 'controller.askStream',
        config: { policies: [], middlewares: ['plugin::ai-sdk.guardrail'] },
      },
      {
        method: 'GET',
        path: '/widget.js',
        handler: 'controller.serveWidget',
        config: { policies: [] },
      },
    ],
  },
};
