import { Activity, History, Layers } from 'lucide-react';

export const PAGES = [
  {
    key: 'overview',
    label: 'Overview',
    Icon: Activity,
    title: 'Live overview',
    subtitle: 'The optical waveform, device vitals, and the latest experimental estimate.',
  },
  {
    key: 'sessions',
    label: 'Sessions',
    Icon: History,
    title: 'Capture sessions',
    subtitle: 'Every capture in this session: its quality checks, result, and raw data.',
  },
  {
    key: 'model',
    label: 'Model & evidence',
    Icon: Layers,
    title: 'Model & evidence',
    subtitle: 'How the network was trained and evaluated, and what the results do and don’t show.',
  },
];

export const pageInfo = (key) => PAGES.find((page) => page.key === key);
