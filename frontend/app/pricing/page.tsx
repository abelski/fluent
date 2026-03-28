import type { Metadata } from 'next';
import PricingClient from './PricingClient';

export const metadata: Metadata = {
  title: 'Pricing — Free and Premium Plans',
  description: 'Fluent is free to use. Upgrade to Premium for unlimited daily sessions, all practice tests, and priority access to new Lithuanian materials.',
  openGraph: {
    title: 'Pricing — Fluent Lithuanian Learning',
    description: 'Free and premium plans for learning Lithuanian. Unlimited sessions with Premium.',
    url: 'https://fluent.lt/pricing/',
    images: [
      { url: '/og-default-en.svg', width: 1200, height: 630, alt: 'Fluent Pricing' },
      { url: '/og-default-ru.svg', width: 1200, height: 630, alt: 'Fluent Цены' },
    ],
  },
  alternates: {
    canonical: 'https://fluent.lt/pricing/',
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
