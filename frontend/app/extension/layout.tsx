import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Расширение для Chrome',
  description: 'Расширение Fluent для Chrome: переводите литовские слова на любом сайте и добавляйте их в свои списки для изучения.',
  alternates: { canonical: 'https://fluent.lt/extension/' },
};

export default function ExtensionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
