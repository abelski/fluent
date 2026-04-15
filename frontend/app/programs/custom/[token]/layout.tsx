export function generateStaticParams() {
  return [{ token: '_' }];
}

export default function CustomProgramTokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
