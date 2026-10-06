import { Activity, History, Layers } from 'lucide-react';

export const PAGES = [
  {
    key: 'overview',
    label: 'Overview',
    Icon: Activity,
    title: 'Signals into insight.',
    subtitle: 'A closer look at the connection between hardware, data, and machine learning.',
  },
  {
    key: 'sessions',
    label: 'Sessions',
    Icon: History,
    title: 'Every capture, in context.',
    subtitle: 'Review this session’s captures, inspect quality, and take your data with you.',
  },
  {
    key: 'model',
    label: 'Model & evidence',
    Icon: Layers,
    title: 'A model you can inspect.',
    subtitle: 'Reproducible training. Transparent evaluation. Clear limits.',
  },
];

export const pageInfo = (key) => PAGES.find((page) => page.key === key);
