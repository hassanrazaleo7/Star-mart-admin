// Bare layout for printable documents (labels, receipts, invoices): no app chrome.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-white text-black">{children}</div>;
}
