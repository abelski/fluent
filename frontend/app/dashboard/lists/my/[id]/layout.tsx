export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function MyListIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
