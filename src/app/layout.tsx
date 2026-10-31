import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ParcelOps · Shipment Control Center",
  description: "Private shipment operations for Amazon US and Canada",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
