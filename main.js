import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- GLOBAL CONFIGURATION ---
const CONFIG = {
    colors: {
        die: 0x3b82f6,
        floor: 0xf1f5f9,
        text: '#ffffff',
        gold: '#eab308',
        red: '#dc2626',
        dark: '#334155'
    },
    physics: {
        gravity: -50,
        friction: 0.3,
        restitution: 0.5
    },
    radius: 1.5
};

// --- RUNTIME STATE ---
const STATE = {
    scene: null, camera: null, renderer: null, world: null,
    dieBody: null, dieMesh: null,
    logicalFaces: [], // Stores {normal, center, value} for result calculation
    isRolling: false,
    currentSides: 20
};

// --- INIT ---
function init() {
    setupGraphics();
    setupPhysics();
    setupCage();
    spawnDie(20);
    setupInteractions();
    animate();
}

function setupGraphics() {
    const container = document.getElementById('canvas-container');
    
    STATE.scene = new THREE.Scene();
    STATE.scene.background = new THREE.Color(CONFIG.colors.floor);

    STATE.camera = new THREE.PerspectiveCamera(30, 360/500, 0.1, 100);
    STATE.camera.position.set(0, 20, 10);
    STATE.camera.lookAt(0, 0, 0);

    STATE.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    STATE.renderer.setSize(360, 500);
    STATE.renderer.shadowMap.enabled = true;
    STATE.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(STATE.renderer.domElement);

    // Lighting
    STATE.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(5, 15, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024; sun.shadow.mapSize.height = 1024;
    STATE.scene.add(sun);
}

function setupPhysics() {
    STATE.world = new CANNON.World();
    STATE.world.gravity.set(0, CONFIG.physics.gravity, 0);
    
    const mat = new CANNON.Material();
    STATE.world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, CONFIG.physics));
    STATE.sharedMaterial = mat; // Store for reuse
}

function setupCage() {
    // Visual Floor
    const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    STATE.scene.add(floorMesh);

    // Physical Boundaries
    const addPlane = (pos, rot) => {
        const body = new CANNON.Body({ mass: 0, material: STATE.sharedMaterial });
        body.addShape(new CANNON.Plane());
        body.position.copy(pos);
        body.quaternion.setFromEuler(rot.x, rot.y, rot.z);
        STATE.world.addBody(body);
    };
    
    // Floor
    addPlane(new CANNON.Vec3(0,0,0), new CANNON.Vec3(-Math.PI/2, 0, 0));

    // Walls (Box shapes for walls to prevent tunneling)
    const addWall = (x, z, ry) => {
        const body = new CANNON.Body({ mass: 0, material: STATE.sharedMaterial });
        body.addShape(new CANNON.Box(new CANNON.Vec3(10, 10, 1)));
        body.position.set(x, 10, z);
        body.quaternion.setFromEuler(0, ry, 0);
        STATE.world.addBody(body);
    };

    addWall(0, -3.5, 0); // Back
    addWall(0, 3.5, 0);  // Front
    addWall(-5, 0, Math.PI/2); // Left
    addWall(5, 0, Math.PI/2);  // Right
}

// --- GEOMETRY FACTORY ---
function getGeometry(sides, r) {
    switch(sides) {
        case 4: return new THREE.TetrahedronGeometry(r);
        case 6: return new THREE.BoxGeometry(r*1.5, r*1.5, r*1.5);
        case 8: return new THREE.OctahedronGeometry(r);
        case 10: return createD10Geometry(r);
        case 12: return new THREE.DodecahedronGeometry(r);
        case 20: return new THREE.IcosahedronGeometry(r);
        default: return new THREE.IcosahedronGeometry(r);
    }
}

function createD10Geometry(radius) {
    const vertices = [], indices = [];
    const H = radius * 1.2, R = radius * 1.0, h = radius * 0.2;
    
    vertices.push(0, H, 0, 0, -H, 0); // Poles
    for(let i=0; i<5; i++) { // Ring A
        const ang = (i * 72) * Math.PI/180;
        vertices.push(Math.cos(ang)*R, h, Math.sin(ang)*R);
    }
    for(let i=0; i<5; i++) { // Ring B
        const ang = ((i * 72) + 36) * Math.PI/180;
        vertices.push(Math.cos(ang)*R, -h, Math.sin(ang)*R);
    }
    for(let i=0; i<5; i++) {
        const A=2+i, B=7+i, An=2+((i+1)%5), Bn=7+((i+1)%5);
        indices.push(0, B, A,  0, An, B,  1, B, An,  1, An, Bn);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

// --- DICE LOGIC & GENERATION ---
function spawnDie(sides) {
    // 1. Cleanup
    if(STATE.dieBody) STATE.world.removeBody(STATE.dieBody);
    if(STATE.dieMesh) STATE.scene.remove(STATE.dieMesh);
    STATE.logicalFaces = [];
    STATE.currentSides = sides;

    // 2. Create Geometry & Visuals
    const geometry = getGeometry(sides, CONFIG.radius);
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.die, roughness: 0.1, metalness: 0.2, flatShading: true
    });
    STATE.dieMesh = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    STATE.dieMesh.add(mesh);

    // 3. Process Physics & Logic
    const { shape, faces } = processGeometry(geometry, sides);
    STATE.logicalFaces = faces;

    // 4. Create Physics Body
    STATE.dieBody = new CANNON.Body({ mass: 5, shape, material: STATE.sharedMaterial });
    STATE.dieBody.position.set(0, 4, 0);
    STATE.dieBody.quaternion.setFromEuler(Math.random()*6, Math.random()*6, 0);
    
    STATE.world.addBody(STATE.dieBody);
    STATE.scene.add(STATE.dieMesh);

    // 5. Add Labels
    addDecals(STATE.dieMesh, STATE.logicalFaces);
}

function processGeometry(geometry, sides) {
    // D6 Special Case: BoxGeometry is cleaner to define manually
    if(sides === 6) {
        const s = CONFIG.radius * 1.5 / 2;
        return {
            shape: new CANNON.Box(new CANNON.Vec3(s, s, s)),
            faces: [
                { normal: new THREE.Vector3(1,0,0), center: new THREE.Vector3(s,0,0) },
                { normal: new THREE.Vector3(-1,0,0), center: new THREE.Vector3(-s,0,0) },
                { normal: new THREE.Vector3(0,1,0), center: new THREE.Vector3(0,s,0) },
                { normal: new THREE.Vector3(0,-1,0), center: new THREE.Vector3(0,-s,0) },
                { normal: new THREE.Vector3(0,0,1), center: new THREE.Vector3(0,0,s) },
                { normal: new THREE.Vector3(0,0,-1), center: new THREE.Vector3(0,0,-s) }
            ]
        };
    }

    // General Polyhedron Logic
    const pos = geometry.attributes.position;
    const vertices = [], pointsMap = {}, tempFaces = [];
    
    // Extract Unique Vertices
    for(let i=0; i<pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
        if(pointsMap[key] === undefined) {
            pointsMap[key] = vertices.length;
            vertices.push(new CANNON.Vec3(v.x, v.y, v.z));
        }
    }

    // Extract Faces (Triangles)
    const idx = geometry.index ? geometry.index.array : [...Array(pos.count).keys()];
    for(let i=0; i<idx.length; i+=3) {
        tempFaces.push([idx[i], idx[i+1], idx[i+2]]);
    }

    // Convert faces to Cannon format
    const cannonFaces = tempFaces.map(tri => tri.map(i => {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        return pointsMap[`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`];
    }));

    // Analyze Faces to merge coplanar triangles (Logical Faces)
    const logicalFaces = [];
    tempFaces.forEach(tri => {
        const a = new THREE.Vector3().fromBufferAttribute(pos, tri[0]);
        const b = new THREE.Vector3().fromBufferAttribute(pos, tri[1]);
        const c = new THREE.Vector3().fromBufferAttribute(pos, tri[2]);
        const center = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1/3);
        
        const cb = new THREE.Vector3().subVectors(c, b);
        const ab = new THREE.Vector3().subVectors(a, b);
        const normal = new THREE.Vector3().crossVectors(cb, ab).normalize();

        const threshold = (sides === 10) ? 0.95 : 0.99;
        const existing = logicalFaces.find(lf => lf.normal.dot(normal) > threshold);

        if (existing) {
            existing.centerAcc.add(center);
            existing.count++;
        } else {
            logicalFaces.push({ normal: normal.clone(), centerAcc: center.clone(), count: 1 });
        }
    });

    // Finalize Centers
    logicalFaces.forEach(f => f.center = f.centerAcc.divideScalar(f.count));

    return {
        shape: new CANNON.ConvexPolyhedron({ vertices, faces: cannonFaces }),
        faces: logicalFaces
    };
}

function addDecals(group, faces) {
    faces.forEach((data, index) => {
        const num = index + 1;
        data.value = num; // Store value for result checking

        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(num, 32, 32);

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.8),
            new THREE.MeshBasicMaterial({ 
                map: new THREE.CanvasTexture(canvas), 
                transparent: true, 
                polygonOffset: true, polygonOffsetFactor: -1 
            })
        );
        
        plane.position.copy(data.center).add(data.normal.clone().multiplyScalar(0.01));
        plane.lookAt(data.center.clone().add(data.normal));
        group.add(plane);
    });
}

// --- INTERACTION ---
function setupInteractions() {
    // Dice Selectors
    document.querySelectorAll('.die-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.die-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            spawnDie(parseInt(e.target.dataset.sides));
            document.getElementById('result-display').classList.remove('visible');
        });
    });

    // Roll Button
    document.getElementById('roll-btn').addEventListener('click', rollDice);

    // Color Picker
    const drop = document.getElementById('color-dropdown');
    const mainBtn = document.getElementById('current-color-btn');
    
    mainBtn.addEventListener('click', (e) => { e.stopPropagation(); drop.classList.toggle('open'); });
    document.addEventListener('click', () => drop.classList.remove('open'));

    document.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const col = parseInt(e.target.dataset.color);
            const cssCol = e.target.style.background;
            
            CONFIG.colors.die = col;
            mainBtn.style.background = cssCol;
            document.getElementById('roll-btn').style.background = cssCol;
            if(STATE.dieMesh) STATE.dieMesh.children[0].material.color.setHex(col);
            drop.classList.remove('open');
        });
    });
}

function rollDice() {
    if(STATE.isRolling || !STATE.dieBody) return;
    STATE.isRolling = true;
    document.getElementById('roll-btn').disabled = true;
    document.getElementById('result-display').classList.remove('visible');

    // Reset
    STATE.dieBody.position.set(0, 6, 0);
    STATE.dieBody.velocity.set(0,0,0);
    STATE.dieBody.angularVelocity.set(0,0,0);

    // Kick
    const kick = 10, spin = 20;
    STATE.dieBody.applyImpulse(
        new CANNON.Vec3((Math.random()-.5)*kick, -5, (Math.random()-.5)*kick),
        new CANNON.Vec3(0,0,0)
    );
    STATE.dieBody.angularVelocity.set(
        (Math.random()-.5)*spin, (Math.random()-.5)*spin, (Math.random()-.5)*spin
    );

    // Polling for stop
    const interval = setInterval(() => {
        const v = STATE.dieBody.velocity.length();
        const w = STATE.dieBody.angularVelocity.length();
        if(v < 0.1 && w < 0.1 && STATE.dieBody.position.y < 3) {
            clearInterval(interval);
            showResult();
        }
    }, 100);
}

function showResult() {
    STATE.isRolling = false;
    document.getElementById('roll-btn').disabled = false;

    const quat = new THREE.Quaternion().copy(STATE.dieBody.quaternion);
    let bestDot = -Infinity, result = 1;

    // D4 checks for DOWN face, others check for UP face
    const targetDir = (STATE.currentSides === 4) ? new THREE.Vector3(0,-1,0) : new THREE.Vector3(0,1,0);

    STATE.logicalFaces.forEach(f => {
        const dot = f.normal.clone().applyQuaternion(quat).dot(targetDir);
        if(dot > bestDot) { bestDot = dot; result = f.value; }
    });

    const disp = document.getElementById('result-display');
    disp.innerText = result;
    disp.style.color = (result === STATE.currentSides) ? CONFIG.colors.gold : 
                       (result === 1) ? CONFIG.colors.red : CONFIG.colors.dark;
    disp.classList.add('visible');
}

function animate() {
    requestAnimationFrame(animate);
    STATE.world.step(1/60);
    if(STATE.dieBody && STATE.dieMesh) {
        STATE.dieMesh.position.copy(STATE.dieBody.position);
        STATE.dieMesh.quaternion.copy(STATE.dieBody.quaternion);
    }
    STATE.renderer.render(STATE.scene, STATE.camera);
}

init();
