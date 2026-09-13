import './globals.css';
import type {Metadata,Viewport} from 'next';
export const metadata:Metadata={title:"Aliyu and Maimuna Center for Qur'anic Memorization",description:'International-standard Quran memorization school website and management platform',applicationName:'AMQM School',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',shortcut:'/icon.svg',apple:'/icon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#062d2a'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
