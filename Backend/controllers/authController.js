// ====== TOP OF FILE: Only declare imports ONCE ======
const connectDB = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const oracledb = require("oracledb");
require("dotenv").config();

// ====================================================
// REGISTER CONTROLLER
// ====================================================
const register = async (req, res) => {
    const { user_id, full_name, email, password, role, dept, year } = req.body;

    try {
        // Reuse the stable connection pool from db.js
        const pool = await connectDB();
        const connection = await pool.getConnection();

        // Check if email already exists
        const check = await connection.execute(
            `SELECT email FROM users WHERE email = :email`,
            { email },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (check.rows.length > 0) {
            await connection.close(); // Release connection back to pool
            return res.status(400).json({ message: "Email already registered" });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Insert user row
        await connection.execute(
            `INSERT INTO users (user_id, full_name, email, password_hash, role, dept, year)
             VALUES (:user_id, :full_name, :email, :password_hash, :role, :dept, :year)`,
            { user_id, full_name, email, password_hash, role, dept, year },
            { autoCommit: true }
        );

        await connection.close(); // Always release connection back to pool
        res.status(201).json({ success: true, message: "User registered successfully" });

    } catch (err) {
        console.error("Registration Transaction Error:", err);
        res.status(500).json({ message: "Server error during database insertion." });
    }
};

// ====================================================
// LOGIN CONTROLLER
// ====================================================
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Reuse the stable connection pool from db.js
        const pool = await connectDB();
        const connection = await pool.getConnection();

        // Find user matching credentials
        const result = await connection.execute(
            `SELECT user_id, full_name, email, password_hash, role, dept, year 
             FROM users WHERE email = :email`,
            { email },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        await connection.close(); // Release connection back to pool immediately after reading

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const user = result.rows[0];

        // Check password hash match safely using explicit uppercase Oracle mapping keys
        const isMatch = await bcrypt.compare(password, user.PASSWORD_HASH);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Generate JWT token for dashboard session access authorization tracking updates
        const token = jwt.sign(
            { user_id: user.USER_ID, role: user.ROLE },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                user_id: user.USER_ID,
                full_name: user.FULL_NAME,
                email: user.EMAIL,
                role: user.ROLE,
                dept: user.DEPT,
                year: user.YEAR
            }
        });

    } catch (err) {
        console.error("Login Transaction Error:", err);
        res.status(500).json({ message: "Server error during authentication." });
    }
};

module.exports = { register, login };