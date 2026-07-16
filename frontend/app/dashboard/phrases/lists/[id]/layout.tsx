export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function ListIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
