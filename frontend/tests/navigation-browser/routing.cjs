// Replace only the Next router in this browser fixture. Pages and navbar are real.
const React = require('react');
const listeners = new Set();
function navigate(path) {
  history.pushState({}, '', path);
  listeners.forEach(listener => listener());
}
exports.usePathname = () => React.useSyncExternalStore(
  listener => { listeners.add(listener); return () => listeners.delete(listener); },
  () => location.pathname + location.search,
);
exports.useSearchParams = () => {
  exports.usePathname();
  return new URLSearchParams(location.search);
};
exports.useRouter = () => React.useMemo(() => ({ push: navigate, replace: navigate }), []);
exports.navigate = navigate;
exports.Link = ({ href, children, ...props }) => React.createElement('a', {
  ...props, href, onClick: event => { event.preventDefault(); navigate(href); },
}, children);
exports.Image = ({ priority, ...props }) => React.createElement('img', props);
exports.MsalContext = React.createContext(null);
exports.useMsal = () => React.useContext(exports.MsalContext);
