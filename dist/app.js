const portrait = document.querySelector('#portrait');
const canvas = document.querySelector('#face');

const vertexSource = `
  attribute vec2 a_uv;
  uniform vec2 u_grab;
  uniform vec2 u_pull;
  uniform float u_radius;
  varying vec2 v_uv;

  void main() {
    vec2 offset = a_uv - u_grab;
    float distanceSquared = dot(offset, offset);
    float weight = exp(-1.8 * distanceSquared / (u_radius * u_radius));
    vec2 position = a_uv + u_pull * weight;
    gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform sampler2D u_smile;
  uniform sampler2D u_ouch;
  uniform float u_reaction;
  varying vec2 v_uv;

  void main() {
    vec4 calm = texture2D(u_smile, v_uv);
    vec4 reacting = texture2D(u_ouch, v_uv);
    gl_FragColor = mix(calm, reacting, u_reaction);
  }
`;

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

function shader(gl, type, source) {
  const item = gl.createShader(type);
  gl.shaderSource(item, source);
  gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(item) || 'Shader compilation failed');
  }
  return item;
}

function program(gl) {
  const item = gl.createProgram();
  gl.attachShader(item, shader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(item, shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(item);
  if (!gl.getProgramParameter(item, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(item) || 'WebGL link failed');
  }
  return item;
}

function makeMesh(columns = 72, rows = 72) {
  const values = [];
  for (let y = 0; y < rows; y++) {
    const top = y / rows;
    const bottom = (y + 1) / rows;
    for (let x = 0; x < columns; x++) {
      const left = x / columns;
      const right = (x + 1) / columns;
      values.push(left, top, right, top, left, bottom);
      values.push(right, top, right, bottom, left, bottom);
    }
  }
  return new Float32Array(values);
}

function texture(gl, image, unit) {
  const item = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, item);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return item;
}

function clampVector(vector, maximum) {
  const length = Math.hypot(vector.x, vector.y);
  if (length > maximum) {
    vector.x *= maximum / length;
    vector.y *= maximum / length;
  }
}

async function start() {
  const smile = await loadImage('assets/smile.png');
  const ouch = await loadImage('assets/ouch.png');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return;

  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = smile.naturalWidth;
  hitCanvas.height = smile.naturalHeight;
  const hitContext = hitCanvas.getContext('2d', { willReadFrequently: true });
  hitContext.drawImage(smile, 0, 0);

  const surface = program(gl);
  gl.useProgram(surface);
  const mesh = makeMesh();
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
  const uv = gl.getAttribLocation(surface, 'a_uv');
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
  texture(gl, smile, 0);
  texture(gl, ouch, 1);
  gl.uniform1i(gl.getUniformLocation(surface, 'u_smile'), 0);
  gl.uniform1i(gl.getUniformLocation(surface, 'u_ouch'), 1);
  const grabUniform = gl.getUniformLocation(surface, 'u_grab');
  const pullUniform = gl.getUniformLocation(surface, 'u_pull');
  const radiusUniform = gl.getUniformLocation(surface, 'u_radius');
  const reactionUniform = gl.getUniformLocation(surface, 'u_reaction');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let active = false;
  let activePointer = null;
  let grab = { x: 0.5, y: 0.4 };
  let radius = 0.19;
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };
  let reaction = 0;
  let animation = 0;
  let lastTime = 0;

  function point(event) {
    const rect = portrait.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(grabUniform, grab.x, grab.y);
    gl.uniform2f(pullUniform, current.x, current.y);
    gl.uniform1f(radiusUniform, radius);
    gl.uniform1f(reactionUniform, reaction);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 2);
  }

  function resize() {
    const rect = portrait.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    render();
  }

  function tick(time) {
    animation = 0;
    const dt = Math.min((time - (lastTime || time)) / 1000, 0.04);
    lastTime = time;
    const stiffness = active ? 160 : 120;
    const damping = active ? 19 : 10;
    for (const axis of ['x', 'y']) {
      velocity[axis] += (target[axis] - current[axis]) * stiffness * dt;
      velocity[axis] *= Math.exp(-damping * dt);
      current[axis] += velocity[axis] * dt;
    }
    const distance = Math.hypot(target.x, target.y);
    const desiredReaction = active ? Math.min(1, Math.max(0, (distance - 0.03) * 4.3)) : 0;
    reaction += (desiredReaction - reaction) * Math.min(1, dt * (active ? 14 : 9));
    render();
    const moving = Math.hypot(current.x, current.y, velocity.x * 0.02, velocity.y * 0.02, reaction) > 0.001;
    if (active || moving) animation = requestAnimationFrame(tick);
    else {
      current = { x: 0, y: 0 };
      velocity = { x: 0, y: 0 };
      reaction = 0;
      render();
    }
  }

  function animate() {
    if (!animation) {
      lastTime = 0;
      animation = requestAnimationFrame(tick);
    }
  }

  portrait.addEventListener('pointerdown', (event) => {
    if (active) return;
    const p = point(event);
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
    const x = Math.min(smile.naturalWidth - 1, Math.floor(p.x * smile.naturalWidth));
    const y = Math.min(smile.naturalHeight - 1, Math.floor(p.y * smile.naturalHeight));
    if (hitContext.getImageData(x, y, 1, 1).data[3] < 28) return;
    active = true;
    activePointer = event.pointerId;
    grab = p;
    radius = p.y > 0.6 ? 0.27 : 0.18;
    target = { x: 0, y: 0 };
    velocity = { x: 0, y: 0 };
    portrait.setPointerCapture(event.pointerId);
    animate();
  });

  portrait.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== activePointer) return;
    const p = point(event);
    target = { x: p.x - grab.x, y: p.y - grab.y };
    clampVector(target, 0.7);
    animate();
  });

  function release(event) {
    if (!active || event.pointerId !== activePointer) return;
    active = false;
    activePointer = null;
    target = { x: 0, y: 0 };
    if (portrait.hasPointerCapture(event.pointerId)) portrait.releasePointerCapture(event.pointerId);
    animate();
  }

  portrait.addEventListener('pointerup', release);
  portrait.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => {
    active = false;
    activePointer = null;
    target = { x: 0, y: 0 };
    animate();
  });
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    portrait.classList.remove('ready');
    cancelAnimationFrame(animation);
    animation = 0;
  });
  resize();
  portrait.classList.add('ready');
}

start().catch((error) => {
  console.error('Unable to start the portrait interaction:', error);
  portrait.classList.remove('ready');
});
