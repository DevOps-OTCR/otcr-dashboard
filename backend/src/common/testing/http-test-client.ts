import { INestApplication } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Duplex } from 'node:stream';

export interface HttpTestClient {
  baseUrl: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

// CI retains real loopback HTTP by default. Restricted local environments can
// exercise the same Nest/Express routing, guards and JSON middleware in process.
export async function createHttpTestClient(app: INestApplication): Promise<HttpTestClient> {
  if (process.env.CMS_TEST_IN_PROCESS !== '1') {
    await app.listen(0, '127.0.0.1');
    return { baseUrl: await app.getUrl(), fetch };
  }
  await app.init();
  return {
    baseUrl: 'http://in-process.test',
    fetch: (url, init = {}) => new Promise((resolve, reject) => {
      if (init.body !== undefined && typeof init.body !== 'string') {
        reject(new Error('In-process tests support string request bodies only')); return;
      }
      const output: Buffer[] = [];
      const socket = new Duplex({
        read() {},
        write(chunk, _encoding, callback) { output.push(Buffer.from(chunk)); callback(); },
      });
      const req = new IncomingMessage(socket as Socket);
      const target = new URL(url);
      req.url = target.pathname + target.search;
      req.method = init.method ?? 'GET';
      req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
      req.headers = Object.fromEntries(new Headers(init.headers).entries());
      req.headers.host = target.host;
      const body = Buffer.from((init.body as string | undefined) ?? '');
      if (init.body !== undefined) req.headers['content-length'] = String(body.length);
      const res = new ServerResponse(req);
      res.assignSocket(socket as Socket);
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('In-process HTTP request timed out')); }, 2000);
      res.on('error', error => { clearTimeout(timer); socket.destroy(); reject(error); });
      res.on('finish', () => {
        clearTimeout(timer);
        try {
          if (res.getHeader('transfer-encoding')) throw new Error('Use loopback mode for streaming responses');
          const wire = Buffer.concat(output);
          const separator = wire.indexOf('\r\n\r\n');
          if (separator < 0) throw new Error('Missing HTTP response headers');
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.getHeaders())) {
            if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
          }
          const payload = wire.subarray(separator + 4).toString('utf8');
          resolve(new Response([204, 304].includes(res.statusCode) ? null : payload, { status: res.statusCode, headers }));
        } catch (error) { reject(error); }
        finally { socket.destroy(); }
      });
      app.getHttpAdapter().getInstance()(req, res);
      if (body.length) req.push(body);
      // Node marks this when the HTTP parser has received the entire message.
      // Without it IncomingMessage treats the synthetic stream as aborted.
      req.complete = true;
      req.push(null);
    }),
  };
}
