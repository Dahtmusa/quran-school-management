import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#f6f8fb] md:flex">
      <Sidebar />
      <main className="min-w-0 w-full flex-1 overflow-x-hidden">
        <Topbar title={title} />
        <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-7">
          {children}
        </div>
      </main>
    </div>
  );
}
