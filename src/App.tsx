import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LangProvider } from './lib/LangProvider';
import Home from './pages/Home';
import { lazyPage } from './lib/lazyPage';

const DocsIndex = lazyPage(() => import('./pages/DocsIndex'));
const DocPage = lazyPage(() => import('./pages/DocPage'));
const Classes = lazyPage(() => import('./pages/Classes'));
const Calculator = lazyPage(() => import('./pages/Calculator'));
const Compare = lazyPage(() => import('./pages/Compare'));
const Market = lazyPage(() => import('./pages/Market'));
const Cases = lazyPage(() => import('./pages/Cases'));
const Timeline = lazyPage(() => import('./pages/Timeline'));
const Commands = lazyPage(() => import('./pages/Commands'));
const Api = lazyPage(() => import('./pages/Api'));
const Ecosystem = lazyPage(() => import('./pages/Ecosystem'));
const Quiz = lazyPage(() => import('./pages/Quiz'));
const NotFound = lazyPage(() => import('./pages/NotFound'));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="docs" element={<DocsIndex />} />
        <Route path="docs/:slug" element={<DocPage />} />
        <Route path="classes" element={<Classes />} />
        <Route path="calculator" element={<Calculator />} />
        <Route path="compare" element={<Compare />} />
        <Route path="market" element={<Market />} />
        <Route path="cases" element={<Cases />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="commands" element={<Commands />} />
        <Route path="api" element={<Api />} />
        <Route path="ecosystem" element={<Ecosystem />} />
        <Route path="quiz" element={<Quiz />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <LangProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </LangProvider>
  );
}
