// Replace only the Next router in this browser fixture. Pages and navbar are real.
const React = require('react');
const listeners = new Set();
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
const withBasePath = path => basePath && !path.startsWith(basePath + '/') ? basePath + path : path;
function navigate(path) {
  history.pushState({}, '', withBasePath(path));
  listeners.forEach(listener => listener());
}
function replace(path) {
  history.replaceState({}, '', withBasePath(path));
  listeners.forEach(listener => listener());
}
if (typeof window !== 'undefined') window.addEventListener('popstate', () => listeners.forEach(listener => listener()));
exports.usePathname = () => React.useSyncExternalStore(
  listener => { listeners.add(listener); return () => listeners.delete(listener); },
  () => (basePath && location.pathname.startsWith(basePath + '/') ? location.pathname.slice(basePath.length) : location.pathname),
);
exports.useSearchParams = () => {
  const search = React.useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => location.search,
  );
  return new URLSearchParams(search);
};
exports.useRouter = () => React.useMemo(() => ({ push: navigate, replace }), []);
exports.navigate = navigate;
exports.Link = ({ href, children, ...props }) => React.createElement('a', {
  ...props, href, onClick: event => { event.preventDefault(); navigate(href); },
}, children);
exports.Image = ({ priority, ...props }) => React.createElement('img', props);
exports.MsalContext = React.createContext(null);
exports.useMsal = () => React.useContext(exports.MsalContext);
