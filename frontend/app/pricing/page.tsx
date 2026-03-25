import type { Metadata } from 'next';
import PricingClient from './PricingClient';

export const metadata: Metadata = {
  title: 'Pricing — Free and Premium Plans',
  description: 'Fluent is free to use. Upgrade to Premium for unlimited daily sessions, all practice tests, and priority access to new Lithuanian materials.',
  openGraph: {
    title: 'Pricing — Fluent Lithuanian Learning',
    description: 'Free and premium plans for learning Lithuanian. Unlimited sessions with Premium.',
    url: 'https://fluent.lt/pricing',
  },
  alternates: {
    canonical: 'https://fluent.lt/pricing',
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
