const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '../..');
const { responseFor } = require('./fixtures.cjs');
const document = '<!doctype html><html><head><title>Navigation browser tests</title><style>body{margin:0;--background:#fff;--foreground:#152033;--primary:#ff5f05;--border:#ccc;--card:#fff}header{position:sticky;top:0;background:white}nav{display:flex;gap:20px}a{color:#152033}button,select{padding:8px}main{padding:24px}svg{width:20px;height:20px}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';

async function startServer() {
  const output = path.join(root, 'build/navigation-browser');
  await new Promise((resolve, reject) => webpack({
    mode: 'development', target: 'web', devtool: false,
    entry: path.join(__dirname, 'entry.tsx'),
    output: { path: output, filename: 'bundle.js' },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.cjs'],
      alias: {
        '@': root,
        'next/navigation$': path.join(__dirname, 'routing.cjs'),
        'next/link$': path.join(output, 'link.cjs'),
        'next/image$': path.join(output, 'image.cjs'),
        '@azure/msal-react$': path.join(__dirname, 'routing.cjs'),
      },
    },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'typescript-loader.cjs') }] },
    plugins: [new webpack.DefinePlugin({
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('/api'),
      'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(''),
      'process.env.NEXT_PUBLIC_MSAL_AUTHORITY': JSON.stringify('https://login.microsoftonline.com/test'),
    })],
  }, (error, stats) => {
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  }));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(responseFor(new URL(req.url, 'http://localhost').pathname.slice(4), 'PM')));
    } else if (req.url === '/bundle.js') {
      res.setHeader('Content-Type', 'text/javascript');
      fs.createReadStream(path.join(output, 'bundle.js')).pipe(res);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(document);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

// Keep generated adapters and bundles outside the committed source tree.
fs.mkdirSync(path.join(root, 'build/navigation-browser'), { recursive: true });
for (const [name, exported] of [['link', 'Link'], ['image', 'Image']]) {
  fs.writeFileSync(path.join(root, `build/navigation-browser/${name}.cjs`),
    `module.exports = require(${JSON.stringify(path.join(__dirname, 'routing.cjs'))}).${exported};`);
}
exports.startServer = startServer;
exports.document = document;
exports.readBundle = () => fs.readFileSync(path.join(root, 'build/navigation-browser/bundle.js'), 'utf8');
if (require.main === module) startServer().then(({ url }) => console.log(url));
