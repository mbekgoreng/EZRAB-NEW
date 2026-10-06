import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface ChromaKeyVideoProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  className?: string;
  style?: React.CSSProperties;
  videoRef?: React.RefObject<HTMLVideoElement | null> | ((el: HTMLVideoElement | null) => void);
  threshold?: number;
  smoothness?: number;
  keyMode?: 'black' | 'green' | 'color';
  keyColor?: [number, number, number];
  onPlay?: () => void;
  onPause?: () => void;
  onCanPlay?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onTimeUpdate?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_threshold;
  uniform float u_smoothness;
  uniform vec3 u_keyColor;
  uniform int u_keyMode; // 0 = black / dark luma removal, 1 = green screen, 2 = color distance
  varying vec2 v_texCoord;

  void main() {
    vec4 col = texture2D(u_image, v_texCoord);
    float alpha = 1.0;

    if (u_keyMode == 0) {
      // Black background removal (Chroma/Luma Key)
      // Using max channel ensures saturated colored pixels aren't keyed out prematurely
      float brightness = max(col.r, max(col.g, col.b));
      alpha = smoothstep(u_threshold, u_threshold + u_smoothness, brightness);
    } else if (u_keyMode == 1) {
      // Green screen removal
      float greenDiff = col.g - max(col.r, col.b);
      alpha = 1.0 - smoothstep(u_threshold, u_threshold + u_smoothness, greenDiff);
      if (col.g > max(col.r, col.b)) {
        col.g = max(col.r, col.b);
      }
    } else {
      // Euclidean distance from keyColor
      float dist = distance(col.rgb, u_keyColor);
      alpha = smoothstep(u_threshold, u_threshold + u_smoothness, dist);
    }

    // Premultiplied alpha output ensures crisp edges without dark halos
    gl_FragColor = vec4(col.rgb * alpha, alpha);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export const ChromaKeyVideo: React.FC<ChromaKeyVideoProps> = ({
  src,
  poster,
  autoPlay = true,
  loop = true,
  muted = true,
  playsInline = true,
  preload = 'auto',
  className = '',
  style,
  videoRef: externalVideoRef,
  threshold = 0.065,
  smoothness = 0.055,
  keyMode = 'black',
  keyColor = [0, 0, 0],
  onPlay,
  onPause,
  onCanPlay,
  onLoadedMetadata,
  onTimeUpdate,
  onClick,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webGlFailed, setWebGlFailed] = useState(false);
  const animFrameIdRef = useRef<number | null>(null);
  const hasRenderedVideoRef = useRef(false);

  // Sync internal video element with external ref
  const setVideoElement = useCallback(
    (node: HTMLVideoElement | null) => {
      localVideoRef.current = node;
      if (typeof externalVideoRef === 'function') {
        externalVideoRef(node);
      } else if (externalVideoRef && 'current' in externalVideoRef) {
        (externalVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      }
    },
    [externalVideoRef]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = localVideoRef.current;
    if (!canvas || !video) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      }) || (canvas.getContext('experimental-webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null);
    } catch {
      gl = null;
    }

    if (!gl) {
      console.warn('WebGL not supported for ChromaKeyVideo, falling back.');
      setWebGlFailed(true);
      return;
    }

    // Set clear color to transparent
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    const vertShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vertShader || !fragShader) {
      setWebGlFailed(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setWebGlFailed(true);
      return;
    }
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('WebGL program link failed:', gl.getProgramInfoLog(program));
      setWebGlFailed(true);
      return;
    }

    gl.useProgram(program);

    // Quad geometry: positions [-1..1]
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0,  1.0, // Top-left
        -1.0, -1.0, // Bottom-left
         1.0,  1.0, // Top-right
         1.0, -1.0, // Bottom-right
      ]),
      gl.STATIC_DRAW
    );

    const aPositionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture coords [0..1]
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0.0, 0.0, // Top-left
        0.0, 1.0, // Bottom-left
        1.0, 0.0, // Top-right
        1.0, 1.0, // Bottom-right
      ]),
      gl.STATIC_DRAW
    );

    const aTexCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(aTexCoordLoc);
    gl.vertexAttribPointer(aTexCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Create & configure texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uThresholdLoc = gl.getUniformLocation(program, 'u_threshold');
    const uSmoothnessLoc = gl.getUniformLocation(program, 'u_smoothness');
    const uKeyColorLoc = gl.getUniformLocation(program, 'u_keyColor');
    const uKeyModeLoc = gl.getUniformLocation(program, 'u_keyMode');

    gl.uniform1f(uThresholdLoc, threshold);
    gl.uniform1f(uSmoothnessLoc, smoothness);
    gl.uniform3f(uKeyColorLoc, keyColor[0], keyColor[1], keyColor[2]);
    const modeVal = keyMode === 'black' ? 0 : keyMode === 'green' ? 1 : 2;
    gl.uniform1i(uKeyModeLoc, modeVal);

    // Helper to draw a frame from image or video
    const drawSource = (source: TexImageSource, srcWidth: number, srcHeight: number) => {
      if (!gl || !canvas) return;
      if (canvas.width !== srcWidth || canvas.height !== srcHeight) {
        canvas.width = srcWidth;
        canvas.height = srcHeight;
        gl.viewport(0, 0, srcWidth, srcHeight);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // If poster is present, pre-render poster with chroma key so there's never a black box!
    if (poster) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = poster;
      img.onload = () => {
        if (!hasRenderedVideoRef.current && img.naturalWidth > 0) {
          drawSource(img, img.naturalWidth, img.naturalHeight);
        }
      };
    }

    let isDestroyed = false;

    // Continuous rendering loop
    const renderLoop = () => {
      if (isDestroyed) return;

      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        hasRenderedVideoRef.current = true;
        drawSource(video, video.videoWidth, video.videoHeight);
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      isDestroyed = true;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (gl) {
        try {
          gl.deleteTexture(texture);
          gl.deleteBuffer(positionBuffer);
          gl.deleteBuffer(texCoordBuffer);
          gl.deleteShader(vertShader);
          gl.deleteShader(fragShader);
          gl.deleteProgram(program);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [poster, threshold, smoothness, keyMode, keyColor]);

  // Fallback: If WebGL is completely disabled in user's browser, render standard video
  if (webGlFailed) {
    return (
      <div onClick={onClick} style={{ position: 'relative', width: '100%', ...style }}>
        <video
          ref={setVideoElement}
          src={src}
          poster={poster}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          preload={preload}
          onPlay={onPlay}
          onPause={onPause}
          onCanPlay={onCanPlay}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          className={className}
          style={{ width: '100%', height: 'auto', display: 'block', mixBlendMode: 'screen' }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {/* Hidden native video element decoding frames */}
      <video
        ref={setVideoElement}
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        preload={preload}
        crossOrigin="anonymous"
        onPlay={onPlay}
        onPause={onPause}
        onCanPlay={onCanPlay}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Hardware-accelerated Chroma Key transparent canvas */}
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          background: 'transparent',
        }}
      />
    </div>
  );
};
