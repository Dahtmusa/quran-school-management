import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

const publicPaths=['/','/auth/login','/admissions','/alumni','/about','/programs','/campus-life','/news','/contact'];
const roleRoutes:{prefix:string;roles:string[]}[]=[
 {prefix:'/admin',roles:['super_admin','admin','principal']},
 {prefix:'/cms',roles:['super_admin','admin','principal']},
 {prefix:'/students',roles:['super_admin','admin','principal','admissions']},
 {prefix:'/classes',roles:['super_admin','admin','principal']},
 {prefix:'/program-setup',roles:['super_admin','admin','principal']},
 {prefix:'/admissions/manage',roles:['super_admin','admin','principal','admissions']},
 {prefix:'/teacher',roles:['teacher']},
 {prefix:'/parent',roles:['parent','super_admin','admin','principal']},
 {prefix:'/fees',roles:['finance','super_admin','admin','principal','parent']},
 {prefix:'/attendance',roles:['security','super_admin','admin','principal']},
 {prefix:'/evaluations',roles:['super_admin','admin','principal']},
 {prefix:'/reports',roles:['super_admin','admin','principal','parent']},
 {prefix:'/calendar',roles:['super_admin','admin','principal']},
 {prefix:'/security',roles:['security']},
];
function isPublic(path:string){return publicPaths.some(p=>p==='/admissions'?path==='/admissions':path===p||path.startsWith(p+'/'))}
function dashboard(role:string){if(role==='teacher')return '/teacher';if(role==='parent')return '/parent';if(role==='security')return '/attendance';if(role==='finance')return '/fees';if(role==='admissions')return '/admissions/manage';return '/admin'}
export async function updateSession(request:NextRequest){
 let response=NextResponse.next({request});
 const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll(){return request.cookies.getAll()},setAll(cookiesToSet){cookiesToSet.forEach(({name,value,options})=>request.cookies.set(name,value));response=NextResponse.next({request});cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options))}}});
 const {data:{user}}=await supabase.auth.getUser(); const path=request.nextUrl.pathname;
 if(!user){if(isPublic(path))return response;return NextResponse.redirect(new URL('/auth/login',request.url));}
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
 if(path==='/auth/login')return NextResponse.redirect(new URL(dashboard(profile?.role??''),request.url));
 const rule=roleRoutes.find(r=>path===r.prefix||path.startsWith(r.prefix+'/'));
 if(rule&&(!profile?.role||!rule.roles.includes(profile.role)))return NextResponse.redirect(new URL(dashboard(profile?.role??''),request.url));
 return response;
}
