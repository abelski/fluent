import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Fluent with Google to access your Russian learning dashboard.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginClient />;
}
