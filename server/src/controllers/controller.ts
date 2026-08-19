import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';
import { Readable, PassThrough } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';

function svc(strapi: Core.Strapi) {
  return strapi.plugin('ai-sdk-public-chat').service('service');
}

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async ask(ctx: Context) {
    const { prompt, system } = (ctx.request.body ?? {}) as { prompt?: string; system?: string };

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      ctx.badRequest('prompt must be a non-empty string');
      return;
    }

    try {
      const text = await svc(strapi).ask(prompt, { system });
      ctx.body = { data: { text } };
    } catch (error) {
      strapi.log.error('[ai-sdk-public-chat] ask failed:', error);
      ctx.internalServerError('Generation is unavailable.');
    }
  },

  async askStream(ctx: Context) {
    const { prompt, system } = (ctx.request.body ?? {}) as { prompt?: string; system?: string };

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      ctx.badRequest('prompt must be a non-empty string');
      return;
    }

    let textStream: AsyncIterable<string>;
    try {
      textStream = await svc(strapi).askStream(prompt, { system });
    } catch (error) {
      strapi.log.error('[ai-sdk-public-chat] ask-stream failed:', error);
      ctx.internalServerError('Generation is unavailable.');
      return;
    }

    ctx.status = 200;
    ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
    ctx.set('Cache-Control', 'no-cache, no-transform');
    ctx.set('Connection', 'keep-alive');
    ctx.set('X-Accel-Buffering', 'no');

    const stream = new PassThrough();
    ctx.body = stream;

    (async () => {
      try {
        for await (const chunk of textStream) {
          stream.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }
        stream.write('data: [DONE]\n\n');
      } catch (error) {
        strapi.log.error('[ai-sdk-public-chat] stream error:', error);
        stream.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
      } finally {
        stream.end();
      }
    })();
  },

  async chat(ctx: Context) {
    const messages = (ctx.request.body as any)?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      ctx.badRequest('messages must be a non-empty array');
      return;
    }

    const service = strapi.plugin('ai-sdk-public-chat').service('service');

    let result;
    try {
      result = await service.chat(messages);
    } catch (error) {
      strapi.log.error('[ai-sdk-public-chat] chat failed:', error);
      ctx.internalServerError('Chat is unavailable.');
      return;
    }

    const response = result.toUIMessageStreamResponse();

    ctx.status = 200;
    ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
    ctx.set('Cache-Control', 'no-cache, no-transform');
    ctx.set('Connection', 'keep-alive');
    ctx.set('X-Accel-Buffering', 'no');
    ctx.set('x-vercel-ai-ui-message-stream', 'v1');

    ctx.body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  },

  async serveWidget(ctx: Context) {
    const pluginRoot = path.resolve(__dirname, '..', '..');
    const widgetPath = path.join(pluginRoot, 'dist', 'widget', 'widget.js');

    if (!fs.existsSync(widgetPath)) {
      ctx.status = 404;
      ctx.type = 'application/javascript';
      ctx.body = '// Widget not built. Run: npm run build:widget';
      return;
    }

    if (!(controller as any)._widgetCache) {
      try {
        (controller as any)._widgetCache = fs.readFileSync(widgetPath, 'utf-8');
      } catch (error) {
        strapi.log.error('[ai-sdk-public-chat] Failed to read widget:', error);
        ctx.status = 500;
        ctx.type = 'application/javascript';
        ctx.body = '// Error loading widget';
        return;
      }
    }

    ctx.type = 'application/javascript';
    ctx.set('Cache-Control', 'public, max-age=3600');
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.body = (controller as any)._widgetCache;
  },
});

export default controller;
