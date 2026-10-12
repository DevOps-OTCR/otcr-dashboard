const fs = require('node:fs');
const path = require('node:path');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '../..');
exports.document = '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>';

// Bundle the real pages, navbar, and auth provider. Only routing and MSAL are mocked.
exports.buildBundle = async () => {
  const output = path.join(root, 'build/navigation-browser');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'loader.cjs'), `const ts = require('typescript'); module.exports = function(source) {
    return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: {
      target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
  };`);
  for (const [name, exported] of [['link', 'Link'], ['image', 'Image']]) {
    fs.writeFileSync(path.join(output, `${name}.cjs`),
      `module.exports = require(${JSON.stringify(path.join(__dirname, 'routing.cjs'))}).${exported};`);
  }
  fs.writeFileSync(path.join(output, 'empty.cjs'), 'module.exports = () => \'\';');
  fs.writeFileSync(path.join(output, 'fonts.cjs'), 'exports.Mulish = exports.Be_Vietnam_Pro = () => ({ className: \'test-font\' });');
  await new Promise((resolve, reject) => webpack({
    mode: 'development', target: 'web', devtool: false,
    entry: path.join(__dirname, 'entry.tsx'),
    output: { path: output, filename: 'bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.cjs'], alias: {
      '@': root, 'next/navigation$': path.join(__dirname, 'routing.cjs'),
      'next/link$': path.join(output, 'link.cjs'), 'next/image$': path.join(output, 'image.cjs'),
      'next/font/google$': path.join(output, 'fonts.cjs'),
      '@azure/msal-react$': path.join(__dirname, 'routing.cjs'),
    } },
    module: { rules: [{ test: /\.css$/, use: path.join(output, 'empty.cjs') }, { test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] },
    plugins: [new webpack.DefinePlugin({
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('/api'),
      'process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL': JSON.stringify(''),
      'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(''),
      'process.env.NEXT_PUBLIC_MSAL_AUTHORITY': JSON.stringify('https://login.microsoftonline.com/test'),
    })],
  }, (error, stats) => error || stats.hasErrors()
    ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  return fs.readFileSync(path.join(output, 'bundle.js'), 'utf8');
};
