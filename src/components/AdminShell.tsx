import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
export default function AdminShell({title,children}:{title:string;children:React.ReactNode}){return <div className="min-h-screen md:flex"><Sidebar/><main className="min-w-0 flex-1"><Topbar title={title}/><div className="mx-auto max-w-7xl p-4 md:p-7">{children}</div></main></div>}
