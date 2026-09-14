'use client';

import { useState, useEffect } from 'react';

export type VideoItem = {
  id: string;
  title: string;
  public_url: string;
  category: string;
  description?: string | null;
  thumbnail_url?: string | null;
};

export function VideoGallery({ videos, shortName }: { videos: VideoItem[]; shortName: string }) {
  const [openVideo, setOpenVideo] = useState<VideoItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const GREEN = '#062d2a';
  const GOLD = '#C9A84C';

  return (
    <>
      <style>{`
        .vg-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
        @media (min-width: 640px) { .vg-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .vg-grid { grid-template-columns: repeat(3, 1fr); } }
        .vg-card { position: relative; border-radius: 16px; overflow: hidden; background: #06372f; cursor: pointer; transition: transform .22s ease, box-shadow .22s ease; }
        .vg-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(6,45,42,.3); }
        .vg-card video { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
        .vg-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(6,45,42,.9) 0%, transparent 60%); padding: 16px; display: flex; flex-direction: column; justify-content: flex-end; color: white; transition: opacity .2s; opacity: 1; }
        .vg-card:hover .vg-overlay { opacity: 1; }
        .vg-cat { font-size: 10px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: #e8c97a; }
        .vg-title { font-size: 15px; font-weight: 900; margin-top: 4px; line-height: 1.3; }
        .vg-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; border-radius: 50%; background: rgba(255,255,255,.95); color: #062d2a; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 8px 24px rgba(0,0,0,.3); transition: transform .2s, background .2s; }
        .vg-card:hover .vg-play { transform: translate(-50%, -50%) scale(1.1); background: white; }
        .vg-modal { position: fixed; inset: 0; z-index: 100; background: rgba(6,45,42,.95); display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn .2s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .vg-modal-content { position: relative; max-width: 900px; width: 100%; max-height: 90vh; background: #06372f; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.5); border: 1px solid #c9a84c44; }
        .vg-modal-video { width: 100%; aspect-ratio: 16/9; max-height: 70vh; }
        .vg-close { position: absolute; top: 12px; right: 12px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.2); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: pointer; transition: background .2s; z-index: 10; }
        .vg-close:hover { background: rgba(255,255,255,.3); }
        .vg-modal-info { padding: 16px 20px 20px; color: white; }
        .vg-modal-cat { font-size: 10px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: #e8c97a; }
        .vg-modal-title { font-size: 20px; font-weight: 900; margin-top: 6px; }
        .vg-modal-desc { margin-top: 8px; font-size: 14px; line-height: 1.6; color: #a8c4b8; }
      `}</style>

      <div className="vg-grid">
        {videos.map((video) => (
          <article key={video.id} className="vg-card" onClick={() => setOpenVideo(video)}>
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt={video.title} className="w-full aspect-video object-cover" />
            ) : (
              <video src={video.public_url} preload="metadata" muted playsInline />
            )}
            <div className="vg-overlay">
              <div className="vg-cat">{video.category}</div>
              <h3 className="vg-title">{video.title}</h3>
            </div>
            <div className="vg-play" aria-hidden="true">▶</div>
          </article>
        ))}
      </div>

      {openVideo && (
        <div className="vg-modal" onClick={() => setOpenVideo(null)} role="dialog" aria-modal="true" aria-label="Video player">
          <div className="vg-modal-content" onClick={e => e.stopPropagation()}>
            <button className="vg-close" onClick={() => setOpenVideo(null)} aria-label="Close video">×</button>
            <video
              className="vg-modal-video"
              src={openVideo.public_url}
              controls
              autoPlay
              playsInline
            />
            <div className="vg-modal-info">
              <div className="vg-modal-cat">{openVideo.category}</div>
              <h3 className="vg-modal-title">{openVideo.title}</h3>
              {openVideo.description && <p className="vg-modal-desc">{openVideo.description}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}