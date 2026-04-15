export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function ProgramIdLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
