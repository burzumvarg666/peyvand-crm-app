import type { Metadata } from 'next';
import './globals.css';
import './crm-v5.css';
export const metadata: Metadata = { title: 'پیوند | مدیریت ارتباط با مشتری', description: 'مدیریت مشتریان، فرصت‌های فروش و پیگیری‌های تیم', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) { return <html lang="fa" dir="rtl"><body>{children}</body></html>; }
