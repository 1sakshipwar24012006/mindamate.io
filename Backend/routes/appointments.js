// ============================================================
//  routes/appointments.js
//  Handles: book appointment → Oracle DB → send email
// ============================================================

const express  = require("express");
const router   = express.Router();
const connectDB = require("../db");
const nodemailer = require("nodemailer");

// ── email transporter (Gmail SMTP) ──────────────────────────
// Set your Gmail address and App Password in .env:
//   MAIL_USER=yourgmail@gmail.com
//   MAIL_PASS=your_app_password   ← generate at myaccount.google.com → Security → App Passwords
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ── counselor email map ──────────────────────────────────────
// Add the real email of each counselor here
const counselorEmails = {
  "Dr. Priya Sharma":  process.env.COUNSELOR_PRIYA  || "priya.sharma@mitaoe.ac.in",
  "Mr. Rahul Desai":   process.env.COUNSELOR_RAHUL  || "rahul.desai@mitaoe.ac.in",
  "Dr. Neha Kulkarni": process.env.COUNSELOR_NEHA   || "neha.kulkarni@mitaoe.ac.in",
  "Ms. Ananya Joshi":  process.env.COUNSELOR_ANANYA || "ananya.joshi@mitaoe.ac.in",
};

// ── helper: send notification emails ────────────────────────
async function sendAppointmentEmails({ studentName, studentEmail, counselorName, apptDate, apptTime, sessionMode }) {
  const counselorEmail = counselorEmails[counselorName];

  // 1. Email to the counselor (admin/doctor)
  const counselorMail = {
    from: `"MindMate System" <${process.env.MAIL_USER}>`,
    to: counselorEmail,
    subject: `New Appointment Booked — ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden">
        <div style="background:#085041;padding:24px 28px">
          <h2 style="color:#9FE1CB;margin:0;font-size:20px">🧠 MindMate</h2>
          <p style="color:#5DCAA5;margin:4px 0 0;font-size:13px">Mental Health Support Portal</p>
        </div>
        <div style="padding:28px">
          <h3 style="color:#085041;margin-top:0">New Appointment Notification</h3>
          <p style="font-size:14px;color:#444">Dear <strong>${counselorName}</strong>,</p>
          <p style="font-size:14px;color:#444">A student has booked a counseling session with you.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
            <tr style="background:#E1F5EE"><td style="padding:10px 14px;font-weight:500;color:#085041;border-radius:4px">Student Name</td><td style="padding:10px 14px">${studentName}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:500;color:#085041">Student Email</td><td style="padding:10px 14px">${studentEmail}</td></tr>
            <tr style="background:#E1F5EE"><td style="padding:10px 14px;font-weight:500;color:#085041">Date</td><td style="padding:10px 14px">${apptDate}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:500;color:#085041">Time</td><td style="padding:10px 14px">${apptTime}</td></tr>
            <tr style="background:#E1F5EE"><td style="padding:10px 14px;font-weight:500;color:#085041">Mode</td><td style="padding:10px 14px">${sessionMode}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:13px;color:#888">Please log in to the MindMate admin panel to confirm or reschedule.</p>
        </div>
      </div>
    `,
  };

  // 2. Confirmation email to the student
  const studentMail = {
    from: `"MindMate" <${process.env.MAIL_USER}>`,
    to: studentEmail,
    subject: `Appointment Confirmed — ${counselorName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden">
        <div style="background:#085041;padding:24px 28px">
          <h2 style="color:#9FE1CB;margin:0;font-size:20px">🧠 MindMate</h2>
          <p style="color:#5DCAA5;margin:4px 0 0;font-size:13px">Mental Health Support Portal</p>
        </div>
        <div style="padding:28px">
          <h3 style="color:#085041;margin-top:0">Your Appointment is Booked ✓</h3>
          <p style="font-size:14px;color:#444">Hi <strong>${studentName}</strong>,</p>
          <p style="font-size:14px;color:#444">Your counseling session has been successfully booked.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
            <tr style="background:#E1F5EE"><td style="padding:10px 14px;font-weight:500;color:#085041;border-radius:4px">Counselor</td><td style="padding:10px 14px">${counselorName}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:500;color:#085041">Date</td><td style="padding:10px 14px">${apptDate}</td></tr>
            <tr style="background:#E1F5EE"><td style="padding:10px 14px;font-weight:500;color:#085041">Time</td><td style="padding:10px 14px">${apptTime}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:500;color:#085041">Mode</td><td style="padding:10px 14px">${sessionMode}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:13px;color:#888">If you need to reschedule, please log in to MindMate or contact your counselor directly.</p>
          <p style="margin-top:8px;font-size:13px;color:#888">Take care 💚</p>
        </div>
      </div>
    `,
  };

  // send both — don't crash booking if email fails
  try {
  await transporter.sendMail(counselorMail);
  console.log("✅ Counselor email sent successfully!");
} catch(e) {
  console.error("❌ Counselor email failed:", e.message);
}

try {
  await transporter.sendMail(studentMail);
  console.log("✅ Student email sent successfully!");
} catch(e) {
  console.error("❌ Student email failed:", e.message);
}
}

// ============================================================
//  POST /api/appointments/book
//  Body: { user_id, student_name, student_email,
//          counselor_name, appt_date, appt_time, session_mode }
// ============================================================
router.post("/book", async (req, res) => {
  let connection;
  try {
    const {
      user_id,
      student_name,
      student_email,
      counselor_name,
      appt_date,
      appt_time,
      session_mode,
    } = req.body;

    // validate required fields
    if (!user_id || !counselor_name || !appt_date || !appt_time) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    connection = await connectDB();

    // generate appointment id using sequence
    const seqResult = await connection.execute(`SELECT appt_seq.NEXTVAL FROM DUAL`);
   const apptId = seqResult.rows[0][0];

    // insert into Oracle appointments table
   await connection.execute(
  `INSERT INTO appointments
     (appt_id, user_id, counselor_name, student_email,
      appt_date, appt_time, session_mode, status, created_at)
   VALUES
     (:appt_id, :user_id, :counselor_name, :student_email,
      TO_DATE(:appt_date, 'YYYY-MM-DD'), :appt_time,
      :session_mode, 'pending', CURRENT_TIMESTAMP)`,

  {
    appt_id:        apptId,
    user_id:        user_id,
    counselor_name: counselor_name,
    student_email:  student_email,
    appt_date:      appt_date,
    appt_time:      appt_time,
    session_mode:   session_mode || "Online",
  },

  { autoCommit: true }
);

    // NO email sent here — counselor email is sent only when admin confirms

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully!",
      appt_id: apptId,
    });

  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ success: false, message: "Failed to book appointment: " + err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// ============================================================
//  GET /api/appointments/all
//  Admin: fetch all appointments from Oracle
// ============================================================
router.get("/all", async (req, res) => {
  let connection;
  try {
    connection = await connectDB();
    const result = await connection.execute(
      `SELECT a.appt_id, a.user_id, u.full_name as student_name, u.email as student_email,
              a.counselor_name, TO_CHAR(a.appt_date,'YYYY-MM-DD') as appt_date,
              a.appt_time, a.session_mode, a.status,
              TO_CHAR(a.created_at,'YYYY-MM-DD HH24:MI') as created_at
       FROM   appointments a
       LEFT JOIN users u ON a.user_id = u.user_id
       ORDER BY a.created_at DESC`
    );

    const cols = result.metaData.map(c => c.name.toLowerCase());
    const rows = result.rows.map(r => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = r[i]);
      return obj;
    });

    res.json({ success: true, appointments: rows });
  } catch (err) {
    console.error("Fetch all appointments error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// ============================================================
//  GET /api/appointments/student/:user_id
//  Student: fetch their own appointments
// ============================================================
router.get("/student/:user_id", async (req, res) => {
  let connection;
  try {
    connection = await connectDB();
    const result = await connection.execute(
      `SELECT appt_id, counselor_name,
              TO_CHAR(appt_date,'YYYY-MM-DD') as appt_date,
              appt_time, session_mode, status
       FROM   appointments
       WHERE  user_id = :user_id
       ORDER BY created_at DESC`,
      { user_id: req.params.user_id }
    );

    const cols = result.metaData.map(c => c.name.toLowerCase());
    const rows = result.rows.map(r => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = r[i]);
      return obj;
    });

    res.json({ success: true, appointments: rows });
  } catch (err) {
    console.error("Fetch student appointments error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

// ============================================================
//  PATCH /api/appointments/status
//  Admin: update appointment status
//  Body: { appt_id, status }  (status: confirmed/completed/cancelled)
// ============================================================
router.patch("/status", async (req, res) => {
  let connection;
  try {
    const { appt_id, status } = req.body;
    if (!appt_id || !status) {
      return res.status(400).json({ success: false, message: "appt_id and status required." });
    }

    connection = await connectDB();
    await connection.execute(
      `UPDATE appointments SET status = :status WHERE appt_id = :appt_id`,
      { status, appt_id },
      { autoCommit: true }
    );

    // ── Send counselor email ONLY when admin confirms ──────────
    if (status === "confirmed") {
      const apptResult = await connection.execute(
        `SELECT u.full_name as student_name, a.student_email,
                a.counselor_name,
                TO_CHAR(a.appt_date,'YYYY-MM-DD') as appt_date,
                a.appt_time, a.session_mode
         FROM   appointments a
         LEFT JOIN users u ON a.user_id = u.user_id
         WHERE  a.appt_id = :appt_id`,
        { appt_id }
      );

      if (apptResult.rows.length > 0) {
        const cols = apptResult.metaData.map(c => c.name.toLowerCase());
        const row  = {};
        cols.forEach((c, i) => row[c] = apptResult.rows[0][i]);

        sendAppointmentEmails({
          studentName:   row.student_name  || "Student",
          studentEmail:  row.student_email || "",
          counselorName: row.counselor_name,
          apptDate:      row.appt_date,
          apptTime:      row.appt_time,
          sessionMode:   row.session_mode  || "Online",
        });
      }
    }

    res.json({ success: true, message: "Status updated." });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;