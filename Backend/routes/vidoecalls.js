// ============================================================
//  routes/videocall.js
//  REST endpoints for video call room management
//  (WebRTC signalling is handled via Socket.io in server.js)
// ============================================================

const express   = require("express");
const router    = express.Router();
const connectDB = require("../db");

// ── Generate a simple unique room ID ────────────────────────
function makeRoomId() {
  return "mm-" + Math.random().toString(36).slice(2, 8) +
         "-"   + Math.random().toString(36).slice(2, 8);
}

// ============================================================
//  POST /api/videocall/create-room
//  Called when admin confirms an appointment with session_mode
//  = 'Online'. Stores the room_id on the appointment row.
//  Body: { appt_id }
// ============================================================
router.post("/create-room", async (req, res) => {
  const { appt_id } = req.body;
  if (!appt_id)
    return res.status(400).json({ success: false, message: "appt_id required" });

  const roomId = makeRoomId();
  let connection;
  try {
    connection = await connectDB();
    await connection.execute(
      `UPDATE appointments SET room_id = :room_id WHERE appt_id = :appt_id`,
      { room_id: roomId, appt_id },
      { autoCommit: true }
    );
    res.json({ success: true, room_id: roomId });
  } catch (err) {
    console.error("create-room error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// ============================================================
//  GET /api/videocall/room/:appt_id
//  Returns the room_id for a given appointment (used by both
//  student and counselor to know which room to join).
// ============================================================
router.get("/room/:appt_id", async (req, res) => {
  let connection;
  try {
    connection = await connectDB();
    const result = await connection.execute(
      `SELECT room_id, status, session_mode FROM appointments WHERE appt_id = :appt_id`,
      { appt_id: req.params.appt_id }
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Appointment not found" });

    const [room_id, status, session_mode] = result.rows[0];

    if (session_mode !== "Online")
      return res.status(400).json({ success: false, message: "This appointment is not online" });

    if (!room_id)
      return res.status(400).json({ success: false, message: "Room not created yet. Wait for admin confirmation." });

    res.json({ success: true, room_id, status });
  } catch (err) {
    console.error("get-room error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;