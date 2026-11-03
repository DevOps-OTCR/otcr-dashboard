const fs = require('node:fs');
const path = require('node:path');
const ts = require('../backend/node_modules/typescript');

const backendFeature = 'backend/src/agentic-cms/';
const frontendFeature = 'frontend/features/agentic-cms/';
const frontendGate = 'frontend/components/AgenticCmsFeature.tsx';
const aiPackage = /^(?:openai(?:\/|$)|@anthropic-ai\/sdk(?:\/|$)|@modelcontextprotocol\/sdk(?:\/|$)|@langchain\/|langgraph(?:\/|$))/;

function sourceFiles(root, directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return ['node_modules', '.next', 'build', 'dist', 'tests'].includes(entry.name) ? [] : sourceFiles(root, name);
    return /\.[cm]?[jt]sx?$/.test(name) && !/\.spec\.ts$/.test(name) ? [name] : [];
  });
}

function checkBoundaries(root) {
  const errors = [];
  const report = (file, message) => errors.push(`${file}: ${message}`);
  for (const file of [...sourceFiles(root, 'backend/src'), ...sourceFiles(root, 'frontend')]) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const frontend = file.startsWith('frontend/');
    const withinFeature = file.startsWith(frontend ? frontendFeature : backendFeature);
    function checkImport(specifier, dynamic) {
      const text = specifier.text;
      let target;
      if (text.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), text));
      else if (text.startsWith('@/')) target = `${frontend ? 'frontend' : 'backend/src'}/${text.slice(2)}`;
      if (target && `${target}/`.startsWith(frontend ? frontendFeature : backendFeature) && !withinFeature) {
        const allowed = frontend
          ? file === frontendGate && dynamic
          : file === 'backend/src/app.module.ts' && target === 'backend/src/agentic-cms/agentic-cms.module';
        if (!allowed) report(file, 'Import Agentic CMS only through its gated entry point.');
      }
      if (aiPackage.test(text) && (frontend || !withinFeature)) report(file, 'AI/MCP clients belong inside backend/src/agentic-cms/.');
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        checkImport(node.moduleSpecifier, false);
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        checkImport(node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword);
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isIdentifier(node)) {
        if (/^(?:NEXT_PUBLIC_)?(?:LUMEN_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/.test(node.text) && frontend) {
          report(file, 'Model provider secrets must remain on the backend.');
        }
        if (node.text === 'AGENTIC_CMS_ENABLED' && file !== 'backend/src/feature-flags/feature-flags.service.ts') {
          report(file, 'Read the feature flag through FeatureFlagsService; do not create a second switch.');
        }
      }
      if (!frontend && ts.isClassDeclaration(node)) {
        for (const decorator of ts.getDecorators(node) ?? []) {
          const expression = decorator.expression;
          if (!ts.isCallExpression(expression) || expression.expression.getText(source) !== 'Controller') continue;
          const route = expression.arguments[0];
          const literal = route && ts.isStringLiteral(route) ? route.text.replace(/^\/+/, '') : undefined;
          if (withinFeature && (!literal || !/^agentic-cms(?:\/|$)/.test(literal))) report(file, 'Every Agentic CMS controller must use the agentic-cms route prefix.');
          if (!withinFeature && literal && /^agentic-cms(?:\/|$)/i.test(literal)) report(file, 'Agentic CMS controllers belong inside backend/src/agentic-cms/.');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...new Set(errors)];
}

if (require.main === module) {
  const errors = checkBoundaries(path.resolve(__dirname, '..'));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Agentic CMS boundaries passed.');
}
module.exports = { checkBoundaries };
