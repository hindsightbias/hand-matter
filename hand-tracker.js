// shared.js
function initHandTracking(canvasId, customSetup) {
    const canvas = document.getElementById(canvasId);
    const video = document.createElement("video"); // hidden video for mediapipe
    video.style.display = "none";
    document.body.appendChild(video);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const { Engine, Render, Runner, World, Bodies, Body, Constraint, Composite, Events } = Matter;

    const engine = Engine.create();
    const world = engine.world;

    const render = Render.create({
        canvas: canvas,
        engine: engine,
        options: { width: canvas.width, height: canvas.height, wireframes: false, background: null }
    });
    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    // walls
    const thickness = 100;
    World.add(world, [
        Bodies.rectangle(canvas.width / 2, -thickness / 2, canvas.width, thickness, { isStatic: true }),
        Bodies.rectangle(canvas.width / 2, canvas.height + thickness / 2, canvas.width, thickness, { isStatic: true }),
        Bodies.rectangle(-thickness / 2, canvas.height / 2, thickness, canvas.height, { isStatic: true }),
        Bodies.rectangle(canvas.width + thickness / 2, canvas.height / 2, thickness, canvas.height, { isStatic: true }),
    ]);

    // helper: spawn random shapes
    function spawnRandom(count = 20, scale = 1) {
        const shapes = [];
        for (let i = 0; i < count; i++) {
            const x = 60 + Math.random() * (canvas.width - 120);
            const y = 60 + Math.random() * (canvas.height - 120);
            if (Math.random() < 0.5) {
                const r = (12 + Math.random() * 30) * scale;
                shapes.push(Bodies.circle(x, y, r, { restitution: 0.6, friction: 0.1 }));
            } else {
                const w = (30 + Math.random() * 60) * scale;
                const h = (20 + Math.random() * 50) * scale;
                shapes.push(Bodies.rectangle(x, y, w, h, { restitution: 0.4, friction: 0.2 }));
            }
        }
        World.add(world, shapes);
    }

    // only spawn random shapes if no custom setup is provided
    if (!customSetup) {
        spawnRandom(26, 2);
    }

    // hand body
    const handBody = Bodies.circle(canvas.width / 2, canvas.height / 2, 16, {
        isSensor: true,
        inertia: Infinity,
        collisionFilter: { group: -1 },
        render: { fillStyle: "rgba(99,102,241,0.9)" },
        label: 'hand'
    });
    Body.setMass(handBody, 50);
    World.add(world, handBody);

    const handState = { grabbing: false, constraint: null };

    Events.on(engine, "beforeUpdate", () => {
        Body.setVelocity(handBody, { x: handBody.velocity.x * 0.2, y: handBody.velocity.y * 0.2 });
    });

    // Mediapipe
    const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });

    hands.onResults((results) => {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;
        const lm = results.multiHandLandmarks[0];

        const ix = (1 - lm[4].x) * canvas.width;
        const iy = lm[4].y * canvas.height;
        Body.setPosition(handBody, { x: ix, y: iy });

        const tx = (1 - lm[8].x) * canvas.width;
        const ty = lm[8].y * canvas.height;
        const dist = Math.hypot(tx - ix, ty - iy);
        const grabbing = dist < 60;

        if (grabbing && !handState.grabbing) {
            const bodies = Composite.allBodies(world);
            let target = null, minD = 9999;
            for (const b of bodies) {
                if (b === handBody || b.isStatic) continue;
                const dd = Math.hypot(b.position.x - ix, b.position.y - iy);
                if (dd < 80 && dd < minD) { minD = dd; target = b; }
            }
            if (target) {
                const c = Constraint.create({
                    bodyA: handBody,
                    bodyB: target,
                    pointA: { x: 0, y: 0 },
                    pointB: { x: 0, y: 0 },
                    stiffness: 0.8,
                    damping: 0.4
                });
                World.add(world, c);
                handState.constraint = c;
                handState.grabbing = true;
            } else { handState.grabbing = true; }
        }

        if (!grabbing && handState.grabbing) {
            if (handState.constraint) World.remove(world, handState.constraint);
            handState.constraint = null;
            handState.grabbing = false;
        }
    });

    // ------------------ Confetti effect ------------------
    const confettiCanvas = document.getElementById('confettiCanvas');
    let confettiCtx = null;

    if (confettiCanvas) {
        confettiCanvas.width = canvas.width;
        confettiCanvas.height = canvas.height;
        confettiCtx = confettiCanvas.getContext('2d');

        window.addEventListener('resize', () => {
            confettiCanvas.width = canvas.width;
            confettiCanvas.height = canvas.height;
        });
    }

    window.spawnConfetti = function (x, y, count = 20) {
        if (!confettiCtx) return; // Exit early if no confetti canvas

        const pieces = [];
        const maxLife = 60;

        for (let i = 0; i < count; i++) {
            pieces.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 5,
                vy: Math.random() * -5 - 2,
                size: Math.random() * 8 + 4,
                color: `hsl(${Math.random() * 360},100%, 85%)`,
                life: maxLife
            });
        }

        function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
            let rot = Math.PI / 2 * 3;
            let x = cx;
            let y = cy;
            const step = Math.PI / spikes;

            ctx.beginPath();
            ctx.moveTo(cx, cy - outerRadius);
            for (let i = 0; i < spikes; i++) {
                x = cx + Math.cos(rot) * outerRadius;
                y = cy + Math.sin(rot) * outerRadius;
                ctx.lineTo(x, y);
                rot += step;

                x = cx + Math.cos(rot) * innerRadius;
                y = cy + Math.sin(rot) * innerRadius;
                ctx.lineTo(x, y);
                rot += step;
            }
            ctx.lineTo(cx, cy - outerRadius);
            ctx.closePath();
            ctx.fill();
        }

        const interval = setInterval(() => {
            confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

            pieces.forEach(p => {
                if (p.life <= 0) return;

                const alpha = p.life / maxLife;
                confettiCtx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');

                const scale = 2; // Change this value to adjust confetti size
                drawStar(confettiCtx, p.x, p.y, 5, p.size * scale, (p.size / 2) * scale); // 5-point star

                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.2; // gravity
                p.life--;
            });

            if (pieces.every(p => p.life <= 0)) clearInterval(interval);
        }, 16);
    };
    // ----------------------------------------------------

    // camera
    const camera = new Camera(video, {
        onFrame: async () => { await hands.send({ image: video }); },
        width: 1280,
        height: 720
    });
    camera.start();

    // draw hand indicator
    Events.on(render, "afterRender", () => {
        const ctx = render.context;
        ctx.save();
        ctx.beginPath();
        ctx.arc(handBody.position.x, handBody.position.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = handState.grabbing ? "rgba(236,72,153,0.9)" : "rgba(99,102,241,0.9)";
        ctx.fill();

        if (window.location.pathname.endsWith('hand-matter/math.html')) {
            blocks.forEach((block, index) => {
                const pos = block.position;
                const height = block.bounds.max.y - block.bounds.min.y;

                ctx.save();
                ctx.fillStyle = 'black';
                ctx.font = `${height / 2}px sans-serif`; // font proportional to block size
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((index + 1), pos.x, pos.y); // draw index at block center
                ctx.restore();
            });
        }
        ctx.restore();
    });

    // resize
    window.addEventListener("resize", () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });


    // run page-specific setup
    if (customSetup) customSetup(engine, world, { canvas, spawnRandom, Bodies, World, Events, Render });

    return { engine, world, handBody };
}
