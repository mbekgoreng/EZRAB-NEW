import React from 'react';
import '../../styles/boot-screen.css';

/**
 * Layar muat bermerek — fallback Suspense untuk chunk berat (workspace).
 * Visualnya identik dengan layar "ezrab-boot" di index.html yang tampil
 * sebelum bundle awal selesai dimuat, supaya transisi muat terasa satu
 * kesatuan: navy, wordmark EZRAB, bar muat beranimasi.
 */
export const BootScreen: React.FC<{ message?: string }> = ({ message }) => (
  <div className="ezrab-boot" role="status" aria-label="Memuat EZRAB">
    <div className="ezrab-boot-mark">
      <b>EZ</b>RAB
    </div>
    <div className="ezrab-boot-tag">{message ?? 'RAB & Estimasi Konstruksi'}</div>
    <div className="ezrab-boot-bar">
      <i />
    </div>
  </div>
);

/**
 * Penjaga kegagalan muat chunk: bila unduhan chunk (mis. workspace) gagal
 * di tengah jalan (koneksi putus / berkas berubah setelah deploy), tampilkan
 * layar bermerek yang sama + tombol muat ulang, bukan layar error mentah.
 * Hanya membungkus pohon lazy — error render biasa di luar cakupannya
 * tetap berperilaku seperti sebelumnya bila boundary ini tidak dipasang.
 */
interface ChunkErrorBoundaryState {
  hasError: boolean;
}

export class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ChunkErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ezrab-boot" role="alert" aria-label="Gagal memuat EZRAB">
          <div className="ezrab-boot-mark">
            <b>EZ</b>RAB
          </div>
          <div className="ezrab-boot-tag">
            Sebagian aplikasi gagal dimuat. Periksa koneksi kamu, lalu coba lagi.
          </div>
          <button
            type="button"
            className="ezrab-boot-retry"
            onClick={() => window.location.reload()}
          >
            Muat Ulang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
