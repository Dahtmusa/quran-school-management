'use client';

export type TeamProfile={id:string;category:'leadership'|'management'|'staff';name:string;role:string;bio:string;full:string;photo:string;home:boolean;published:boolean};
export type AlumniProfile={id:string;name:string;cohort:string;brief:string;photo:string;published:boolean;home:boolean};
export type HomepageConfig={schoolName:string;tagline:string;heroTitle:string;heroSubtitle:string;heroImage:string;aboutTitle:string;aboutText:string;showLeadership:boolean;showStaff:boolean;showAlumni:boolean};

export const defaultHomepage:HomepageConfig={
 schoolName:'Al Huda Quran Memorization School',
 tagline:'A two-year journey with the Book of Allah',
 heroTitle:'Memorize the Book of Allah. Build a Better Future.',
 heroSubtitle:'A structured two-year Quran memorization programme for Day and Boarding students, with clear progress tracking, three formal evaluations per term and lifelong alumni support.',
 heroImage:'',
 aboutTitle:'About Our School',
 aboutText:'A safe, disciplined and nurturing environment dedicated to Quran memorization, character and lifelong connection with the Book of Allah.',
 showLeadership:true,showStaff:true,showAlumni:true
};
export const defaultAlumni:AlumniProfile[]=[
 {id:'al-1',name:'Abdullah Hassan',cohort:'Cohort 2026',brief:'Completed the two-year Quran memorization programme.',photo:'',published:true,home:true},
 {id:'al-2',name:'Maryam Ahmed',cohort:'Cohort 2026',brief:'Excellent memorization, fluency and tajweed.',photo:'',published:true,home:true},
 {id:'al-3',name:'Yusuf Ramadhan',cohort:'Cohort 2025',brief:'Graduate profile preserved in the school alumni record.',photo:'',published:false,home:false}
];
export const defaultTeam:TeamProfile[]=[
 {id:'lead-1',category:'leadership',name:'Dr. Amina Rahman',role:'Director / Principal',bio:'Leading the school with a clear focus on Quran memorization, character and student care.',full:'Qualifications, leadership experience and responsibilities are managed by the administrator through the CMS.',photo:'',home:true,published:true},
 {id:'mgmt-1',category:'management',name:'Ustadh Yusuf Ali',role:'Head of Quran Programme',bio:'Oversees the memorization programme and academic quality.',full:'Programme leadership profile managed through the CMS.',photo:'',home:true,published:true},
 {id:'staff-1',category:'staff',name:'Ustadh Ibrahim',role:'Quran Teacher',bio:'Supports students through daily memorization and revision.',full:'Full staff profile managed through the CMS.',photo:'',home:false,published:true}
];
const HOME='dq-cms-home-v6'; const TEAM='dq-cms-team-v6'; const ALUMNI='dq-cms-alumni-v6';
export function loadHomepage(){try{const raw=localStorage.getItem(HOME);return raw?JSON.parse(raw):defaultHomepage}catch{return defaultHomepage}}
export function saveHomepage(v:HomepageConfig){localStorage.setItem(HOME,JSON.stringify(v))}
export function loadTeam(){try{const raw=localStorage.getItem(TEAM);return raw?JSON.parse(raw):defaultTeam}catch{return defaultTeam}}
export function saveTeam(v:TeamProfile[]){localStorage.setItem(TEAM,JSON.stringify(v))}
export function loadAlumni(){try{const raw=localStorage.getItem(ALUMNI);return raw?JSON.parse(raw):defaultAlumni}catch{return defaultAlumni}}
export function saveAlumni(v:AlumniProfile[]){localStorage.setItem(ALUMNI,JSON.stringify(v))}
