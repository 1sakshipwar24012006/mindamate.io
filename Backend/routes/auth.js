const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const connectDB = require("../db");

const SECRET = process.env.JWT_SECRET || "mindmate_secret_key";

// ── REGISTER ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
    let connection;
    try {
        connection = await connectDB();
        // Added 'role' to destruction so you can handle custom sign-ups if needed, 
        // defaulting to 'student' if none is passed.
        const { user_id, full_name, email, password, role } = req.body;
        const assignedRole = role ? role.toLowerCase().trim() : 'student';

        await connection.execute(
            `INSERT INTO users (user_id, full_name, email, password_hash, role)
             VALUES (:user_id, :full_name, :email, :password, :role)`,
            { user_id, full_name, email, password, role: assignedRole },
            { autoCommit: true }
        );

        res.status(201).json({ success: true, message: "User Registered Successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Registration Failed" });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (_) {}
        }
    }
});

// ── LOGIN ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
    let connection;
    try {
        connection = await connectDB();
        const { email, password } = req.body;

        const result = await connection.execute(
            `SELECT user_id, full_name, email, role, dept, study_year
             FROM users
             WHERE LOWER(TRIM(email))    = LOWER(TRIM(:email))
               AND TRIM(password_hash)  = TRIM(:password)`,
            { email, password }
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid Email or Password" });
        }

        const row = result.rows[0];

        // ── CRITICAL FIX: Sanitize the role retrieved from Oracle DB ──
        const cleanRole = row[3] ? row[3].toLowerCase().trim() : "student";

        const user = {
            user_id:   row[0],
            full_name: row[1],
            email:     row[2],
            role:      cleanRole, // 'student' or 'admin' cleanly parsed
            dept:      row[4] || "CSE",
            year:      row[5] || "2"
        };

        // ── Generate a real JWT so requireAdmin can verify it ──
        const token = jwt.sign(
            {
                user_id:   user.user_id,
                full_name: user.full_name,
                email:     user.email,
                role:      user.role // Matches requireAdmin string checks perfectly
            },
            SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            success: true,
            message: "Login Successful",
            token,
            user
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (_) {}
        }
    }
});

module.exports = router;