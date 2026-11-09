/**
 * useNarrowMobile — deteksi viewport sempit dengan mekanisme yang SAMA
 * persis seperti yang dipakai WorkspaceView untuk memilih lapisan
 * MobileV3: state dari `window.innerWidth < 768` + listener resize.
 *
 * Dipakai titik komposisi di dalam view (mis. RabEstimasiView) yang tidak
 * menerima prop isNarrowMobile dari WorkspaceView, agar ambang & perilaku
 * deteksinya identik (bukan matchMedia terpisah yang bisa menyimpang).
 */
import { useEffect, useState } from 'react';

export const useNarrowMobile = (): boolean => {
  const [isNarrowMobile, setIsNarrowMobile] = useState<boolean>(
    () => typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isNarrowMobile;
};

export default useNarrowMobile;
