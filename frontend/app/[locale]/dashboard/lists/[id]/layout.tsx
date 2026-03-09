export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function IdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
