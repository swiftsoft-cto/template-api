import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
<!DOCTYPE html>
<html lang="pt-br" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>API</title>

  <!-- importmap para módulos ES -->
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js",
      "three/": "https://cdn.jsdelivr.net/npm/three@0.155.0/"
    }
  }
  </script>

  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">

  <style>
    :root { --accent: 34,197,94; }
    body, html {
      margin:0; padding:0; overflow:hidden;
      background: radial-gradient(circle at top, #0f172a, #000);
      font-family: 'Orbitron', sans-serif;
    }
    #canvas-container {
      width:100vw; height:100vh;
      display:flex; justify-content:center; align-items:center;
    }
    canvas { display:block; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

    const scene   = new THREE.Scene();
    const camera  = new THREE.PerspectiveCamera(35, innerWidth/innerHeight, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(innerWidth, innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    /* ---------- GEOMETRIA ---------- */
    const w = 2.5, h = 3, d = 0.1;
    const geo = new THREE.BoxGeometry(w, h, d);

    /* ---------- TEXTURA DA FRENTE ---------- */
    function createYuGiOhTexture(opts = {}) {
      const {
        name = 'Swift Soft',
        stars = 8,
        attrColor = '#22C55E',
        typeLine = '[Software Engineer]',
        desc = 'Delivering cutting-edge software solutions.\\nDriven by innovation.',
        atk = 3000,
        def = 2500
      } = opts;

      const cvs = document.createElement('canvas');
      cvs.width = 512; cvs.height = 768;
      const ctx = cvs.getContext('2d');

      /* Fundo e moldura */
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = 'rgb(var(--accent))';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 500, 756);

      /* Faixa do nome */
      ctx.fillStyle = '#cbae86';
      ctx.fillRect(20, 20, 472, 64);
      ctx.font = 'bold 34px Orbitron';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(name.toUpperCase(), 256, 64);

      /* Estrelas */
      for (let i = 0; i < stars; i++) {
        const x = 256 - (stars * 12) + i * 24;
        ctx.beginPath();
        ctx.fillStyle = '#fdfc96';
        for (let s = 0; s < 5; s++) {
          ctx.lineTo(
            x + Math.cos((18 + s * 72) * Math.PI / 180) * 10,
            100 - Math.sin((18 + s * 72) * Math.PI / 180) * 10
          );
          ctx.lineTo(
            x + Math.cos((54 + s * 72) * Math.PI / 180) * 5,
            100 - Math.sin((54 + s * 72) * Math.PI / 180) * 5
          );
        }
        ctx.fill();
      }

      /* Atributo */
      ctx.fillStyle = attrColor;
      ctx.beginPath();
      ctx.arc(464, 56, 20, 0, 2 * Math.PI);
      ctx.fill();
      ctx.font = '20px Orbitron';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('迅', 464, 56);

      /* Área da arte */
      const artX = 50, artY = 120, artW = 412, artH = 280;
      ctx.fillStyle = '#333';
      ctx.fillRect(artX, artY, artW, artH);

      /* SVG exclusivo da FRENTE */
      const frontSvgSource = \`
        <svg xmlns="http://www.w3.org/2000/svg" id="canvas" width="800" height="500"><path d="M 286.3333282470703 93.45832824707031 L 592.3333282470703 92.45832824707031 M 286.3333282470703 93.45832824707031 L 334.3333282470703 142.4583282470703 M 334.3333282470703 142.4583282470703 L 592.3333282470703 142.4583282470703 M 593.3333282470703 92.45832824707031 C 612.3333282470703 100.45832824707031 620.3333282470703 128.4583282470703 593.3333282470703 142.4583282470703 M 297.3333282470703 97.45832824707031 L 592.3333282470703 98.45832824707031 M 302.3333282470703 103.45832824707031 L 338.3333282470703 138.4583282470703 M 343.3333282470703 136.4583282470703 L 591.3333282470703 136.4583282470703 M 595.3333282470703 98.45832824707031 L 603.3333282470703 109.45832824707031 M 603.3333282470703 109.45832824707031 L 604.3333282470703 124.45832824707031 M 604.3333282470703 122.45832824707031 L 595.3333282470703 134.4583282470703 M 594.3333282470703 107.45832824707031 L 316.3333282470703 106.45832824707031 M 596.3333282470703 120.45832824707031 L 330.3333282470703 120.45832824707031 M 588.3333282470703 130.4583282470703 L 340.3333282470703 128.4583282470703 M 384.3333282470703 227.125 L 551.3333282470703 226.125 M 383.3333282470703 227.125 L 334.3333282470703 275.125 M 334.3333282470703 275.125 L 544.3333282470703 276.125 M 541.3333282470703 276.125 C 611.3333282470703 281.125 618.3333282470703 359.125 533.3333282470703 360.125 M 550.3333282470703 226.125 C 712.3333282470703 243.125 665.3333282470703 427.125 517.3333282470703 413.125 M 534.3333282470703 359.125 C 409.3333282470703 360.125 409.3333282470703 360.125 252.3333282470703 360.125 M 528.3333282470703 414.125 L 528.3333282470703 414.125 M 533.3333282470703 414.125 L 201.3333282470703 410.125 M 250.3333282470703 361.125 L 201.3333282470703 409.125 M 254.3333282470703 367.125 L 552.3333282470703 367.125 M 242.3333282470703 380.125 L 554.3333282470703 381.125 M 230.3333282470703 391.125 L 559.3333282470703 391.125 M 220.3333282470703 402.125 L 559.3333282470703 402.125 M 209.3333282470703 406.125 L 217.3333282470703 406.125 M 525.8333358764648 362.4583435058594 L 552.8333358764648 360.4583435058594 M 600.8333358764648 331.4583435058594 L 574.8333358764648 358.4583435058594 M 608.8333358764648 332.4583435058594 L 561.8333358764648 375.4583435058594 M 579.8333358764648 352.4583435058594 L 560.8333358764648 363.4583435058594 M 615.8333358764648 334.4583435058594 L 564.8333358764648 383.4583435058594 M 622.8333358764648 337.4583435058594 L 569.8333358764648 391.4583435058594 M 630.8333358764648 341.4583435058594 L 567.8333358764648 399.4583435058594 M 566.8333358764648 405.4583435058594 L 600.8333358764648 392.4583435058594 M 581.8333358764648 394.4583435058594 L 610.8333358764648 369.4583435058594 M 592.8333358764648 391.4583435058594 L 618.8333358764648 376.4583435058594 M 632.8333358764648 349.4583435058594 L 609.8333358764648 368.4583435058594 M 637.8333358764648 347.4583435058594 L 617.8333358764648 374.4583435058594 M 383.83333587646484 234.45834350585938 L 553.8333358764648 232.45834350585938 M 375.83333587646484 243.45834350585938 L 556.8333358764648 243.45834350585938 M 377.83333587646484 239.45834350585938 L 383.83333587646484 237.45834350585938 M 368.83333587646484 250.45834350585938 L 566.8333358764648 255.45834350585938 M 370.83333587646484 246.45834350585938 L 372.83333587646484 245.45834350585938 M 363.83333587646484 256.4583435058594 L 570.8333358764648 263.4583435058594 M 357.83333587646484 261.4583435058594 L 566.8333358764648 269.4583435058594 M 350.83333587646484 267.4583435058594 L 550.8333358764648 272.4583435058594 M 343.83333587646484 271.4583435058594 L 378.83333587646484 269.4583435058594 M 360.83333587646484 257.4583435058594 L 352.83333587646484 264.4583435058594 M 528.8333358764648 249.45834350585938 L 567.8333358764648 250.45834350585938 M 527.8333358764648 248.45834350585938 L 495.83333587646484 249.45834350585938 M 555.8333358764648 274.4583435058594 L 588.8333358764648 280.4583435058594 M 576.8333358764648 281.4583435058594 L 595.8333358764648 290.4583435058594 M 584.8333358764648 287.4583435058594 L 601.8333358764648 299.4583435058594 M 592.8333358764648 295.4583435058594 L 602.8333358764648 312.4583435058594 M 597.8333358764648 305.4583435058594 L 600.8333358764648 325.4583435058594 M 594.8333358764648 244.45834350585938 L 608.8333358764648 332.4583435058594 M 604.8333358764648 248.45834350585938 L 619.8333358764648 335.4583435058594 M 600.8333358764648 242.45834350585938 L 603.8333358764648 247.45834350585938 M 612.8333358764648 249.45834350585938 L 626.8333358764648 336.4583435058594 M 621.8333358764648 258.4583435058594 L 634.8333358764648 336.4583435058594 M 631.8333358764648 269.4583435058594 L 640.8333358764648 333.4583435058594 M 629.8333358764648 263.4583435058594 L 629.8333358764648 270.4583435058594 M 638.8333358764648 278.4583435058594 L 647.8333358764648 327.4583435058594 M 645.8333358764648 332.4583435058594 L 642.8333358764648 345.4583435058594 M 641.8333358764648 340.4583435058594 L 635.8333358764648 344.4583435058594 M 566.8333358764648 268.4583435058594 L 604.8333358764648 285.4583435058594 M 572.8333358764648 265.4583435058594 L 605.8333358764648 275.4583435058594 M 563.8333358764648 254.45834350585938 L 601.8333358764648 264.4583435058594 M 552.8333358764648 246.45834350585938 L 593.8333358764648 251.45834350585938 M 592.8333358764648 243.45834350585938 L 557.8333358764648 238.45834350585938 M 556.8333358764648 232.45834350585938 L 588.8333358764648 239.45834350585938 M 225.75 92.625 L 334.75 200.625 M 330.75 219.625 L 142.75 406.625 M 201.75 102.625 L 202.75 162.625 M 205.75 173.625 L 239.75 207.625 M 240.75 208.625 L 123.75 325.625 M 118.75 339.625 L 118.75 394.625 M 225.875 93.125 C 219.875 86.125 201.875 88.125 201.875 104.125 M 329.875 220.125 C 338.875 212.125 336.875 203.125 333.875 200.125 M 207.875 175.125 C 200.875 170.125 202.875 163.125 202.875 160.125 M 125.83333587646484 325.125 C 119.83333587646484 328.125 116.83333587646484 332.125 119.83333587646484 345.125 M 119.83333587646484 390.125 C 117.83333587646484 410.125 131.83333587646484 416.125 144.83333587646484 404.125 M 217.39999961853027 96.92500114440918 L 328.3999996185303 207.92500114440918 M 330.3999996185303 207.9250030517578 L 132.39999961853027 402.9250030517578 M 126.39999961853027 333.9250030517578 L 127.39999961853027 398.9250030517578 M 127.39999961853027 333.9250030517578 L 255.39999961853027 207.9250030517578 M 253.39999961853027 209.9250030517578 L 211.39999961853027 166.9250030517578 M 212.39999961853027 98.92500019073486 L 211.39999961853027 159.92500019073486 M 208.39999961853027 100.92500019073486 L 208.39999961853027 112.92500019073486 M 209.39999961853027 115.92500019073486 L 209.39999961853027 125.92500019073486 M 221.39999961853027 115.92500019073486 L 312.3999996185303 209.92500019073486 M 310.3999996185303 210.92500019073486 L 139.39999961853027 377.92500019073486 M 136.39999961853027 383.9250030517578 L 136.39999961853027 383.9250030517578 M 137.39999961853027 343.9250030517578 L 271.3999996185303 211.9250030517578 M 301.3999996185303 203.9250030517578 L 134.39999961853027 361.9250030517578 M 223.39999961853027 132.9250030517578 L 289.3999996185303 201.9250030517578 M 223.39999961853027 149.9250030517578 L 285.3999996185303 210.9250030517578 M 221.39999961853027 161.9250030517578 L 267.3999996185303 209.9250030517578 M 221.39999961853027 141.9250030517578 L 221.39999961853027 141.9250030517578 M 216.3333282470703 105.125 L 216.3333282470703 165.125 M 136.3333282470703 373.125 L 136.3333282470703 373.125" fill="none" stroke="#1b1b1b" stroke-width="16" stroke-linecap="round"/></svg>
        \`;

      const frontImg  = new Image();
      const frontBlob = new Blob([frontSvgSource], { type: 'image/svg+xml;charset=utf-8' });
      const frontURL  = URL.createObjectURL(frontBlob);

      const texture = new THREE.CanvasTexture(cvs);

      frontImg.onload = () => {
        ctx.clearRect(artX, artY, artW, artH);
        ctx.drawImage(frontImg, artX, artY, artW, artH);
        texture.needsUpdate = true;
        URL.revokeObjectURL(frontURL);
      };
      frontImg.src = frontURL;

      /* Caixa de texto */
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(20, 420, 472, 240);
      ctx.font = '20px Orbitron';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(typeLine, 40, 455);

      /* Descrição com quebra de linha */
      const words = desc.split(' ');
      let line = '', y = 485;
      for (const w of words) {
        const testLine = line + w + ' ';
        if (ctx.measureText(testLine).width > 440) {
          ctx.fillText(line, 40, y);
          line = w + ' ';
          y += 24;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 40, y);

      /* ATK / DEF */
      ctx.font = 'bold 28px Orbitron';
      ctx.fillText('ATK/' + atk, 300, 690);
      ctx.fillText('DEF/' + def, 300, 728);

      return texture;
    }

    /* ---------- TEXTURA DAS COSTAS ---------- */
    function createBackTexture() {
      const cvs = document.createElement('canvas');
      cvs.width = 512; cvs.height = 768;
      const ctx = cvs.getContext('2d');

      /* Fundo e moldura */
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = 'rgb(var(--accent))';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 500, 756);

      /* SVG original do verso */
      const backSvgSource = '<svg xmlns="http://www.w3.org/2000/svg" id="canvas" width="55" height="50"><text x="4.75" y="4.625" fill="#ffffff" font-family="Poppins, sans-serif" font-size="20" dominant-baseline="hanging">0101</text><text x="4.75" y="28.625" fill="#ffffff" font-family="Poppins, sans-serif" font-size="20" dominant-baseline="hanging">0011</text><path d="M 146.75 41.125 M 103.75 39.125" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/></svg>';
      
      const backImg  = new Image();
      const backBlob = new Blob([backSvgSource], { type: 'image/svg+xml;charset=utf-8' });
      const backURL  = URL.createObjectURL(backBlob);

      const texture = new THREE.CanvasTexture(cvs);

      backImg.onload = () => {
        const size = 300;
        ctx.drawImage(backImg, (cvs.width - size) / 2, (cvs.height - size) / 2, size, size);
        texture.needsUpdate = true;
        URL.revokeObjectURL(backURL);
      };
      backImg.src = backURL;

      return texture;
    }

    /* ---------- MATERIAIS ---------- */
    const frontMat = new THREE.MeshPhongMaterial({
      map: createYuGiOhTexture(),
      emissive: 0x22C55E,
      emissiveIntensity: 0.2,
      shininess: 120
    });

    const sideMat = new THREE.MeshPhongMaterial({
      color: 0x111827,
      emissive: 0x22C55E,
      emissiveIntensity: 0.1,
      shininess: 100
    });

    const backMat = new THREE.MeshPhongMaterial({
      map: createBackTexture(),
      emissive: 0x22C55E,
      emissiveIntensity: 0.2,
      shininess: 120
    });

    /* ---------- MESH ---------- */
    const card = new THREE.Mesh(geo, [
      sideMat,  // +X
      sideMat,  // -X
      sideMat,  // +Y
      sideMat,  // -Y
      frontMat, // +Z (frente)
      backMat   // -Z (costas)
    ]);
    scene.add(card);

    /* ---------- EFEITOS GLOW / CONTORNOS ---------- */
    const glow = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
      color: 0x22C55E, transparent: true, opacity: 0.15, side: THREE.BackSide
    }));
    glow.scale.multiplyScalar(1.05);
    scene.add(glow);

    const edges = new THREE.EdgesGeometry(geo);
    scene.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x22C55E })));

    /* ---------- ILUMINAÇÃO ---------- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    /* ---------- CONTROLES ---------- */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 10;
    controls.autoRotate  = true;
    controls.autoRotateSpeed = 1;

    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    /* ---------- LOOP ---------- */
    (function animate () {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
  </script>
</body>
</html>
    `;
  }
}
