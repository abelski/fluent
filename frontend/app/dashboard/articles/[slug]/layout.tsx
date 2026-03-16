export function generateStaticParams() {
  return [{ slug: '_' }];
}

export default function ArticleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
