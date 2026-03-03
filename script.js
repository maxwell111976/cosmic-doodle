(async function () {
  // Initialize creature identity immediately
  const CREATURE_ADJECTIVES = ["Tiny", "Cosmic", "Glowing", "Sleepy", "Hyper", "Neon", "Shadow", "Quantum", "Fuzzy", "Electric"];
  const CREATURE_SPECIES = ["Blob", "Lizard", "Meteor", "Ghost", "Cat", "Robot", "Slime", "Phoenix", "Jelly", "Sprite"];

  function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomColor() {
    const h = Math.floor(Math.random() * 360);
    const s = 60 + Math.floor(Math.random() * 30);
    const l = 50 + Math.floor(Math.random() * 10);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  const creatureName = `${randomItem(CREATURE_ADJECTIVES)} ${randomItem(CREATURE_SPECIES)}`;
  const creatureColor = randomColor();
  
  const creatureEl = document.getElementById("creature");
  const statusEl = document.getElementById("status");
  
  creatureEl.textContent = `Creature: ${creatureName}`;
  creatureEl.style.color = creatureColor;

  // Initialize canvas immediately
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 40;
    ctx.fillStyle = "#050816";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Set drawing properties for smooth strokes
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Drawing state and functions
  let isDrawing = false;
  let currentStroke = [];
  const brushSize = 6;
  const recentEvents = new Set();

  function getPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: Math.round(clientX - rect.left),
      y: Math.round(clientY - rect.top)
    };
  }

  function drawPath(points, color, size = brushSize) {
    if (points.length < 2) {
      // Single point - draw a dot
      if (points.length === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    
    ctx.stroke();
  }

  // Set up drawing immediately
  statusEl.textContent = "Drawing ready - connecting to network...";
  
  function startDraw(evt) {
    evt.preventDefault();
    isDrawing = true;
    const pos = getPosition(evt);
    currentStroke = [pos];
    
    // Draw starting point immediately
    drawPath([pos], creatureColor);
  }

  function moveDraw(evt) {
    if (!isDrawing) return;
    evt.preventDefault();
    const pos = getPosition(evt);
    
    // Add to current stroke
    currentStroke.push(pos);
    
    // Draw the line segment locally
    if (currentStroke.length >= 2) {
      const lastTwo = currentStroke.slice(-2);
      drawPath(lastTwo, creatureColor);
    }
  }

  function endDraw(evt) {
    evt && evt.preventDefault();
    if (!isDrawing || currentStroke.length === 0) return;
    
    isDrawing = false;
    
    // Send the complete stroke to other users
    publishCompleteStroke(currentStroke, creatureColor, brushSize, creatureName);
    
    currentStroke = [];
  }

  // Attach drawing events immediately
  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", moveDraw);
  canvas.addEventListener("mouseup", endDraw);
  document.addEventListener("mouseup", endDraw);

  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", moveDraw, { passive: false });
  canvas.addEventListener("touchend", endDraw, { passive: false });

  // Nostr setup (non-blocking)
  let sockets = [];
  let connectedRelays = 0;
  let sk, pk;

  // Initialize Nostr in background
  async function initializeNostr() {
    try {
      if (!window.NostrTools) {
        let attempts = 0;
        while (!window.NostrTools && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }

      if (!window.NostrTools) {
        throw new Error("NostrTools failed to load");
      }

      const { generateSecretKey, getPublicKey, finalizeEvent, validateEvent } = window.NostrTools;
      
      if (!generateSecretKey || !getPublicKey || !finalizeEvent) {
        throw new Error("Missing required NostrTools functions");
      }
      
      sk = generateSecretKey(); 
      pk = getPublicKey(sk);

      const RELAYS = [
        "wss://relay.damus.io",
        "wss://nos.lol", 
        "wss://relay.snort.social"
      ];
      const EVENT_KIND = 30001;

      RELAYS.forEach((url, index) => {
        setTimeout(() => {
          connectToRelay(url, EVENT_KIND);
        }, index * 1500);
      });

      setTimeout(() => {
        if (connectedRelays === 0) {
          statusEl.textContent = "Drawing ready (local only)";
        }
      }, 12000);

    } catch (error) {
      console.warn("Nostr initialization failed:", error);
      statusEl.textContent = "Drawing ready (local only)";
    }
  }

  function connectToRelay(url, EVENT_KIND) {
    try {
      const ws = new WebSocket(url);
      
      const timeout = setTimeout(() => {
        ws.close();
      }, 8000);

      ws.onopen = () => {
        clearTimeout(timeout);
        connectedRelays++;
        sockets.push(ws);
        
        statusEl.textContent = `Connected to ${connectedRelays} relay${connectedRelays > 1 ? 's' : ''} - draw together!`;
        
        const subId = "canvas-" + Date.now();
        const filter = { 
          kinds: [EVENT_KIND],
          since: Math.floor(Date.now() / 1000) - 1800,
          limit: 100
        };
        
        try {
          const subscription = JSON.stringify(["REQ", subId, filter]);
          ws.send(subscription);
        } catch (e) {
          console.warn("Failed to send subscription:", e);
        }
      };

      ws.onmessage = (msg) => {
        try {
          if (!msg.data || typeof msg.data !== 'string') return;
          
          const data = JSON.parse(msg.data);
          
          if (!Array.isArray(data) || data.length < 3) return;
          
          if (data[0] === "EVENT") {
            handleIncomingEvent(data[2]);
          }
        } catch (e) {
          // Silently ignore JSON parse errors
        }
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        connectedRelays = Math.max(0, connectedRelays - 1);
        if (connectedRelays === 0) {
          statusEl.textContent = "Drawing ready (local only)";
        } else {
          statusEl.textContent = `Connected to ${connectedRelays} relay${connectedRelays > 1 ? 's' : ''} - draw together!`;
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
      };

    } catch (error) {
      console.warn("Exception connecting to relay:", error);
    }
  }

  // Stroke publishing - send complete strokes
  function publishCompleteStroke(points, color, size, creatureName) {
    if (!sk || connectedRelays === 0) return;
    if (points.length === 0) return;

    try {
      const { finalizeEvent, validateEvent } = window.NostrTools;
      
      if (!finalizeEvent) return;

      // Compress the stroke data - only send every few points for long strokes
      let compressedPoints = points;
      if (points.length > 20) {
        compressedPoints = [];
        const step = Math.ceil(points.length / 15); // Reduce to ~15 points max
        for (let i = 0; i < points.length; i += step) {
          compressedPoints.push(points[i]);
        }
        // Always include the last point
        if (compressedPoints[compressedPoints.length - 1] !== points[points.length - 1]) {
          compressedPoints.push(points[points.length - 1]);
        }
      }

      const content = {
        type: "complete_stroke",
        points: compressedPoints,
        color: color,
        size: size,
        creatureName: creatureName,
        timestamp: Date.now()
      };

      const unsignedEvent = {
        kind: 30001,
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(content)
      };
      
      const event = finalizeEvent(unsignedEvent, sk);

      if (validateEvent && !validateEvent(event)) {
        return;
      }

      recentEvents.add(event.id);
      setTimeout(() => recentEvents.delete(event.id), 5000);

      const msg = JSON.stringify(["EVENT", event]);
      sockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(msg);
          } catch (e) {
            console.warn("Failed to send to relay:", e);
          }
        }
      });
    } catch (error) {
      console.warn("Publish stroke error:", error);
    }
  }

  function handleIncomingEvent(event) {
    try {
      if (!event || event.kind !== 30001) return;
      if (recentEvents.has(event.id)) return;
      if (!event.content || typeof event.content !== 'string') return;

      let data;
      try {
        data = JSON.parse(event.content);
      } catch (e) {
        return;
      }
      
      if (!data || typeof data !== 'object') return;

      if (data.type === "complete_stroke") {
        // Draw the complete stroke
        if (Array.isArray(data.points) && data.points.length > 0) {
          // Validate points
          const validPoints = data.points.filter(p => 
            p && typeof p.x === 'number' && typeof p.y === 'number' &&
            p.x >= 0 && p.y >= 0 && p.x <= canvas.width && p.y <= canvas.height
          );
          
          if (validPoints.length > 0) {
            drawPath(validPoints, data.color || '#ffffff', data.size || 6);
          }
        }
      }
      
    } catch (e) {
      console.warn("Error handling incoming event:", e);
    }
  }

  // Start Nostr initialization
  initializeNostr();

})();
