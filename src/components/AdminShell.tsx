import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function AdminShell({title,children}:{title:string;children:React.ReactNode}){
  return <div className="min-h-screen w-full min-w-0 overflow-x-hidden md:flex">
    <Sidebar/>
    <main className="min-w-0 w-full flex-1 overflow-x-hidden">
      <Topbar title={title}/>
      <div className="mx-auto w-full max-w-7xl min-w-0 px-3 py-4 sm:px-4 md:p-7">{children}</div>
    </main>
  </div>;
}
