import {getAyahMeta} from 'quran-meta/hafs';
export type Surah = { id:number; name:string; ayahs:number; startPage:number };

// Surah names and ayah counts for the dropdowns. Exact per-ayah page/Juz/Hizb metadata is supplied by quran-meta Hafs.
export const SURAHS: Surah[] = [
[1,'Al-Fatihah',7,1],[2,'Al-Baqarah',286,2],[3,"Ali 'Imran",200,50],[4,'An-Nisa',176,77],[5,"Al-Ma'idah",120,106],[6,"Al-An'am",165,128],[7,"Al-A'raf",206,151],[8,'Al-Anfal',75,177],[9,'At-Tawbah',129,187],[10,'Yunus',109,208],[11,'Hud',123,221],[12,'Yusuf',111,235],[13,"Ar-Ra'd",43,249],[14,'Ibrahim',52,255],[15,'Al-Hijr',99,262],[16,'An-Nahl',128,267],[17,'Al-Isra',111,282],[18,'Al-Kahf',110,293],[19,'Maryam',98,305],[20,'Taha',135,312],[21,'Al-Anbya',112,322],[22,'Al-Hajj',78,332],[23,"Al-Mu'minun",118,342],[24,'An-Nur',64,350],[25,'Al-Furqan',77,359],[26,"Ash-Shu'ara",227,367],[27,'An-Naml',93,377],[28,'Al-Qasas',88,385],[29,"Al-'Ankabut",69,396],[30,'Ar-Rum',60,404],[31,'Luqman',34,411],[32,'As-Sajdah',30,415],[33,'Al-Ahzab',73,418],[34,'Saba',54,428],[35,'Fatir',45,434],[36,'Ya-Sin',83,440],[37,'As-Saffat',182,446],[38,'Sad',88,453],[39,'Az-Zumar',75,458],[40,'Ghafir',85,467],[41,'Fussilat',54,477],[42,'Ash-Shuraa',53,483],[43,'Az-Zukhruf',89,489],[44,'Ad-Dukhan',59,496],[45,'Al-Jathiyah',37,499],[46,'Al-Ahqaf',35,502],[47,'Muhammad',38,507],[48,'Al-Fath',29,511],[49,'Al-Hujurat',18,515],[50,'Qaf',45,518],[51,'Adh-Dhariyat',60,520],[52,'At-Tur',49,523],[53,'An-Najm',62,526],[54,'Al-Qamar',55,528],[55,'Ar-Rahman',78,531],[56,'Al-Waqiah',96,534],[57,'Al-Hadid',29,537],[58,'Al-Mujadilah',22,542],[59,'Al-Hashr',24,545],[60,'Al-Mumtahanah',13,549],[61,'As-Saff',14,551],[62,'Al-Jumuah',11,553],[63,'Al-Munafiqun',11,554],[64,'At-Taghabun',18,556],[65,'At-Talaq',12,558],[66,'At-Tahrim',12,560],[67,'Al-Mulk',30,562],[68,'Al-Qalam',52,564],[69,'Al-Haqqah',52,566],[70,"Al-Ma'arij",44,568],[71,'Nuh',28,570],[72,'Al-Jinn',28,572],[73,'Al-Muzzammil',20,574],[74,'Al-Muddaththir',56,575],[75,'Al-Qiyamah',40,577],[76,'Al-Insan',31,578],[77,'Al-Mursalat',50,580],[78,'An-Naba',40,582],[79,'An-Naziat',46,583],[80,'Abasa',42,585],[81,'At-Takwir',29,586],[82,'Al-Infitar',19,587],[83,'Al-Mutaffifin',36,587],[84,'Al-Inshiqaq',25,589],[85,'Al-Buruj',22,590],[86,'At-Tariq',17,591],[87,'Al-Ala',19,591],[88,'Al-Ghashiyah',26,592],[89,'Al-Fajr',30,593],[90,'Al-Balad',20,594],[91,'Ash-Shams',15,595],[92,'Al-Layl',21,595],[93,'Ad-Duha',11,596],[94,'Ash-Sharh',8,596],[95,'At-Tin',8,597],[96,'Al-Alaq',19,597],[97,'Al-Qadr',5,598],[98,'Al-Bayyinah',8,598],[99,'Az-Zalzalah',8,599],[100,'Al-Adiyat',11,599],[101,'Al-Qariah',11,600],[102,'At-Takathur',8,600],[103,'Al-Asr',3,601],[104,'Al-Humazah',9,601],[105,'Al-Fil',5,601],[106,'Quraysh',4,602],[107,'Al-Maun',7,602],[108,'Al-Kawthar',3,602],[109,'Al-Kafirun',6,603],[110,'An-Nasr',3,603],[111,'Al-Masad',5,603],[112,'Al-Ikhlas',4,604],[113,'Al-Falaq',5,604],[114,'An-Nas',6,604]
] .map((row) => ({id:Number(row[0]), name:String(row[1]), ayahs:Number(row[2]), startPage:Number(row[3])}));

export const TOTAL_AYAHS = 6236;
export const TOTAL_PAGES = 604;
export const TOTAL_HIZBS = 60;

export type Position = { surah:number; ayah:number };

export function surah(id:number){ return SURAHS.find(s=>s.id===id)!; }
export function positionOrdinal(p:Position){
  let n=0; for(const s of SURAHS){ if(s.id===p.surah) return n+p.ayah; n+=s.ayahs; } return 0;
}
export function positionFromOrdinal(n:number):Position{
  const id=Math.max(1,Math.min(TOTAL_AYAHS,n));
  const meta=getAyahMeta(id);
  return {surah:meta.surah,ayah:meta.ayah};
}
export function label(p:Position){ return `${surah(p.surah).name} ${p.ayah}`; }

// Exact Hafs / 604-page Madinah metadata comes from quran-meta rather than an
// estimated Surah page interpolation. This keeps page, Juz and Hizb calculations
// deterministic for every ayah.
export function pageForPosition(p:Position){ return getAyahMeta(positionOrdinal(p)).page; }
export function juzForPosition(p:Position){ return getAyahMeta(positionOrdinal(p)).juz; }
export function hizbForPosition(p:Position){ return getAyahMeta(positionOrdinal(p)).hizbId; }
export function progressBetween(start:Position,current:Position,direction:'Nas-to-Baqarah'|'Baqarah-to-Nas'='Baqarah-to-Nas'){
  const a=positionOrdinal(start), b=positionOrdinal(current);
  const covered=direction==='Baqarah-to-Nas'?Math.max(0,b-a+1):Math.max(0,a-b+1);
  const scope=direction==='Baqarah-to-Nas'?Math.max(1,TOTAL_AYAHS-a+1):Math.max(1,a);
  const percent=Math.max(0,Math.min(100,(covered/scope)*100));
  const pages=direction==='Baqarah-to-Nas'?Math.max(1,pageForPosition(current)-pageForPosition(start)+1):Math.max(1,pageForPosition(start)-pageForPosition(current)+1);
  const hizbs=direction==='Baqarah-to-Nas'?Math.max(1,hizbForPosition(current)-hizbForPosition(start)+1):Math.max(1,hizbForPosition(start)-hizbForPosition(current)+1);
  return {ayahs:covered,pages,hizbs,percent,scope};
}
export function remainingFrom(current:Position,direction:'Nas-to-Baqarah'|'Baqarah-to-Nas'='Baqarah-to-Nas'){
  const ordinal=positionOrdinal(current);
  if(direction==='Baqarah-to-Nas') return {ayahs:Math.max(0,TOTAL_AYAHS-ordinal),pages:Math.max(0,TOTAL_PAGES-pageForPosition(current)),hizbs:Math.max(0,TOTAL_HIZBS-hizbForPosition(current))};
  return {ayahs:Math.max(0,ordinal-1),pages:Math.max(0,pageForPosition(current)-1),hizbs:Math.max(0,hizbForPosition(current)-1)};
}


/** Calculate the memorization covered between an official starting point and a teacher's stopping point. */
export function calculateEvaluation(start: Position, stop: Position, direction: 'Nas-to-Baqarah'|'Baqarah-to-Nas'='Baqarah-to-Nas') {
  const result = progressBetween(start, stop, direction);
  return {
    memorizedAyahs: result.ayahs,
    memorizedPages: result.pages,
    memorizedHizbs: result.hizbs,
    percentage: Math.round(result.percent * 10) / 10,
  };
}
