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
          // This plugin's own guardrail, not ai-sdk's. Every route here is
          // anonymous — no session, no token, no role beyond Public — which
          // makes this the surface prompt-injection screening exists for.
          // Owning it keeps the plugin standalone and lets its pattern set and
          // length cap be tuned for untrusted input independently of ai-sdk's.
          middlewares: ['plugin::ai-sdk-public-chat.guardrail'],
        },
      },
      {
        method: 'POST',
        path: '/ask',
        handler: 'controller.ask',
        config: { policies: [], middlewares: ['plugin::ai-sdk-public-chat.guardrail'] },
      },
      {
        method: 'POST',
        path: '/ask-stream',
        handler: 'controller.askStream',
        config: { policies: [], middlewares: ['plugin::ai-sdk-public-chat.guardrail'] },
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
