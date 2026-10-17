// Replace only the Next router in this browser fixture. Pages and navbar are real.
const React = require('react');
const listeners = new Set();
function navigate(path) {
  history.pushState({}, '', path);
  listeners.forEach(listener => listener());
}
function replace(path) {
  history.replaceState({}, '', path);
  listeners.forEach(listener => listener());
}
if (typeof window !== 'undefined') window.addEventListener('popstate', () => listeners.forEach(listener => listener()));
exports.usePathname = () => React.useSyncExternalStore(
  listener => { listeners.add(listener); return () => listeners.delete(listener); },
  () => location.pathname,
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
