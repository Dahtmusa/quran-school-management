'use client';

import { useState } from 'react';

export type MediaItem = {
  id: string;
  title: string;
  public_url: string;
  category: string;
  media_type: 'image' | 'video';
  description?: string | null;
  thumbnail_url?: string | null;
  featured?: boolean;
};

export function CampusVideoShowcase({ media, shortName }: { media: MediaItem[]; shortName: string }) {
  const campusVideos = media.filter(
    (x: any) => x.media_type === 'video' &&
      (x.category === 'Campus Life' || x.category === 'School Compound' || x.category === 'Student Activities')
  );
  const campusPhotos = media.filter(
    (x: any) => x.media_type === 'image' &&
      (x.category === 'Campus Life' || x.category === 'School Compound' || x.category === 'Student Activities')
  );

  const featuredVideo = campusVideos.find((v: any) => v.featured === true) || campusVideos[0] || null;
  const featuredPhoto = campusPhotos[0] || null;
  const [openVideo, setOpenVideo] = useState<MediaItem | null>(null);

  if (!featuredVideo && !featuredPhoto) return null;

  return (
    <>
      <style>{`
        .cvs-grid { display: grid; gap: 16px; grid-template-columns: 1fr; align-items: start; }
        @media (min-width: 1024px) { .cvs-grid { grid-template-columns: 1.4fr 1fr; } }
        .cvs-main { position: relative; border-radius: 16px; overflow: hidden; background: #06372f; min-height: 300px; }
        .cvs-main video, .cvs-main img { width: 100%; height: 100%; min-height: 300px; object-fit: cover; display: block; }
        .cvs-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(6,45,42,.9) 0%, transparent 60%); padding: 20px; display: flex; flex-direction: column; justify-content: flex-end; color: white; }
        .cvs-cat { font-size: 10px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: #e8c97a; }
        .cvs-title { font-size: 20px; font-weight: 900; margin-top: 4px; line-height: 1.3; }
        .cvs-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,.95); color: #062d2a; display: flex; align-items: center; justify-content: center; font-size: 26px; box-shadow: 0 8px 24px rgba(0,0,0,.3); transition: transform .2s, background .2s; cursor: pointer; }
        .cvs-main:hover .cvs-play { transform: translate(-50%, -50%) scale(1.1); background: white; }
        .cvs-gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .cvs-gallery img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 12px; transition: transform .2s; cursor: pointer; }
        .cvs-gallery img:hover { transform: scale(1.03); }
        @media (max-width: 1023px) { .cvs-gallery { grid-template-columns: 1fr; } }
        .cvs-modal { position: fixed; inset: 0; z-index: 100; background: rgba(6,45,42,.95); display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn .2s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .cvs-modal-content { position: relative; max-width: 900px; width: 100%; max-height: 90vh; background: #06372f; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.5); border: 1px solid #c9a84c44; }
        .cvs-modal-video { width: 100%; aspect-ratio: 16/9; max-height: 70vh; }
        .cvs-close { position: absolute; top: 12px; right: 12px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.2); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: pointer; transition: background .2s; z-index: 10; }
        .cvs-close:hover { background: rgba(255,255,255,.3); }
        .cvs-modal-info { padding: 16px 20px 20px; color: white; }
        .cvs-modal-cat { font-size: 10px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: #e8c97a; }
        .cvs-modal-title { font-size: 20px; font-weight: 900; margin-top: 6px; }
        .cvs-modal-desc { margin-top: 8px; font-size: 14px; line-height: 1.6; color: #a8c4b8; }
      `}</style>

      <div className="cvs-grid">
        <div className="cvs-main" onClick={() => featuredVideo && setOpenVideo(featuredVideo)}>
          {featuredVideo ? (
            <>
              <video src={featuredVideo.public_url} preload="metadata" muted playsInline />
              <div className="cvs-play" aria-hidden="true">&#9654;</div>
            </>
          ) : (
            <img src={featuredPhoto?.public_url || ""} alt={featuredPhoto?.title || "Campus"} />
          )}
          <div className="cvs-overlay">
            <div className="cvs-cat">{featuredVideo?.category || featuredPhoto?.category || "Campus Life"}</div>
            <h3 className="cvs-title">{featuredVideo?.title || featuredPhoto?.title || "Campus Life"}</h3>
          </div>
        </div>

        {campusPhotos.length > 0 && (
          <div className="cvs-gallery">
            {campusPhotos.slice(0, 4).map((photo) => (
              <img key={photo.id} src={photo.public_url} alt={photo.title} loading="lazy" />
            ))}
          </div>
        )}
      </div>

      {openVideo && (
        <div className="cvs-modal" onClick={() => setOpenVideo(null)} role="dialog" aria-modal="true" aria-label="Campus video player">
          <div className="cvs-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="cvs-close" onClick={() => setOpenVideo(null)} aria-label="Close video">×</button>
            <video className="cvs-modal-video" src={openVideo.public_url} controls autoPlay playsInline />
            <div className="cvs-modal-info">
              <div className="cvs-modal-cat">{openVideo.category}</div>
              <h3 className="cvs-modal-title">{openVideo.title}</h3>
              {openVideo.description && <p className="cvs-modal-desc">{openVideo.description}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}