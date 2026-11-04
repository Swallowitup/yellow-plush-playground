const portrait = document.querySelector('#portrait');
const canvas = document.querySelector('#face');

// A small spring lattice lives in picture coordinates. Each point is tied to
// its neighbours and its original place; the mouse holds a soft cluster of
// points rather than translating the whole image.
const CELLS = 60;
const SIDE = CELLS + 1;
const PAD = 0.38;
const SPACING = (1 + PAD * 2) / CELLS;
const COUNT = SIDE * SIDE;
const TENSION = 1900;
const RETURN = 70;
const FRICTION = 18;
const GRIP = 8500;
const MAX_PULL = 0.55;

const vertexSource = `
  attribute vec2 a_position;
  attribute vec2 a_picture;
  varying vec2 v_picture;
  void main() {
    vec2 page = (a_position + ${PAD.toFixed(2)}) / ${(1 + PAD * 2).toFixed(2)};
    gl_Position = vec4(page.x * 2.0 - 1.0, 1.0 - page.y * 2.0, 0.0, 1.0);
    v_picture = a_picture;
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform sampler2D u_rest;
  uniform sampler2D u_held;
  uniform float u_face;
  varying vec2 v_picture;
  void main() {
    if (v_picture.x < 0.0 || v_picture.x > 1.0 ||
        v_picture.y < 0.0 || v_picture.y > 1.0) discard;
    gl_FragColor = mix(texture2D(u_rest, v_picture),
                       texture2D(u_held, v_picture), u_face);
  }
`;

const home = new Float32Array(COUNT * 2);
const position = new Float32Array(COUNT * 2);
const speed = new Float32Array(COUNT * 2);
const gripWeight = new Float32Array(COUNT);
const pinned = new Uint8Array(COUNT);
const triangles = new Uint16Array(CELLS * CELLS * 6);

for (let y = 0; y < SIDE; y++) {
  for (let x = 0; x < SIDE; x++) {
    const node = y * SIDE + x;
    const u = -PAD + x * SPACING;
    const v = -PAD + y * SPACING;
    home[node * 2] = position[node * 2] = u;
    home[node * 2 + 1] = position[node * 2 + 1] = v;
    pinned[node] = x === 0 || y === 0 || x === CELLS || y === CELLS || v > 1.02 ? 1 : 0;
  }
}

let nextIndex = 0;
for (let y = 0; y < CELLS; y++) {
  for (let x = 0; x < CELLS; x++) {
    const a = y * SIDE + x;
    const b = a + 1;
    const c = a + SIDE;
    const d = c + 1;
    if ((x + y) % 2) triangles.set([a, b, d, a, d, c], nextIndex);
    else triangles.set([a, b, c, b, d, c], nextIndex);
    nextIndex += 6;
  }
}

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'WebGL link failed');
  }
  return program;
}

async function image(path) {
  const item = new Image();
  item.src = path;
  await item.decode();
  return item;
}

function bindTexture(gl, picture, unit) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
}

function limit(vector, maximum) {
  const size = Math.hypot(vector.x, vector.y);
  if (size > maximum) {
    vector.x *= maximum / size;
    vector.y *= maximum / size;
  }
}

async function boot() {
  const resting = await image('assets/smile.png');
  const held = await image('assets/ouch.png');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return;

  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = resting.naturalWidth;
  hitCanvas.height = resting.naturalHeight;
  const hit = hitCanvas.getContext('2d', { willReadFrequently: true });
  hit.drawImage(resting, 0, 0);

  const program = createProgram(gl);
  gl.useProgram(program);
  const pictureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pictureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, home, gl.STATIC_DRAW);
  const pictureLocation = gl.getAttribLocation(program, 'a_picture');
  gl.enableVertexAttribArray(pictureLocation);
  gl.vertexAttribPointer(pictureLocation, 2, gl.FLOAT, false, 0, 0);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, position.byteLength, gl.DYNAMIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
  bindTexture(gl, resting, 0);
  bindTexture(gl, held, 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_rest'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_held'), 1);
  const faceUniform = gl.getUniformLocation(program, 'u_face');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let active = false;
  let pointerId = null;
  let grabbedAt = { x: 0.5, y: 0.4 };
  let desired = { x: 0, y: 0 };
  let expression = 0;
  let frame = 0;
  let previous = 0;

  function point(event) {
    const box = portrait.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  }

  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, position);
    gl.uniform1f(faceUniform, expression);
    gl.drawElements(gl.TRIANGLES, triangles.length, gl.UNSIGNED_SHORT, 0);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const density = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(box.width * density);
    const height = Math.round(box.height * density);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    draw();
  }

  function step(dt) {
    const pull = active ? desired : { x: 0, y: 0 };
    for (let y = 1; y < CELLS; y++) {
      for (let x = 1; x < CELLS; x++) {
        const node = y * SIDE + x;
        if (pinned[node]) continue;
        const i = node * 2;
        for (let axis = 0; axis < 2; axis++) {
          const k = i + axis;
          const laplacian = position[k - 2] + position[k + 2]
            + position[k - SIDE * 2] + position[k + SIDE * 2]
            - 4 * position[k];
          const displaced = position[k] - home[k];
          const target = axis === 0 ? pull.x : pull.y;
          const force = TENSION * laplacian - RETURN * displaced
            - FRICTION * speed[k] + (active ? GRIP * gripWeight[node] * (target - displaced) : 0);
          speed[k] += force * dt;
        }
      }
    }
    for (let node = 0; node < COUNT; node++) {
      if (pinned[node]) continue;
      const i = node * 2;
      position[i] += speed[i] * dt;
      position[i + 1] += speed[i + 1] * dt;
    }
    // Keep adjacent rows and columns in order when a grab crosses the face.
    // The skin may bunch up, but a folded cell should not expose its back.
    const minimum = SPACING * 0.08;
    for (let y = 0; y < SIDE; y++) {
      for (let x = 0; x < CELLS; x++) {
        const left = y * SIDE + x;
        const right = left + 1;
        const a = left * 2;
        const b = right * 2;
        const shortage = minimum - (position[b] - position[a]);
        if (shortage <= 0) continue;
        const share = pinned[left] ? 0 : pinned[right] ? 1 : 0.5;
        if (!pinned[left]) position[a] -= shortage * share;
        if (!pinned[right]) position[b] += shortage * (1 - share);
      }
    }
    for (let x = 0; x < SIDE; x++) {
      for (let y = 0; y < CELLS; y++) {
        const top = y * SIDE + x;
        const bottom = top + SIDE;
        const a = top * 2 + 1;
        const b = bottom * 2 + 1;
        const shortage = minimum - (position[b] - position[a]);
        if (shortage <= 0) continue;
        const share = pinned[top] ? 0 : pinned[bottom] ? 1 : 0.5;
        if (!pinned[top]) position[a] -= shortage * share;
        if (!pinned[bottom]) position[b] += shortage * (1 - share);
      }
    }
  }

  function tick(time) {
    frame = 0;
    const elapsed = Math.min((time - (previous || time)) / 1000, 0.033);
    previous = time;
    const passes = Math.max(1, Math.ceil(elapsed * 180));
    for (let n = 0; n < passes; n++) step(elapsed / passes);
    const desiredFace = active ? Math.min(1, Math.hypot(desired.x, desired.y) * 2.8) : 0;
    expression += (desiredFace - expression) * Math.min(1, elapsed * (active ? 11 : 7));
    draw();

    let energy = expression;
    if (!active) {
      for (let i = 0; i < position.length; i += 12) {
        energy += Math.abs(position[i] - home[i]) + Math.abs(speed[i]) * 0.004;
      }
    }
    if (active || energy > 0.012) frame = requestAnimationFrame(tick);
    else {
      position.set(home);
      speed.fill(0);
      expression = 0;
      draw();
    }
  }

  function animate() {
    if (!frame) {
      previous = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  portrait.addEventListener('pointerdown', (event) => {
    if (active || event.button !== 0) return;
    const p = point(event);
    if (p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) return;
    const x = Math.floor(p.x * hitCanvas.width);
    const y = Math.floor(p.y * hitCanvas.height);
    if (hit.getImageData(x, y, 1, 1).data[3] < 35) return;
    active = true;
    pointerId = event.pointerId;
    grabbedAt = p;
    desired = { x: 0, y: 0 };
    const radius = p.y > 0.65 ? 0.11 : 0.065;
    const spread = radius * radius * 2;
    for (let node = 0; node < COUNT; node++) {
      const dx = home[node * 2] - p.x;
      const dy = home[node * 2 + 1] - p.y;
      gripWeight[node] = Math.exp(-(dx * dx + dy * dy) / spread);
    }
    portrait.setPointerCapture(pointerId);
    portrait.classList.add('grabbing');
    animate();
  });

  portrait.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== pointerId) return;
    const p = point(event);
    desired = { x: p.x - grabbedAt.x, y: p.y - grabbedAt.y };
    limit(desired, MAX_PULL);
    animate();
  });

  function release(event) {
    if (!active || event.pointerId !== pointerId) return;
    active = false;
    pointerId = null;
    desired = { x: 0, y: 0 };
    portrait.classList.remove('grabbing');
    if (portrait.hasPointerCapture(event.pointerId)) portrait.releasePointerCapture(event.pointerId);
    animate();
  }

  portrait.addEventListener('pointerup', release);
  portrait.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => {
    active = false;
    pointerId = null;
    desired = { x: 0, y: 0 };
    portrait.classList.remove('grabbing');
    animate();
  });
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    portrait.classList.remove('ready');
  });
  resize();
  portrait.classList.add('ready');
}

boot().catch((error) => console.error('Could not start the elastic portrait:', error));
