This creates a collaborative drawing canvas where people can draw together in real-time, each with their own creature identity and color, all synchronized through a decentralized network- NOSTR!

✅ Ephemeral data: Strokes don't need permanent storage

✅ Real-time: Perfect for WebSocket-based relays

✅ Anonymous: No need for user accounts

✅ Simple data: Just coordinates and colors

✅ Broadcast nature: One stroke → many viewers

✅ No critical data: If messages are lost, it's just art

1. You draw ✏️
   ↓
   
2. Your browser signs the stroke data with your private key 🔐
   ↓
   
3. Sends to 3 relay servers simultaneously 📡
   ↓
   
4. Other users' browsers receive the stroke 📥
   ↓
   
5. They verify the signature and draw it 🎨

Data Flow Example: 

User "Cosmic Blob" draws a circle:
{
  "kind": 30001,
  "pubkey": "npub1abc123...",
  "content": {
    "type": "complete_stroke",
    "points": [{x:100,y:50}, {x:102,y:52}, ...],
    "color": "hsl(240, 75%, 55%)",
    "creatureName": "Cosmic Blob"
  },
  "sig": "signature_proving_authenticity"
}
