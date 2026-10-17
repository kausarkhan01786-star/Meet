import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export default function WorldScene({ softened = false }) {
  const hostRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setFallback(true);
      return;
    }
    let active = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.35, 6.8);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x080b10, 0);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive rotating Earth",
    );
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.4;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = Math.PI - 0.5;
    const world = new THREE.Group();
    world.rotation.set(0.12, -1.35, -0.18);
    scene.add(world);
    const geometry = new THREE.SphereGeometry(1.9, 80, 64);
    const material = new THREE.MeshPhongMaterial({
      color: 0x839ca9,
      shininess: 9,
      specular: 0x264f68,
    });
    const earth = new THREE.Mesh(geometry, material);
    world.add(earth);
    const texture = new THREE.TextureLoader().load("/earth-day.jpg", (map) => {
      if (!active) {
        map.dispose();
        return;
      }
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      material.map = map;
      material.color.set(0xc2d1df);
      material.needsUpdate = true;
      renderer.domElement.dataset.texture = "loaded";
      renderer.render(scene, camera);
    });
    scene.add(new THREE.AmbientLight(0xa5b9e2, 1.5));
    const keyLight = new THREE.DirectionalLight(0xe4ebff, 3);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x83b6cb, 2);
    rimLight.position.set(4, -1, -2);
    scene.add(rimLight);
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x88b0bd,
      transparent: true,
      opacity: 0.1,
    });
    const grid = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1.906, 36, 18)),
      gridMaterial,
    );
    world.add(grid);
    const surface = (latitude, longitude, radius = 1.93) => {
      const latitudeRadians = (latitude * Math.PI) / 180;
      const longitudeRadians = (longitude * Math.PI) / 180;
      return new THREE.Vector3(
        -radius * Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
        radius * Math.sin(latitudeRadians),
        radius * Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
      );
    };
    const places = [
      [40.7, -74],
      [51.5, -0.1],
      [23.8, 90.4],
      [35.7, 139.7],
      [-33.9, 151.2],
      [1.3, 103.8],
      [-23.5, -46.6],
    ];
    const connectionMaterial = new THREE.LineBasicMaterial({
      color: 0xc9efbd,
      transparent: true,
      opacity: 0.45,
    });
    const pulseGeometry = new THREE.SphereGeometry(0.019, 8, 8);
    const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xdbf7c5 });
    const pulses = [];
    places.forEach((place, index) => {
      const start = surface(...place);
      const finish = surface(...places[(index + 2) % places.length]);
      const middle = start.clone().add(finish).normalize().multiplyScalar(2.8);
      const curve = new THREE.QuadraticBezierCurve3(start, middle, finish);
      world.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)),
          connectionMaterial,
        ),
      );
      const marker = new THREE.Mesh(pulseGeometry, pulseMaterial);
      marker.position.copy(start);
      world.add(marker);
      const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
      world.add(pulse);
      pulses.push({ mesh: pulse, curve, offset: index / places.length });
    });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const clock = new THREE.Clock();
    const drawScene = () => {
      renderer.render(scene, camera);
      renderer.domElement.dataset.camera = camera.position
        .toArray()
        .map((value) => value.toFixed(3))
        .join(",");
    };
    controls.addEventListener("change", drawScene);
    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();
      if (!reduced) {
        world.rotation.y += 0.0008;
        for (const pulse of pulses)
          pulse.mesh.position.copy(
            pulse.curve.getPointAt((elapsed * 0.06 + pulse.offset) % 1),
          );
      }
      controls.update();
      drawScene();
      renderer.domElement.dataset.ready = "true";
      renderer.domElement.dataset.rotation = world.rotation.y.toFixed(4);
    };
    renderFrame();
    renderer.setAnimationLoop(renderFrame);
    const lost = (event) => {
      event.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      active = false;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      controls.removeEventListener("change", drawScene);
      texture.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose();
      });
      material.dispose();
      gridMaterial.dispose();
      connectionMaterial.dispose();
      pulseMaterial.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className={`world-scene ${softened ? "is-softened" : ""}`}>
      <div className="world-canvas" ref={hostRef} />
      {fallback && (
        <img className="world-fallback" src="/earth-day.jpg" alt="Earth" />
      )}
      <div className="world-vignette" />
    </div>
  );
}
