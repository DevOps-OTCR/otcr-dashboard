const ts = require('typescript');
module.exports = function (source) {
  return ts.transpileModule(source, {
    fileName: this.resourcePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2021,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
};
