/* --- 1. IMPORTS & CONFIG --- */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Импорты Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// КОНФИГУРАЦИЯ FIREBASE (Из вашего запроса)
const firebaseConfig = {
    apiKey: "AIzaSyDOaDVzzPjyYm4HWMND2XYWjLy_h4wty5s",
    authDomain: "neuron-ecosystem-2025.firebaseapp.com",
    projectId: "neuron-ecosystem-2025",
    storageBucket: "neuron-ecosystem-2025.firebasestorage.app",
    messagingSenderId: "589834476565",
    appId: "1:589834476565:web:0b28faca1064077add421c",
    measurementId: "G-4D19EM80B0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* --- 2. GLOBAL CONSTANTS --- */
const MOOD_COLORS = {
    'CREATE': 0xFFD700,
    'WORK': 0x4169E1,
    'COMMUTE': 0x32CD32,
    'SLEEP': 0x4B0082,
    'ANXIOUS': 0x808080,
    'ACTIVE': 0xFF4500,
    'DEFAULT': 0x111122 // Базовый цвет темной планеты
};

let currentUser = null;
let userLocation = { lat: 0, lng: 0 }; // По умолчанию экватор/гринвич

/* --- 3. THREE.JS SCENE SETUP --- */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050508, 0.02); // Космический туман

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 18; // Начальное положение

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.5;
controls.enableZoom = true;
controls.minDistance = 12;
controls.maxDistance = 30;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 1.5);
pointLight.position.set(50, 50, 50);
scene.add(pointLight);

const backLight = new THREE.PointLight(0x4444ff, 1); // Синее свечение сзади (атмосфера)
backLight.position.set(-20, 10, -20);
scene.add(backLight);

/* --- 4. THE GLOBE MESH --- */
// Используем Icosahedron для создания мозаичной структуры
const geometry = new THREE.IcosahedronGeometry(5, 12); // Детализация мозаики (12)
const material = new THREE.MeshPhongMaterial({
    color: 0x111122,
    emissive: 0x000011,
    specular: 0x111111,
    shininess: 10,
    flatShading: true, // Важно для вида "кристаллов/мозаики"
    vertexColors: true // Позволяет красить отдельные полигоны
});

// Инициализируем базовые цвета вершин
const count = geometry.attributes.position.count;
const colors = [];
const color = new THREE.Color();

for (let i = 0; i < count; i++) {
    // Небольшая вариативность базового цвета для "живости"
    color.setHex(MOOD_COLORS.DEFAULT);
    color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05); 
    colors.push(color.r, color.g, color.b);
}
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

const globe = new THREE.Mesh(geometry, material);
scene.add(globe);

// Atmosphere Glow (simple outer sphere)
const atmosphereGeo = new THREE.SphereGeometry(5.2, 64, 64);
const atmosphereMat = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.05,
    side: THREE.BackSide
});
const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
scene.add(atmosphere);

/* --- 5. LOGIC: MAPPING DATA TO GLOBE --- */

// Преобразование Lat/Lng в Vector3 на сфере
function latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));

    return new THREE.Vector3(x, y, z);
}

// Зажечь "вспышку" на глобусе в точке
function pulseLocation(lat, lng, moodColorHex) {
    const targetPos = latLngToVector3(lat, lng, 5);
    
    // Находим ближайшие вершины к точке клика
    const positionAttribute = geometry.attributes.position;
    const colorAttribute = geometry.attributes.color;
    const localColor = new THREE.Color(moodColorHex);
    
    // Перебираем вершины (упрощенный поиск для MVP)
    for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(positionAttribute, i);
        vertex.applyMatrix4(globe.matrixWorld); // world coords

        const dist = vertex.distanceTo(targetPos);
        
        // Если вершина близко (в пределах радиуса влияния)
        if (dist < 0.8) { 
            // Смешиваем текущий цвет с новым
            colorAttribute.setXYZ(i, localColor.r, localColor.g, localColor.b);
        }
    }
    colorAttribute.needsUpdate = true;
}

// "Дыхание" глобуса
let time = 0;
function animate() {
    requestAnimationFrame(animate);
    time += 0.005;

    // Вращение
    globe.rotation.y += 0.0005;
    atmosphere.rotation.y += 0.0005;

    // Пульсация
    const scale = 1 + Math.sin(time) * 0.002;
    globe.scale.set(scale, scale, scale);

    controls.update();
    renderer.render(scene, camera);
}
animate();

/* --- 6. FIREBASE & APP LOGIC --- */

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appInterface = document.getElementById('app-interface');
const authForm = document.getElementById('auth-form');
const toggleAuth = document.getElementById('toggle-auth-mode');
const moodButtons = document.querySelectorAll('.mood-btn');
const statsPanel = document.getElementById('stats-panel');
const statsContent = document.getElementById('stats-content');

let isRegistering = false;

// Получение геолокации
function getGeoLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
            },
            () => { console.log("Geo permission denied, using random/default"); }
        );
    }
}

// Auth State Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.classList.add('hidden');
        appInterface.classList.remove('hidden');
        getGeoLocation();
        loadRecentMoods(); // Загрузить состояние планеты
    } else {
        currentUser = null;
        authOverlay.classList.remove('hidden');
        appInterface.classList.add('hidden');
    }
});

// Handle Auth Form
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        if (isRegistering) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        alert(error.message);
    }
});

toggleAuth.addEventListener('click', () => {
    isRegistering = !isRegistering;
    toggleAuth.innerText = isRegistering ? "Вход" : "Регистрация";
    document.querySelector('.auth-card button').innerText = isRegistering ? "Register" : "Connect to Mosaic";
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// Mood Action
moodButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!currentUser) return;
        
        const mood = btn.dataset.mood;
        const color = MOOD_COLORS[mood];

        // 1. Visual Feedback Immediate
        pulseLocation(userLocation.lat, userLocation.lng, color);

        // 2. Save to Firestore
        try {
            await addDoc(collection(db, "statuses"), {
                uid: currentUser.uid,
                mood: mood,
                lat: userLocation.lat,
                lng: userLocation.lng,
                timestamp: serverTimestamp()
            });
            console.log("Mood saved");
        } catch (e) {
            console.error("Error adding document: ", e);
        }
    });
});

// Загрузка последних состояний для раскраски глобуса
async function loadRecentMoods() {
    // Берем последние 100 записей со всего мира
    const q = query(collection(db, "statuses"), orderBy("timestamp", "desc"), limit(100));
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        if(data.lat && data.lng && MOOD_COLORS[data.mood]) {
            pulseLocation(data.lat, data.lng, MOOD_COLORS[data.mood]);
        }
    });
}

/* --- 7. INTERACTION: CLICK ON GLOBE FOR STATS --- */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Клик по глобусу для имитации статистики (Mock Data logic for MVP aesthetics)
document.addEventListener('dblclick', (event) => {
    // В MVP мы не делаем реальный Raycast по полигонам для получения региона,
    // так как это требует сложной гео-математики. 
    // Мы эмулируем получение статистики "в этом регионе".
    
    // Но проверим, попали ли мы вообще по глобусу
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(globe);

    if (intersects.length > 0) {
        showStats();
    }
});

function showStats() {
    // Генерация красивых фейковых цифр для MVP атмосферы
    // В реальном проекте здесь был бы сложный запрос к Firestore с Geo-хешами
    const stats = {
        WORK: Math.floor(Math.random() * 40) + 20,
        COMMUTE: Math.floor(Math.random() * 20) + 10,
        CREATE: Math.floor(Math.random() * 15) + 5,
        ANXIOUS: Math.floor(Math.random() * 10) + 2
    };

    let html = '';
    for (const [key, val] of Object.entries(stats)) {
        html += `
            <div class="stat-row">
                <span style="color: #${MOOD_COLORS[key].toString(16)}">${key}</span>
                <span>${val}%</span>
            </div>
        `;
    }
    statsContent.innerHTML = html;
    statsPanel.classList.add('active');
    statsPanel.style.display = 'flex';
}

document.getElementById('close-stats').addEventListener('click', () => {
    statsPanel.classList.remove('active');
    setTimeout(() => { statsPanel.style.display = 'none'; }, 300);
});
