import React, { useEffect, useRef } from 'react';

interface RibbonFieldProps {
  speed?: number;
  pointerAmount?: number;
  smoothing?: number;
  className?: string;
}

const VERTEX_SHADER_SRC = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform vec2 pointer;

float hash(vec2 p) { 
  p = fract(p * vec2(123.34, 456.21)); 
  p += dot(p, p + 45.32); 
  return fract(p.x * p.y); 
}

float ribbon(vec2 uv, float offset, float width, float phase) { 
  float y = 0.55 + 0.20 * sin((uv.x * 2.15) + phase) + 0.045 * sin((uv.x * 7.0) - phase * 0.7); 
  float d = abs(uv.y - y - offset); 
  return exp(-(d * d) / width); 
}

void main() { 
  vec2 uv = gl_FragCoord.xy / resolution.xy; 
  vec2 p = uv; 
  p.x *= resolution.x / resolution.y; 
  float t = time * 0.22; 
  float drift = (pointer.x - 0.5) * 0.06; 
  float rightFade = smoothstep(0.20, 0.72, uv.x); 
  float centerDark = 1.0 - smoothstep(0.0, 0.88, distance(uv, vec2(0.18, 0.48))); 
  
  float r1 = ribbon(vec2(uv.x + drift, uv.y), 0.03, 0.0065, t + 0.9); 
  float r2 = ribbon(vec2(uv.x - drift * 0.7, uv.y), -0.23, 0.0085, t + 3.25); 
  float r3 = ribbon(vec2(uv.x + drift * 0.4, uv.y), 0.25, 0.014, t + 1.85); 
  float glow = r1 * 1.14 + r2 * 1.05 + r3 * 0.48; 
  
  // PURE BLUE GRADIENTS (Pure cyan, electric sky, sapphire, royal blue, deep cobalt)
  vec3 cyan = vec3(0.22, 0.82, 0.96); 
  vec3 sky = vec3(0.18, 0.65, 0.98); 
  vec3 sapphire = vec3(0.14, 0.52, 0.94); 
  vec3 royal = vec3(0.10, 0.42, 0.90); 
  vec3 cobalt = vec3(0.06, 0.30, 0.82); 
  
  vec3 col = vec3(0.0); 
  col += cyan * r1 * 0.92; 
  col += sky * r1 * 0.62; 
  col += sapphire * r3 * 0.42; 
  col += royal * r2 * 0.66; 
  col += cobalt * (r2 + r3) * 0.32; 
  
  float bloom = exp(-pow(distance(uv, vec2(0.76, 0.40 + 0.035 * sin(t))), 2.0) / 0.050); 
  bloom += exp(-pow(distance(uv, vec2(0.71, 0.75 + 0.025 * cos(t))), 2.0) / 0.030); 
  col += vec3(0.35, 0.75, 1.0) * bloom * 0.34; 
  
  vec2 grid = fract(gl_FragCoord.xy / 7.0) - 0.5; 
  float dotShape = smoothstep(0.29, 0.11, length(grid)); 
  float noise = hash(floor(gl_FragCoord.xy / 7.0)); 
  float scan = 0.72 + 0.28 * sin((uv.x + uv.y) * 38.0 + time * 1.3); 
  float dots = dotShape * (0.48 + 0.52 * noise) * scan; 
  float micro = hash(gl_FragCoord.xy + time) * 0.035; 
  float alpha = clamp((glow * 1.55 + bloom * 0.50) * dots * rightFade, 0.0, 1.0); 
  alpha *= 1.0 - centerDark * 0.56; 
  
  // DARK REGION: Deep Dark Navy Blue (#020617 / #030816) matching landing page
  vec3 base = vec3(0.0078, 0.0235, 0.0902); 
  vec3 finalColor = mix(base, col, clamp(alpha * 1.55, 0.0, 1.0)); 
  finalColor += micro * rightFade * 0.5; 
  gl_FragColor = vec4(finalColor, 1.0); 
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'Unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

export const RibbonFieldBackground: React.FC<RibbonFieldProps> = ({
  speed = 1,
  pointerAmount = 1,
  smoothing = 0.035,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ speed, pointerAmount, smoothing });

  useEffect(() => {
    propsRef.current = { speed, pointerAmount, smoothing };
  }, [speed, pointerAmount, smoothing]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;

    try {
      vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link failed: ${info}`);
      }

      gl.useProgram(program);

      const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const posAttr = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      const resUniform = gl.getUniformLocation(program, 'resolution');
      const timeUniform = gl.getUniformLocation(program, 'time');
      const pointerUniform = gl.getUniformLocation(program, 'pointer');

      let curPointerX = 0.72;
      let curPointerY = 0.42;
      let targetPointerX = 0.72;
      let targetPointerY = 0.42;
      let rafId = 0;
      let isRendering = true;
      const startTime = performance.now();

      const handlePointerMove = (e: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const pa = propsRef.current.pointerAmount;
        targetPointerX = 0.72 + (nx - 0.72) * pa;
        targetPointerY = 0.42 + (1 - ny - 0.42) * pa;
      };

      const handleResize = () => {
        const rect = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(resUniform, w, h);
      };

      const render = () => {
        const now = performance.now();
        const { smoothing: sm, speed: sp } = propsRef.current;
        curPointerX += (targetPointerX - curPointerX) * sm;
        curPointerY += (targetPointerY - curPointerY) * sm;

        gl.uniform1f(timeUniform, (now - startTime) * 0.001 * sp);
        gl.uniform2f(pointerUniform, curPointerX, curPointerY);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        if (isRendering && !document.hidden) {
          rafId = requestAnimationFrame(render);
        }
      };

      handleResize();
      render();

      const resizeObserver = new ResizeObserver(() => {
        handleResize();
        if (!isRendering && !document.hidden) {
          requestAnimationFrame(() => {
            if (isRendering) return;
            gl.uniform2f(pointerUniform, curPointerX, curPointerY);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
        }
      });
      resizeObserver.observe(container);

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const isIntersecting = entry ? entry.isIntersecting : true;
          if (isIntersecting && !isRendering) {
            isRendering = true;
            rafId = requestAnimationFrame(render);
          } else if (!isIntersecting) {
            isRendering = false;
            cancelAnimationFrame(rafId);
          }
        },
        { threshold: 0 }
      );
      intersectionObserver.observe(container);

      const handleVisibilityChange = () => {
        if (!document.hidden && !isRendering) {
          const rect = container.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) {
            isRendering = true;
            rafId = requestAnimationFrame(render);
          }
        } else if (document.hidden) {
          cancelAnimationFrame(rafId);
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pointermove', handlePointerMove, { passive: true });

      return () => {
        cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        window.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (buffer) gl.deleteBuffer(buffer);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        if (program) gl.deleteProgram(program);
      };
    } catch (err) {
      console.warn('RibbonField WebGL error:', err);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`ez-ribbon-bg-container ${className}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="ez-ribbon-bg-canvas"
      />
      {/* Subtle vignette overlays to harmonize with hero typography & dark borders */}
      <div className="ez-ribbon-bg-vignette-left" />
      <div className="ez-ribbon-bg-bottom-gradient" />
    </div>
  );
};

export default RibbonFieldBackground;
