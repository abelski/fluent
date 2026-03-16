export function generateStaticParams() {
  return [{ slug: '_' }];
}

export default function ArticleEditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
