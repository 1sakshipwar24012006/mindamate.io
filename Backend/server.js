const express   = require("express");
const cors      = require("cors");
const connectDB = require("./db");
require("dotenv").config();

const app = express();

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Helper: get a connection safely ──────────────────────────
async function getConn() {
    const conn = await connectDB();
    if (!conn || typeof conn.execute !== "function") {
        throw new Error("connectDB() did not return a valid connection. Check db.js.");
    }
    return conn;
}

// ── Middleware: verify JWT / role ─────────────────────────────
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "mindmate_secret_key";

function requireAdmin(req, res, next) {
    try {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace("Bearer ", "").trim();
        if (!token) return res.status(401).json({ success: false, message: "No token provided" });

        // Properly verify the JWT signature and expiry
        const payload = jwt.verify(token, JWT_SECRET);

        if (payload.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admins only" });
        }
        req.user = payload;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
}

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth",         require("./routes/auth"));
app.use("/api/appointments", require("./routes/appointments"));

try {
    app.use("/api/chat", require("./routes/chat"));
} catch (e) {
    console.warn("chat route not found, skipping.");
}

// ═════════════════════════════════════════════════════════════
//  STUDENTS  (Admin only)
// ═════════════════════════════════════════════════════════════
app.get("/api/students/all", requireAdmin, async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT
                 u.user_id,
                 u.full_name,
                 u.email,
                 NVL(u.dept, 'N/A')  AS dept,
                 NVL(u.year, 1)       AS year,
                 (SELECT ml.mood FROM mood_logs ml
                  WHERE  ml.user_id = u.user_id
                  ORDER  BY ml.logged_at DESC
                  FETCH  FIRST 1 ROW ONLY) AS latest_mood,
                 (SELECT pr.score FROM phq_results pr
                  WHERE  pr.user_id = u.user_id
                  ORDER  BY pr.taken_at DESC
                  FETCH  FIRST 1 ROW ONLY) AS phq_score,
                 (SELECT pr.severity FROM phq_results pr
                  WHERE  pr.user_id = u.user_id
                  ORDER  BY pr.taken_at DESC
                  FETCH  FIRST 1 ROW ONLY) AS severity,
                 TO_CHAR(
                     GREATEST(
                         NVL((SELECT MAX(ml2.logged_at) FROM mood_logs ml2 WHERE ml2.user_id = u.user_id), u.created_at),
                         u.created_at
                     ), 'DD-Mon-YY'
                 ) AS last_active,
                 CASE
                     WHEN (SELECT pr2.score FROM phq_results pr2
                           WHERE pr2.user_id = u.user_id
                           ORDER BY pr2.taken_at DESC
                           FETCH FIRST 1 ROW ONLY) >= 15 THEN 1
                     ELSE 0
                 END AS is_flagged
             FROM  users u
             WHERE u.role = 'student'
             ORDER BY u.created_at DESC
             FETCH FIRST 200 ROWS ONLY`
        );

        if (!result || !result.rows) {
            return res.status(500).json({ success: false, message: "No data returned from DB" });
        }

        const students = result.rows.map(r => ({
            user_id:     r[0],
            full_name:   r[1],
            email:       r[2],
            dept:        r[3],
            year:        r[4],
            latest_mood: r[5] || "No data",
            phq_score:   (r[6] !== null && r[6] !== undefined) ? r[6] : null,
            severity:    r[7] || "N/A",
            last_active: r[8],
            is_flagged:  r[9] === 1
        }));

        res.json({ success: true, students, total: students.length });
    } catch (e) {
        console.error("STUDENTS ALL ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ─── UPDATE USER PROFILE ──────────────────────────────────────
app.put("/api/users/update", async (req, res) => {
    const { user_id, full_name, dept } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: "user_id required" });
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `UPDATE users SET full_name = :1, dept = :2 WHERE user_id = :3`,
            [full_name, dept || "N/A", user_id],
            { autoCommit: true }
        );
        res.json({ success: true, message: "Profile updated." });
    } catch (e) {
        console.error("USER UPDATE ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  MOOD LOGS
// ═════════════════════════════════════════════════════════════
app.post("/api/mood", async (req, res) => {
    const { user_id, mood, note } = req.body;
    if (!user_id || !mood)
        return res.status(400).json({ success: false, message: "user_id and mood required" });
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `INSERT INTO mood_logs (user_id, mood, note) VALUES (:1, :2, :3)`,
            [user_id, mood, note || null],
            { autoCommit: true }
        );
        try {
            await conn.execute(
                `INSERT INTO notifications (user_id, message) VALUES (:1, :2)`,
                [user_id, "Mood logged: " + mood],
                { autoCommit: true }
            );
        } catch (ne) { console.warn("Notification insert skipped:", ne.message); }
        res.json({ success: true, message: "Mood saved." });
    } catch (e) {
        console.error("MOOD POST ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.get("/api/mood/:user_id", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT log_id, mood,
                    DBMS_LOB.SUBSTR(note, 300, 1) AS note,
                    TO_CHAR(logged_at, 'DD-Mon-YY HH:MI AM') AS logged_at
             FROM mood_logs
             WHERE user_id = :1
             ORDER BY logged_at DESC
             FETCH FIRST 20 ROWS ONLY`,
            [req.params.user_id]
        );
        const rows = result.rows.map(r => ({
            log_id: r[0], mood: r[1], note: r[2], logged_at: r[3]
        }));
        res.json({ success: true, logs: rows });
    } catch (e) {
        console.error("MOOD GET ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  PHQ RESULTS
// ═════════════════════════════════════════════════════════════
app.post("/api/phq", async (req, res) => {
    const { user_id, score, severity, answers } = req.body;
    if (!user_id || score === undefined)
        return res.status(400).json({ success: false, message: "user_id and score required" });
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `INSERT INTO phq_results (user_id, score, severity, answers)
             VALUES (:1, :2, :3, :4)`,
            [user_id, score, severity || null,
             answers ? JSON.stringify(answers).substring(0, 200) : null],
            { autoCommit: true }
        );
        try {
            await conn.execute(
                `INSERT INTO notifications (user_id, message) VALUES (:1, :2)`,
                [user_id, "PHQ-9 result saved - Score: " + score + " (" + severity + ")"],
                { autoCommit: true }
            );
        } catch (ne) { console.warn("Notification insert skipped:", ne.message); }
        res.json({ success: true, message: "PHQ result saved." });
    } catch (e) {
        console.error("PHQ ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.get("/api/phq/:user_id", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT result_id, score, severity,
                    TO_CHAR(taken_at, 'DD-Mon-YY HH:MI AM') AS taken_at
             FROM phq_results
             WHERE user_id = :1
             ORDER BY taken_at DESC
             FETCH FIRST 5 ROWS ONLY`,
            [req.params.user_id]
        );
        const rows = result.rows.map(r => ({
            result_id: r[0], score: r[1], severity: r[2], taken_at: r[3]
        }));
        res.json({ success: true, results: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  JOURNAL ENTRIES
// ═════════════════════════════════════════════════════════════
app.post("/api/journal", async (req, res) => {
    const { user_id, title, body } = req.body;
    if (!user_id || !title || !body)
        return res.status(400).json({ success: false, message: "user_id, title and body required" });
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `INSERT INTO journal_entries (user_id, title, body)
             VALUES (:1, :2, :3)`,
            [user_id, title, body],
            { autoCommit: true }
        );
        res.json({ success: true, message: "Journal entry saved." });
    } catch (e) {
        console.error("JOURNAL ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.get("/api/journal/:user_id", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT entry_id, title,
                    DBMS_LOB.SUBSTR(body, 200, 1) AS preview,
                    TO_CHAR(created_at, 'DD Mon YYYY') AS created_at
             FROM journal_entries
             WHERE user_id = :1
             ORDER BY created_at DESC
             FETCH FIRST 20 ROWS ONLY`,
            [req.params.user_id]
        );
        const rows = result.rows.map(r => ({
            entry_id: r[0], title: r[1], preview: r[2], created_at: r[3]
        }));
        res.json({ success: true, entries: rows });
    } catch (e) {
        console.error("JOURNAL GET ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  FORUM POSTS  ← FIXED: replaced FETCH FIRST with ROWNUM
// ═════════════════════════════════════════════════════════════
app.get("/api/forum/posts", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            // ── FIX: wrap in outer SELECT + use ROWNUM to avoid ORA-00933 ──
            `SELECT * FROM (
                SELECT p.post_id,
                       p.anon_handle,
                       DBMS_LOB.SUBSTR(p.content, 500, 1) AS content,
                       p.likes,
                       NVL(r.reply_count, 0) AS replies,
                       TO_CHAR(p.created_at, 'DD-Mon-YY HH:MI AM') AS created_at,
                       p.is_flagged
                FROM forum_posts p
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS reply_count
                    FROM forum_replies
                    GROUP BY post_id
                ) r ON r.post_id = p.post_id
                ORDER BY p.created_at DESC
            ) WHERE ROWNUM <= 50`
        );
        const posts = result.rows.map(r => ({
            post_id:     r[0],
            anon_handle: r[1],
            content:     r[2],
            likes:       r[3],
            replies:     r[4],
            created_at:  r[5],
            is_flagged:  r[6]
        }));
        res.json({ success: true, posts });
    } catch (e) {
        console.error("FORUM GET ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.post("/api/forum/posts", async (req, res) => {
    const { content } = req.body;
    if (!content)
        return res.status(400).json({ success: false, message: "content required" });
    const handle = "Anonymous" + Math.floor(100 + Math.random() * 900);
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `INSERT INTO forum_posts (anon_handle, content) VALUES (:1, :2)`,
            [handle, content],
            { autoCommit: true }
        );
        const idResult = await conn.execute(
            `SELECT MAX(post_id) FROM forum_posts WHERE anon_handle = :1`,
            [handle]
        );
        const newPostId = idResult.rows[0][0];
        res.json({ success: true, post_id: newPostId, anon_handle: handle });
    } catch (e) {
        console.error("FORUM POST ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.patch("/api/forum/posts/:post_id/like", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `UPDATE forum_posts SET likes = likes + 1 WHERE post_id = :1`,
            [req.params.post_id],
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// Flag / unflag a post (admin only)
app.patch("/api/forum/posts/:post_id/flag", requireAdmin, async (req, res) => {
    const { flag } = req.body;   // 'Y' or 'N'
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `UPDATE forum_posts SET is_flagged = :1 WHERE post_id = :2`,
            [flag || "Y", req.params.post_id],
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.get("/api/forum/posts/:post_id/replies", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT reply_id,
                    DBMS_LOB.SUBSTR(content, 500, 1) AS content,
                    TO_CHAR(created_at, 'DD-Mon-YY HH:MI AM') AS created_at
             FROM forum_replies
             WHERE post_id = :1
             ORDER BY created_at ASC`,
            [req.params.post_id]
        );
        const replies = result.rows.map(r => ({
            reply_id: r[0], content: r[1], created_at: r[2]
        }));
        res.json({ success: true, replies });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.post("/api/forum/posts/:post_id/replies", async (req, res) => {
    const { content } = req.body;
    if (!content)
        return res.status(400).json({ success: false, message: "content required" });
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `INSERT INTO forum_replies (post_id, content) VALUES (:1, :2)`,
            [req.params.post_id, content],
            { autoCommit: true }
        );
        res.json({ success: true, message: "Reply posted." });
    } catch (e) {
        console.error("REPLY POST ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  RESOURCES
// ═════════════════════════════════════════════════════════════
const STATIC_RESOURCES = [
    { icon: "🧘", bg: "#E1F5EE", title: "Guided Meditation",   description: "5–20 min sessions for calm and focus",     tag: "Audio"       },
    { icon: "📖", bg: "#EEEDFE", title: "CBT Workbook",         description: "Evidence-based exercises for anxiety",     tag: "PDF"         },
    { icon: "🌬️", bg: "#E6F1FB", title: "Breathing Techniques", description: "Box breathing, 4-7-8 method and more",     tag: "Interactive" },
    { icon: "🎵", bg: "#FAEEDA", title: "Calm Playlist",        description: "Curated music for relaxation and focus",   tag: "Audio"       },
    { icon: "📝", bg: "#EAF3DE", title: "Stress Assessment",    description: "Understand your stress patterns with PSS", tag: "Test"        },
    { icon: "🌙", bg: "#FAECE7", title: "Sleep Hygiene Guide",  description: "Tips for better rest and sleep routine",   tag: "Article"     }
];

app.get("/api/resources", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT resource_id, icon, bg_color, title, description, tag
             FROM resources ORDER BY resource_id`
        );
        if (result.rows && result.rows.length > 0) {
            const rows = result.rows.map(r => ({
                resource_id: r[0], icon: r[1], bg: r[2],
                title: r[3], description: r[4], tag: r[5]
            }));
            return res.json({ success: true, resources: rows });
        }
        res.json({ success: true, resources: STATIC_RESOURCES });
    } catch (e) {
        // table may not exist — return static fallback silently
        res.json({ success: true, resources: STATIC_RESOURCES });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═════════════════════════════════════════════════════════════
app.get("/api/notifications/:user_id", async (req, res) => {
    let conn;
    try {
        conn = await getConn(); 
        const result = await conn.execute(
            `SELECT notif_id, message, is_read,
                    TO_CHAR(created_at, 'DD-Mon-YY HH:MI AM') AS created_at
             FROM notifications
             WHERE user_id = :1
             ORDER BY created_at DESC
             FETCH FIRST 20 ROWS ONLY`,
            [req.params.user_id]
        );
        const notifs = result.rows.map(r => ({
            notif_id:   r[0],
            message:    r[1],
            is_read:    r[2] === "Y",
            created_at: r[3]
        }));
        res.json({ success: true, notifications: notifs });
    } catch (e) {
        console.error("NOTIF GET ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

app.patch("/api/notifications/:user_id/read", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        await conn.execute(
            `UPDATE notifications SET is_read = 'Y' WHERE user_id = :1`,
            [req.params.user_id],
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ═════════════════════════════════════════════════════════════
//  COUNSELORS
// ═════════════════════════════════════════════════════════════
app.get("/api/counselors", async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const result = await conn.execute(
            `SELECT counselor_id, full_name, specialization, availability
             FROM counselors
             WHERE is_active = 'Y'
             ORDER BY counselor_id`
        );
        const rows = result.rows.map(r => ({
            counselor_id:   r[0],
            full_name:      r[1],
            specialization: r[2],
            availability:   r[3]
        }));
        res.json({ success: true, counselors: rows });
    } catch (e) {
        console.error("COUNSELORS GET ERROR:", e);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (conn) try { await conn.close(); } catch (_) {}
    }
});

// ─── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MindMate Backend Running ✅" });
});

// ─── Start server ─────────────────────────────────────────────
async function startServer() {
    try {
        const testConn = await connectDB();
        if (!testConn || typeof testConn.execute !== "function") {
            throw new Error(
                "connectDB() returned invalid connection. " +
                "Make sure db.js does: return await oracledb.getConnection(...)"
            );
        }
        await testConn.close();
        console.log("✔ Oracle Database Connected");

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log("💚 Server listening on port: " + PORT);
        });
    } catch (error) {
        console.error("❌ Fatal crash:", error);
        process.exit(1);
    }
}

process.on("uncaughtException", (err) => {
    console.error("⚠️ Uncaught exception:", err);
});

startServer();