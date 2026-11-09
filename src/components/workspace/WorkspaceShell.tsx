import React from 'react';
import { ProjectProvider } from '../../context/ProjectContext';
import { WorkspaceView } from '../dashboard/WorkspaceView';
import { PasscodeGate } from '../../auth/PasscodeGate';
import type { AuthMode } from '../../auth/authMode';
import type { WorkspaceRoute } from '../../routing/routes';

/**
 * Kerang akar workspace — titik batas code-splitting.
 *
 * Seluruh pohon berat aplikasi (WorkspaceView + ProjectContext + engine +
 * data AHSP generated) berakar di sini dan dimuat lewat React.lazy dari
 * App.tsx, sehingga berkas entry untuk rute publik (landing, /fitur,
 * /harga, /privacy, auth) tidak lagi memuat pohon workspace sama sekali.
 *
 * Komposisi di dalamnya PERSIS seperti yang sebelumnya dirender inline
 * oleh App.tsx untuk cabang /app/*: gerbang kode akses membungkus
 * ProjectProvider + WorkspaceView. PasscodeGate sendiri tetap ringan —
 * cabang /access di App.tsx memakainya langsung tanpa chunk ini.
 */
export interface WorkspaceShellProps {
  authMode: AuthMode;
  route: WorkspaceRoute;
  onBackToLanding: () => void;
  onNavigateMenu: (menu: string, projectId?: string | null) => void;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  authMode,
  route,
  onBackToLanding,
  onNavigateMenu,
}) => (
  // KUNCI SEMENTARA (user 2026-10-20): seluruh /app/* digerbang kode
  // akses selama login dimatikan; validasi di server (bukan client).
  // Nonaktif otomatis saat AUTH_MODE menjadi 'real-login'.
  <PasscodeGate enabled={authMode !== 'real-login'}>
    <ProjectProvider>
      <WorkspaceView
        route={route}
        onBackToLanding={onBackToLanding}
        onNavigateMenu={onNavigateMenu}
      />
    </ProjectProvider>
  </PasscodeGate>
);

export default WorkspaceShell;
