export default function PrintLayout({ children }: { children: React.ReactNode }) {
  // Print pages always render on light paper, regardless of the app theme.
  return <div data-theme="light">{children}</div>;
}
