import React, { useState, useEffect, useRef } from 'react';
import {
  Calculator,
  HardHat,
  Briefcase,
  Building2,
  ArrowRight,
  Volume2,
  VolumeX
} from 'lucide-react';

interface RoleItem {
  id: string;
  title: string;
  desc: string;
  destination: string;
  iconType: 'calculator' | 'helmet' | 'briefcase' | 'building';
  imageSrc: string;
  delay: number;
}

const ROLES_DATA: RoleItem[] = [
  {
    id: 'estimator',
    title: 'Estimator / QS',
    desc: 'Hitung dan susun RAB dengan lebih cepat.',
    destination: '/estimator',
    iconType: 'calculator',
    imageSrc: '/images/roles/estimator.jpg',
    delay: 100
  },
  {
    id: 'kontraktor',
    title: 'Kontraktor',
    desc: 'Kelola proyek dan pantau progres.',
    destination: '/project-management',
    iconType: 'helmet',
    imageSrc: '/images/roles/kontraktor.jpg',
    delay: 200
  },
  {
    id: 'konsultan',
    title: 'Konsultan',
    desc: 'Tingkatkan efisiensi estimasi proyek.',
    destination: '/ahsp',
    iconType: 'briefcase',
    imageSrc: '/images/roles/konsultan.jpg',
    delay: 300
  },
  {
    id: 'developer',
    title: 'Developer',
    desc: 'Kontrol biaya dan jadwal proyek.',
    destination: '/project',
    iconType: 'building',
    imageSrc: '/images/roles/developer.jpg',
    delay: 400
  }
];

export const ExactRoles: React.FC = () => {
  const [hasEntered, setHasEntered] = useState<boolean>(true);
  const [lineRevealed, setLineRevealed] = useState<boolean>(true);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);

  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // prefers-reduced-motion check
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Viewport IntersectionObserver & Autoplay handling
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.defaultMuted = true;
      video.muted = !isAudioEnabled;
      video.play().catch(() => {});
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasEntered(true);
            if (videoRef.current) {
              videoRef.current.defaultMuted = true;
              videoRef.current.muted = !isAudioEnabled;
              videoRef.current.play().catch(() => {});
            }
          }
        });
      },
      { threshold: 0.02 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    // Global gesture listener ensures video starts on first interaction if blocked
    const onUserInteraction = () => {
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.defaultMuted = true;
        videoRef.current.muted = !isAudioEnabled;
        videoRef.current.play().catch(() => {});
      }
    };

    window.addEventListener('click', onUserInteraction, { passive: true });
    window.addEventListener('scroll', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('click', onUserInteraction);
      window.removeEventListener('scroll', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
  }, [isAudioEnabled]);

  // Reveal connection line after cards enter
  useEffect(() => {
    if (!hasEntered || prefersReducedMotion) {
      if (prefersReducedMotion) {
        setLineRevealed(true);
      }
      return;
    }

    const lineTimer = setTimeout(() => {
      setLineRevealed(true);
    }, 700);

    return () => clearTimeout(lineTimer);
  }, [hasEntered, prefersReducedMotion]);

  // Handle audio toggle
  const toggleAudio = () => {
    const nextState = !isAudioEnabled;
    setIsAudioEnabled(nextState);

    if (videoRef.current) {
      videoRef.current.muted = !nextState;
      if (nextState) {
        videoRef.current.volume = 0.55;
      }
    }
  };

  const handleCardClick = (destination: string) => {
    if (destination.startsWith('/')) {
      const targetElement = document.querySelector(destination.replace('/', '#'));
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Render specific animated icons
  const renderIcon = (type: RoleItem['iconType'], isHovered: boolean) => {
    switch (type) {
      case 'calculator':
        return (
          <div className={`ez-role-icon-anim calc-icon ${isHovered ? 'active' : ''}`}>
            <Calculator size={26} />
            <span className="ez-icon-pulse-dot" />
          </div>
        );
      case 'helmet':
        return (
          <div className={`ez-role-icon-anim helmet-icon ${isHovered ? 'active' : ''}`}>
            <HardHat size={26} />
          </div>
        );
      case 'briefcase':
        return (
          <div className={`ez-role-icon-anim briefcase-icon ${isHovered ? 'active' : ''}`}>
            <Briefcase size={26} />
          </div>
        );
      case 'building':
        return (
          <div className={`ez-role-icon-anim building-icon ${isHovered ? 'active' : ''}`}>
            <Building2 size={26} />
            <div className="ez-building-sweep-beam" />
          </div>
        );
    }
  };

  return (
    <section className="ez-roles-section" ref={sectionRef} id="profesional">
      {/* 1. Main Background Live-Action Video (Executive Developer overlooking construction) */}
      <div className="ez-roles-video-bg-wrap" aria-hidden="true">
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el) {
              el.defaultMuted = true;
              el.muted = !isAudioEnabled;
              el.playsInline = true;
              el.play().catch(() => {});
            }
          }}
          src="/videos/roles-bg.mp4"
          poster="/videos/roles-bg-poster.jpg"
          autoPlay
          loop
          muted={!isAudioEnabled}
          playsInline
          preload="auto"
          onCanPlay={(e) => {
            const v = e.currentTarget;
            v.defaultMuted = true;
            v.muted = !isAudioEnabled;
            v.play().catch(() => {});
          }}
          onLoadedData={(e) => {
            const v = e.currentTarget;
            v.defaultMuted = true;
            v.muted = !isAudioEnabled;
            v.play().catch(() => {});
          }}
          className="ez-roles-video-bg"
        />
        {/* Layered dark navy / midnight gradient overlays for readability and enterprise elegance */}
        <div className="ez-roles-video-dark-overlay" />
        <div className="ez-roles-bg-grid" />
        <div className="ez-roles-bg-glow" />
        <div className="ez-roles-light-sweep" />
      </div>

      <div className="ez-roles-container">
        {/* Header Section (Centered above cards) */}
        <div className={`ez-roles-header ${hasEntered ? 'is-visible' : ''}`}>
          {/* Eyebrow / Label Kecil */}
          <div className="ez-roles-eyebrow">
            <span className="ez-roles-eyebrow-pill">
              UNTUK PROFESIONAL DI BIDANG KONSTRUKSI
            </span>
          </div>

          {/* Heading */}
          <h2 className="ez-roles-h2">
            Bangun lebih cepat.<br />
            <span className="ez-roles-gradient-text">Kelola lebih cerdas.</span>
          </h2>

          {/* Subheading */}
          <p className="ez-roles-desc">
            EZRAB membantu setiap profesional konstruksi menghitung, mengelola, dan mengontrol proyek dalam satu platform terintegrasi.
          </p>

          {/* Ambient Video Sound Control */}
          <div className="ez-roles-audio-toggle-wrap">
            <button
              onClick={toggleAudio}
              className={`ez-roles-audio-pill ${isAudioEnabled ? 'is-active' : ''}`}
              aria-label={isAudioEnabled ? 'Matikan suara video latar' : 'Aktifkan suara video latar'}
              title={isAudioEnabled ? 'Suara video latar aktif' : 'Aktifkan suara video latar'}
            >
              {isAudioEnabled ? (
                <>
                  <Volume2 size={15} className="ez-audio-icon active" />
                  <span>Suara Video: Aktif</span>
                  <span className="ez-audio-wave-dot" />
                </>
              ) : (
                <>
                  <VolumeX size={15} className="ez-audio-icon" />
                  <span>Suara Video: Nonaktif</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Roles Stage & Horizontal Connecting Workflow Line */}
        <div className="ez-roles-stage">
          {/* Subtle Horizontal Workflow Line & Traveling Particle */}
          <div className={`ez-workflow-line-track ${lineRevealed ? 'is-revealed' : ''}`} aria-hidden="true">
            <div className="ez-workflow-base-line" />
            <div className="ez-workflow-glow-line" />
            {!prefersReducedMotion && (
              <div className="ez-workflow-traveling-particle">
                <div className="ez-particle-core" />
                <div className="ez-particle-halo" />
              </div>
            )}
          </div>

          {/* 4 Professional Cards with 85% opacity Background Images */}
          <div className="ez-roles-grid">
            {ROLES_DATA.map((role, idx) => {
              const isHovered = hoveredCardId === role.id;
              const isAnyHovered = hoveredCardId !== null;
              const isDimmed = isAnyHovered && !isHovered;

              return (
                <div
                  key={role.id}
                  className={`ez-role-card ${hasEntered ? 'is-entered' : ''} ${isHovered ? 'is-focused' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                  style={{
                    transitionDelay: prefersReducedMotion ? '0ms' : `${role.delay}ms`
                  }}
                  onMouseEnter={() => setHoveredCardId(role.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  onClick={() => handleCardClick(role.destination)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${role.title} - ${role.desc}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleCardClick(role.destination);
                    }
                  }}
                >
                  {/* Card Background Image with 85% Opacity */}
                  <div className="ez-role-card-bg-wrap" aria-hidden="true">
                    <img
                      src={role.imageSrc}
                      alt={role.title}
                      className="ez-role-card-bg-img"
                      decoding="async"
                    />
                    <div className="ez-role-card-overlay" />
                  </div>

                  {/* Subtle connection node anchor on the card top */}
                  <div className="ez-role-node-anchor" aria-hidden="true">
                    <span className="ez-node-dot" />
                  </div>

                  {/* Role Icon in Rounded Square Container */}
                  <div className="ez-role-icon-box">
                    {renderIcon(role.iconType, isHovered)}
                  </div>

                  {/* Role Title */}
                  <h4 className="ez-role-title">
                    {role.title}
                  </h4>

                  {/* Role Description */}
                  <p className="ez-role-desc">
                    {role.desc}
                  </p>

                  {/* Bottom Indicator & Learn More Hover Link */}
                  <div className="ez-role-bottom-row">
                    <div className="ez-role-bottom-tag">
                      <span className="ez-role-step-num">0{idx + 1}</span>
                      <span className="ez-role-tag-line" />
                    </div>
                    <span className="ez-role-learn-link">
                      <span>Pelajari</span>
                      <ArrowRight size={13} className="ez-role-arrow-icon" />
                    </span>
                  </div>

                  {/* Ambient Glow behind card */}
                  <div className="ez-role-hover-glow" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactRoles;
